"""Build plan 011 M4/M5 artifacts from the sealed snapshot."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
sys.path.insert(0, str(ROOT / "solvers"))
sys.path.insert(0, str(ROOT / "templates"))

import common  # noqa: E402
import template_solver  # noqa: E402
from pack_spec import TEMPLATE_BY_ID, TEMPLATES  # noqa: E402

WINDOWS = [
    {"label": "April 26 through May 1, 2026", "start": "2026-04-26T00:00:00Z", "end": "2026-05-02T00:00:00Z"},
    {"label": "May 2026", "start": "2026-05-01T00:00:00Z", "end": "2026-06-01T00:00:00Z"},
    {"label": "the week of May 17, 2026", "start": "2026-05-17T00:00:00Z", "end": "2026-05-24T00:00:00Z"},
    {"label": "the second half of May 2026", "start": "2026-05-16T00:00:00Z", "end": "2026-06-01T00:00:00Z"},
    {"label": "June 1 through June 10, 2026", "start": "2026-06-01T00:00:00Z", "end": "2026-06-11T00:00:00Z"},
    {"label": "May 5 through May 31, 2026", "start": "2026-05-05T00:00:00Z", "end": "2026-06-01T00:00:00Z"},
    {"label": "May 17 through June 10, 2026", "start": "2026-05-17T00:00:00Z", "end": "2026-06-11T00:00:00Z"},
    {"label": "the whole frozen capture", "start": "2026-03-27T00:00:00Z", "end": "2026-06-11T00:00:00Z"},
]

ABSENT_MODELS = [
    "google/gemini-2.5-pro",
    "google/gemini-2.5-flash",
    "meta/llama-4-scout",
    "mistral/magistral-medium",
    "xai/grok-4",
    "deepseek/deepseek-r2",
    "cohere/command-a",
    "amazon/nova-premier",
]

ABSENT_SKILLS = [
    "retired-cost-sentinel",
    "legacy-merge-whisperer",
    "unused-skill-reviewer",
    "shadow-release-auditor",
    "archived-skill-migrator",
    "prelaunch-doc-scribe",
    "obsolete-eval-driver",
    "sunset-rubric-fixer",
]

ABSENT_PROJECTS = [
    "absent-project-orchid",
    "absent-project-harbor",
    "absent-project-cobalt",
    "absent-project-aurora",
    "absent-project-copper",
    "absent-project-signal",
    "absent-project-canvas",
    "absent-project-lantern",
]

PATH_PATTERNS = ["observer", "tests", "src", "skill", "docs", "web", "hook", "trace"]
LIBRARIES = ["opentraces", "dataset", "skill", "bucket", "trace", "viewer", "workflow", "agent"]


def _json_dump(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def _yaml_scalar(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{text}"'


def _write_yaml_value(lines: list[str], key: str, value: Any, indent: int) -> None:
    pad = " " * indent
    if isinstance(value, dict):
        lines.append(f"{pad}{key}:")
        for child_key, child_value in value.items():
            _write_yaml_value(lines, child_key, child_value, indent + 2)
    elif isinstance(value, list):
        lines.append(f"{pad}{key}:")
        for item in value:
            lines.append(f"{pad}  - {_yaml_scalar(item)}")
    else:
        lines.append(f"{pad}{key}: {_yaml_scalar(value)}")


def write_pack_yaml() -> None:
    lines = ["templates:"]
    for template in TEMPLATES:
        lines.append(f"  - id: {template['id']}")
        for key in ("persona", "slots", "answer_type", "tolerance", "difficulty", "solver", "question_template"):
            _write_yaml_value(lines, key, template[key], 4)
    (ROOT / "templates" / "pack.yaml").write_text("\n".join(lines) + "\n")


def all_traces() -> list[dict[str, Any]]:
    return list(template_solver.traces())


def all_events(*types: str) -> tuple[dict[str, Any], ...]:
    return template_solver.events(*types)


def top_models() -> list[str]:
    counts = Counter(template_solver.model(env) for env in all_traces())
    return [name for name, _ in counts.most_common() if name not in {"<unknown>", "<synthetic>"}][:8]


def top_projects() -> list[str]:
    counts = Counter(template_solver.project(env) for env in all_traces())
    return [name for name, _ in counts.most_common(8)]


def top_skills() -> list[str]:
    counts: Counter[str] = Counter()
    for env in all_traces():
        counts.update(template_solver.skill_names(env))
    return [name for name, _ in counts.most_common(8)]


def anchor_commits() -> list[str]:
    by_commit: dict[str, set[str]] = defaultdict(set)
    for event in all_events("git_anchor_created"):
        commit = template_solver.commit_from_anchor(event)
        if commit and event.get("trace_id"):
            by_commit[commit].add(event["trace_id"])
    unique = [commit for commit, tids in by_commit.items() if len(tids) == 1]
    return sorted(unique)[:8]


def absent_commits(present: set[str]) -> list[str]:
    out = []
    for i in range(1, 200):
        candidate = (f"{i:040x}")[-40:]
        if candidate not in present:
            out.append(candidate)
        if len(out) == 8:
            return out
    raise RuntimeError("could not create absent commits")


def context_params() -> list[dict[str, Any]]:
    seen = []
    session_counts = Counter()
    for ids in template_solver.trace_ids_by_session_id().values():
        for trace_id in ids:
            session_counts[trace_id] += 1
    for event in all_events("context_node_observed"):
        trace_id = event.get("trace_id")
        if not trace_id or trace_id not in template_solver.trace_by_id():
            continue
        env = template_solver.trace_by_id()[trace_id]
        session_id = template_solver.record(env).get("session_id")
        if not session_id:
            continue
        payload = event.get("payload") or {}
        step_index = payload.get("step_index")
        if step_index is None:
            step_index = event.get("step_index")
        if step_index is None:
            continue
        item = {"session_id": session_id, "trace_ids": [trace_id], "step_index": int(step_index)}
        key = (item["session_id"], item["step_index"], trace_id)
        if key not in seen:
            seen.append(key)
            yield item


def p(template_id: str, **params: Any) -> dict[str, Any]:
    return {"template_id": template_id, "params": params}


def draws() -> list[dict[str, Any]]:
    models = top_models()
    projects = top_projects()
    skills = top_skills()
    commits = anchor_commits()
    fake_commits = absent_commits(set(commits))
    ctx = list(context_params())[:8]
    if len(ctx) < 8:
        raise RuntimeError("not enough context observation instances")

    out = []
    for i, group in enumerate(["model", "project", "day", "model", "project", "day", "model", "project"]):
        out.append(p("P1-T1", group_by=group, window=WINDOWS[i]))
    for i, threshold in enumerate([0.5, 0.7, 0.8, 0.9, 0.95, 0.98, 0.99, 1.0]):
        out.append(p("P1-T2", threshold=threshold, window=WINDOWS[i]))
    for i, n in enumerate([3, 5, 7, 10, 12, 15, 20, 25]):
        out.append(p("P1-T3", n=n, window=WINDOWS[i]))
    for i, pct in enumerate([0.05, 0.1, 0.15, 0.2, 0.08, 0.12, 0.18, 0.25]):
        out.append(p("P1-T4", percent=pct, window=WINDOWS[i]))
    for i in range(8):
        out.append(p("P1-T5", model=models[i % len(models)], max_steps=[5, 10, 15, 20, 30, 50, 75, 100][i], window=WINDOWS[i]))
    for i in range(8):
        out.append(p("P1-T6", skill=skills[i % len(skills)], window=WINDOWS[i]))
    for i in range(8):
        out.append(p("P1-T7", model=ABSENT_MODELS[i], window=WINDOWS[i]))

    for i in range(8):
        out.append(p("P2-T1", window=WINDOWS[i]))
    for i in range(8):
        out.append(p("P2-T2", skill=skills[i % len(skills)], window=WINDOWS[i]))
    for i in range(8):
        out.append(p("P2-T3", skill=skills[i % len(skills)], window=WINDOWS[i]))
    for i in range(8):
        out.append(p("P2-T4", skill=skills[i % len(skills)], window=WINDOWS[i]))
    for i in range(8):
        out.append(p("P2-T5", skill=skills[i % len(skills)], window=WINDOWS[i]))
    for i in range(8):
        out.append(p("P2-T6", skill=ABSENT_SKILLS[i]))

    for i in range(8):
        out.append(p("P3-T1", scope="whole_snapshot", draw=i))
    for i in range(8):
        out.append(p("P3-T2", project=projects[i % len(projects)]))
    for i in range(8):
        out.append(p("P3-T3", window=WINDOWS[i]))
    for i in range(8):
        out.append(p("P3-T4", scope="whole_snapshot", draw=i))
    for i in range(8):
        out.append(p("P3-T5", project=projects[i % len(projects)], window=WINDOWS[i]))
    for i in range(8):
        out.append(p("P3-T6", project=ABSENT_PROJECTS[i]))

    for i in range(8):
        out.append(p("P4-T1", commit=commits[i % len(commits)]))
    for i in range(8):
        out.append(p("P4-T2", pattern=PATH_PATTERNS[i], window=WINDOWS[i]))
    for i in range(8):
        out.append(p("P4-T3", project=projects[i % len(projects)], window=WINDOWS[i]))
    for i in range(8):
        out.append(p("P4-T4", window=WINDOWS[i]))
    for item in ctx:
        out.append(p("P4-T5", **item))
    for i in range(8):
        out.append(p("P4-T6", library=LIBRARIES[i], window=WINDOWS[i]))
    for i in range(8):
        out.append(p("P4-T7", commit=fake_commits[i]))
    return out


def format_question(template_id: str, params: dict[str, Any]) -> str:
    template = TEMPLATE_BY_ID[template_id]["question_template"]
    values = dict(params)
    if "window" in params:
        values["window_label"] = params["window"]["label"]
    if "group_by" in params:
        values["group_label"] = {"model": "model", "project": "project", "day": "UTC start day"}[params["group_by"]]
    if "percent" in params:
        values["percent_label"] = f"{params['percent'] * 100:g}%"
    if template_id == "P4-T5":
        values["session_label"] = params["session_id"]
        values["step_label"] = params["step_index"]
    return template.format(**values)


def build_questions() -> list[dict[str, Any]]:
    rows = []
    for index, draw in enumerate(draws(), start=1):
        template_id = draw["template_id"]
        params = draw["params"]
        gold, evidence = template_solver.solve(template_id, params)
        template = TEMPLATE_BY_ID[template_id]
        row = {
            "row_id": f"otc-{index:04d}",
            "question": format_question(template_id, params),
            "persona": template["persona"],
            "template_id": template_id,
            "params": params,
            "gold": gold,
            "answer_type": template["answer_type"],
            "evidence": evidence,
            "difficulty": template["difficulty"],
        }
        rows.append(row)
    return rows


def build_deny_list() -> list[str]:
    truth = (ROOT / "SCHEMA-TRUTH.md").read_text()
    tokens = set()
    for token in re.findall(r"`([^`]+)`", truth):
        if "/" in token or "_" in token or token.endswith(".json") or token.endswith(".jsonl.gz"):
            tokens.add(token)
    for token in re.findall(r"\b[a-z]+(?:_[a-z0-9]+)+\b", truth):
        tokens.add(token)
    for token in re.findall(r"`([a-z]+(?:_[a-z0-9]+)+)`", truth):
        tokens.add(token)
    extra = {
        "objects/traces/v1",
        "events/v1/batches",
        "current.json",
        "object_path",
        "trace_id",
        "content_hash",
        "record_hash",
        "context_node_id",
        "event_type",
        "git_anchor_created",
        "trace_patch_created",
        "context_node_observed",
        "SCHEMA-TRUTH.md",
        "vendor/schema-facts.json",
    }
    tokens.update(extra)
    allowed_consumer_words = {"input_output", "cache_read", "cache_write"}
    tokens.difference_update(allowed_consumer_words)
    return sorted(token for token in tokens if len(token) >= 4)


def leak_hits(rows: list[dict[str, Any]], deny_list: list[str]) -> list[dict[str, str]]:
    hits = []
    for row in rows:
        question = row["question"]
        for token in deny_list:
            if token in question:
                hits.append({"row_id": row["row_id"], "template_id": row["template_id"], "token": token, "question": question})
    return hits


def write_questions(rows: list[dict[str, Any]]) -> None:
    path = ROOT / "questions" / "pack.jsonl"
    with path.open("w") as f:
        for row in rows:
            f.write(json.dumps(row, sort_keys=True) + "\n")


def write_summary(rows: list[dict[str, Any]], deny_list: list[str], hits: list[dict[str, str]]) -> None:
    counts = Counter(row["template_id"] for row in rows)
    abstentions = sum(1 for row in rows if row["answer_type"] == "abstain")
    summary = {
        "row_count": len(rows),
        "template_count": len(counts),
        "rows_per_template": dict(sorted(counts.items())),
        "abstention_rows": abstentions,
        "abstention_fraction": round(abstentions / len(rows), 6),
        "leak_hits": hits,
        "leak_hit_count": len(hits),
        "deny_list_size": len(deny_list),
        "pack_sha256": hashlib.sha256((ROOT / "questions" / "pack.jsonl").read_bytes()).hexdigest()
        if (ROOT / "questions" / "pack.jsonl").exists()
        else None,
    }
    _json_dump(ROOT / "checks" / "pack-build-summary.json", summary)


def main() -> None:
    write_pack_yaml()
    rows = build_questions()
    write_questions(rows)
    deny_list = build_deny_list()
    (ROOT / "templates" / "deny-list.txt").write_text("\n".join(deny_list) + "\n")
    hits = leak_hits(rows, deny_list)
    write_summary(rows, deny_list, hits)
    if hits:
        for hit in hits[:20]:
            print(f"leak hit {hit['row_id']} {hit['token']}: {hit['question']}", file=sys.stderr)
        raise SystemExit(1)
    print(f"wrote {len(rows)} question rows across {len(TEMPLATES)} templates")


if __name__ == "__main__":
    main()
