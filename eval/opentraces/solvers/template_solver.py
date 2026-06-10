"""Reference solvers for plan 011 persona templates.

All reads go through ``common.py`` so the frozen snapshot and current-pointer
rules are centralised. The module is importable for fast pack generation, while
each template also has a thin CLI entrypoint for the solver contract.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Any

import common


def _window(params: dict[str, Any]):
    win = params.get("window")
    if not win:
        return None
    return (win["start"], win["end"])


def _window_label(params: dict[str, Any]) -> str:
    win = params.get("window") or {}
    return win.get("label") or f"{win.get('start')} to {win.get('end')}"


@lru_cache(maxsize=1)
def traces() -> tuple[dict[str, Any], ...]:
    return tuple(common.iter_traces())


@lru_cache(maxsize=1)
def trace_by_id() -> dict[str, dict[str, Any]]:
    return {env["trace_id"]: env for env in traces()}


@lru_cache(maxsize=1)
def trace_ids_by_session_id() -> dict[str, list[str]]:
    out: dict[str, list[str]] = defaultdict(list)
    for env in traces():
        sid = record(env).get("session_id")
        if sid:
            out[str(sid)].append(env["trace_id"])
    return {sid: sorted(ids) for sid, ids in out.items()}


@lru_cache(maxsize=None)
def events_of_types(types_key: tuple[str, ...]) -> tuple[dict[str, Any], ...]:
    return tuple(common.iter_events(types=set(types_key)))


def events(*types: str) -> tuple[dict[str, Any], ...]:
    return events_of_types(tuple(sorted(types)))


def record(env: dict[str, Any]) -> dict[str, Any]:
    return env.get("record") or {}


def project(env: dict[str, Any]) -> str:
    return env.get("project_slug") or record(env).get("project_slug") or "<unknown>"


def model(env: dict[str, Any]) -> str:
    return ((record(env).get("agent") or {}).get("model") or "<unknown>")


def outcome(env: dict[str, Any]) -> dict[str, Any]:
    return record(env).get("outcome") or {}


def committed(env: dict[str, Any]) -> bool:
    return bool(outcome(env).get("committed"))


def started_in(env: dict[str, Any], params: dict[str, Any]) -> bool:
    ts = common.trace_window_ts(env)
    return bool(ts and common.in_window(ts, _window(params)))


def total_tokens(env: dict[str, Any]) -> int:
    toks = common.trace_tokens(env)
    return toks["input"] + toks["output"]


def token_row(env: dict[str, Any]) -> dict[str, int]:
    toks = common.trace_tokens(env)
    return {
        "input_tokens": toks["input"],
        "output_tokens": toks["output"],
        "cache_read_tokens": toks["cache_read"],
        "cache_write_tokens": toks["cache_creation"],
    }


def skill_names(env: dict[str, Any]) -> list[str]:
    out = []
    for invocation in common.skill_invocations(env):
        if isinstance(invocation, dict):
            name = invocation.get("skill_name") or invocation.get("skill") or invocation.get("name")
        else:
            name = str(invocation)
        if name:
            out.append(str(name))
    return out


def has_skill(env: dict[str, Any], skill: str) -> bool:
    return skill in skill_names(env)


def fraction(numerator: int, denominator: int) -> dict[str, Any]:
    return {
        "numerator": numerator,
        "denominator": denominator,
        "value": round(numerator / denominator, 6) if denominator else 0.0,
    }


def mean(values: list[float]) -> float | None:
    if not values:
        return None
    return round(sum(values) / len(values), 6)


def date_key(env: dict[str, Any]) -> str:
    return common.parse_ts(common.trace_window_ts(env)).date().isoformat()


def week_key(env: dict[str, Any]) -> str:
    d = common.parse_ts(common.trace_window_ts(env)).date()
    monday = d.fromordinal(d.toordinal() - d.weekday())
    return monday.isoformat()


def path_contains(path: str, needle: str) -> bool:
    return needle in path


def patch_id_from_payload(payload: dict[str, Any]) -> str:
    value = payload.get("trace_patch_id") or payload.get("patch_id")
    if isinstance(value, dict):
        value = value.get("hex") or value.get("id")
    value = str(value or "")
    return value.removeprefix("tracepatch-sha256:")


def commit_from_anchor(event: dict[str, Any]) -> str:
    payload = event.get("payload") or {}
    commit_id = payload.get("commit_id") or {}
    return commit_id.get("hex") or payload.get("observed_ref") or ""


def env_session_ref(env: dict[str, Any]) -> dict[str, str | None]:
    return {"trace_id": env["trace_id"], "session_id": record(env).get("session_id")}


def _solve_p1_t1(params: dict[str, Any]):
    group_by = params["group_by"]
    grouped: dict[str, dict[str, int]] = defaultdict(
        lambda: {
            "sessions": 0,
            "input_tokens": 0,
            "output_tokens": 0,
            "cache_read_tokens": 0,
            "cache_write_tokens": 0,
        }
    )
    for env in traces():
        if not started_in(env, params):
            continue
        if group_by == "model":
            key = model(env)
        elif group_by == "project":
            key = project(env)
        elif group_by == "day":
            key = date_key(env)
        else:
            raise ValueError(f"unsupported group_by {group_by!r}")
        row = grouped[key]
        row["sessions"] += 1
        toks = token_row(env)
        for field, value in toks.items():
            row[field] += value
    rows = [{"group": key, **value} for key, value in sorted(grouped.items())]
    return rows, {"population": "pointer-resolved trace envelopes by record start time", "window": _window_label(params)}


def _solve_p1_t2(params: dict[str, Any]):
    threshold = float(params["threshold"])
    rows = []
    for env in traces():
        if not started_in(env, params):
            continue
        rate = common.trace_tokens(env).get("cache_hit_rate")
        if rate is not None and float(rate) < threshold:
            rows.append({**env_session_ref(env), "cache_hit_rate": round(float(rate), 6)})
    rows.sort(key=lambda row: (row["cache_hit_rate"], row["trace_id"]))
    return rows, {"threshold": threshold, "population": "sessions with non-null cache hit rate in the requested window"}


def _solve_p1_t3(params: dict[str, Any]):
    n = int(params["n"])
    rows = []
    for env in traces():
        if not started_in(env, params):
            continue
        toks = common.trace_tokens(env)
        steps = max(1, int(toks["steps"]))
        rows.append(
            {
                **env_session_ref(env),
                "fresh_input_tokens_per_step": round(toks["input"] / steps, 6),
                "input_tokens": toks["input"],
                "steps": toks["steps"],
            }
        )
    rows.sort(key=lambda row: (-row["fresh_input_tokens_per_step"], row["trace_id"]))
    return rows[:n], {"population": "sessions in requested window", "rank_rule": "total_input_tokens / max(1,total_steps)"}


def _solve_p1_t4(params: dict[str, Any]):
    pct = float(params["percent"])
    by_day: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for env in traces():
        if started_in(env, params):
            by_day[date_key(env)].append(env)
    if not by_day:
        return {"day": None, "sessions": []}, {"population": "no sessions in requested window"}
    day_totals = {day: sum(total_tokens(env) for env in envs) for day, envs in by_day.items()}
    top_day = sorted(day_totals, key=lambda day: (-day_totals[day], day))[0]
    threshold = day_totals[top_day] * pct
    sessions = []
    for env in by_day[top_day]:
        tokens = total_tokens(env)
        if tokens >= threshold:
            sessions.append({**env_session_ref(env), "input_output_tokens": tokens})
    sessions.sort(key=lambda row: (-row["input_output_tokens"], row["trace_id"]))
    return {
        "day": top_day,
        "day_input_output_tokens": day_totals[top_day],
        "threshold_tokens": round(threshold, 6),
        "sessions": sessions,
    }, {"population": "sessions in requested window grouped by UTC start date"}


def _solve_p1_t5(params: dict[str, Any]):
    wanted_model = params["model"]
    max_steps = int(params["max_steps"])
    rows = []
    for env in traces():
        toks = common.trace_tokens(env)
        if (
            started_in(env, params)
            and model(env) == wanted_model
            and committed(env)
            and int(toks["steps"]) <= max_steps
        ):
            rows.append({**env_session_ref(env), "steps": toks["steps"]})
    rows.sort(key=lambda row: (row["steps"], row["trace_id"]))
    return rows, {"model": wanted_model, "max_steps": max_steps, "population": "sessions in requested window"}


def _solve_p1_t6(params: dict[str, Any]):
    wanted_skill = params["skill"]
    yes: list[int] = []
    no: list[int] = []
    for env in traces():
        if not started_in(env, params):
            continue
        (yes if has_skill(env, wanted_skill) else no).append(total_tokens(env))
    return {
        "skill": wanted_skill,
        "invoked": {"sessions": len(yes), "mean_input_output_tokens": mean(yes)},
        "not_invoked": {"sessions": len(no), "mean_input_output_tokens": mean(no)},
    }, {"population": "sessions in requested window split by skill membership"}


def _solve_p1_t7(params: dict[str, Any]):
    wanted_model = params["model"]
    matches = [env_session_ref(env) for env in traces() if started_in(env, params) and model(env) == wanted_model]
    if matches:
        return {"abstain": False, "matches": matches, "input_output_tokens": sum(total_tokens(trace_by_id()[row["trace_id"]]) for row in matches)}, {
            "absence_proof": "model was present",
            "match_count": len(matches),
        }
    return {"abstain": True, "reason": f"no sessions used {wanted_model} in the requested window"}, {
        "absence_proof": "scanned all pointer-resolved trace envelopes in requested window",
        "checked_model": wanted_model,
    }


def _solve_p2_t1(params: dict[str, Any]):
    counts: Counter[str] = Counter()
    sessions: Counter[str] = Counter()
    for env in traces():
        if not started_in(env, params):
            continue
        names = skill_names(env)
        counts.update(names)
        for name in set(names):
            sessions[name] += 1
    rows = [
        {"skill": name, "invocations": count, "sessions": sessions[name]}
        for name, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    ]
    return rows, {"population": "sessions in requested window with skill invocation metadata"}


def _solve_p2_t2(params: dict[str, Any]):
    wanted_skill = params["skill"]
    envs = [env for env in traces() if started_in(env, params) and has_skill(env, wanted_skill)]
    committed_count = sum(1 for env in envs if committed(env))
    durations = [common.trace_tokens(env)["duration_s"] for env in envs]
    return {
        "skill": wanted_skill,
        "sessions_invoked": len(envs),
        "committed_fraction": fraction(committed_count, len(envs)),
        "mean_duration_seconds": mean(durations),
    }, {"population": "sessions in requested window invoking requested skill"}


def _solve_p2_t3(params: dict[str, Any]):
    wanted_skill = params["skill"]
    rows = [
        env_session_ref(env)
        for env in traces()
        if started_in(env, params) and has_skill(env, wanted_skill) and not committed(env)
    ]
    rows.sort(key=lambda row: row["trace_id"])
    return rows, {"population": "sessions in requested window invoking requested skill and not marked committed"}


def _solve_p2_t4(params: dict[str, Any]):
    wanted_skill = params["skill"]
    by_week: dict[str, list[int]] = defaultdict(list)
    for env in traces():
        if started_in(env, params) and has_skill(env, wanted_skill):
            by_week[week_key(env)].append(total_tokens(env))
    rows = [
        {"week_start": week, "sessions": len(values), "mean_input_output_tokens": mean(values)}
        for week, values in sorted(by_week.items())
    ]
    return rows, {"population": "sessions in requested window invoking requested skill, grouped by UTC week start"}


def _solve_p2_t5(params: dict[str, Any]):
    wanted_skill = params["skill"]
    co: Counter[str] = Counter()
    source_sessions = 0
    for env in traces():
        if not started_in(env, params):
            continue
        names = set(skill_names(env))
        if wanted_skill not in names:
            continue
        source_sessions += 1
        for name in names:
            if name != wanted_skill:
                co[name] += 1
    rows = [{"skill": name, "sessions": count} for name, count in sorted(co.items(), key=lambda item: (-item[1], item[0]))]
    return rows, {"population": "sessions in requested window invoking requested skill", "source_sessions": source_sessions}


def _solve_p2_t6(params: dict[str, Any]):
    wanted_skill = params["skill"]
    matches = [env_session_ref(env) for env in traces() if has_skill(env, wanted_skill)]
    if matches:
        return {"abstain": False, "matches": matches}, {"absence_proof": "skill was present", "match_count": len(matches)}
    return {"abstain": True, "reason": f"no sessions invoked {wanted_skill}"}, {
        "absence_proof": "scanned all pointer-resolved trace envelopes and skill invocation lists",
        "checked_skill": wanted_skill,
    }


def _solve_p3_t1(params: dict[str, Any]):
    grouped: dict[str, dict[str, Any]] = defaultdict(lambda: {"shareable": 0, "blocked": 0, "safety_tiers": Counter()})
    for env in traces():
        sec = common.security_state(env)
        row = grouped[project(env)]
        if bool(sec.get("syncable")):
            row["shareable"] += 1
        else:
            row["blocked"] += 1
        row["safety_tiers"][sec.get("privacy_tier") or "unknown"] += 1
    rows = []
    for proj, row in sorted(grouped.items()):
        rows.append(
            {
                "project": proj,
                "shareable": row["shareable"],
                "blocked": row["blocked"],
                "safety_tiers": [
                    {"tier": tier, "sessions": count}
                    for tier, count in sorted(row["safety_tiers"].items())
                ],
            }
        )
    return rows, {"population": "all pointer-resolved trace envelopes"}


def _solve_p3_t2(params: dict[str, Any]):
    wanted_project = params["project"]
    rows = []
    tiers: Counter[str] = Counter()
    for env in traces():
        if project(env) != wanted_project:
            continue
        sec = common.security_state(env)
        if not bool(sec.get("syncable")):
            tier = sec.get("privacy_tier") or "unknown"
            tiers[tier] += 1
            rows.append({**env_session_ref(env), "safety_tier": tier})
    rows.sort(key=lambda row: (row["safety_tier"], row["trace_id"]))
    return {"blocked_sessions": rows, "tier_breakdown": dict(sorted(tiers.items()))}, {
        "population": f"pointer-resolved envelopes for project {wanted_project}",
    }


def _solve_p3_t3(params: dict[str, Any]):
    redactions = 0
    flags = 0
    sessions = 0
    for env in traces():
        if not started_in(env, params):
            continue
        sessions += 1
        sec = common.security_state(env)
        redactions += int(sec.get("redactions_applied") or 0)
        flags += int(sec.get("flags_reviewed") or 0)
    return {"sessions": sessions, "redactions_applied": redactions, "flags_reviewed": flags}, {
        "population": "sessions in requested window",
    }


def _solve_p3_t4(params: dict[str, Any]):
    stale = []
    missing = []
    for env in traces():
        sec = common.security_state(env)
        if bool(sec.get("stale")):
            stale.append(env_session_ref(env))
        if not bool(sec.get("scanned")):
            missing.append(env_session_ref(env))
    stale.sort(key=lambda row: row["trace_id"])
    missing.sort(key=lambda row: row["trace_id"])
    return {"stale": stale, "missing": missing}, {"population": "all pointer-resolved trace envelopes"}


def _solve_p3_t5(params: dict[str, Any]):
    wanted_project = params["project"]
    envs = [env for env in traces() if project(env) == wanted_project and started_in(env, params)]
    envs.sort(key=lambda env: (common.trace_window_ts(env), env["trace_id"]))
    shareable = sum(1 for env in envs if bool(common.security_state(env).get("syncable")))
    tokens = sum(total_tokens(env) for env in envs)
    return {
        "project": wanted_project,
        "session_count": len(envs),
        "first_session_date": common.parse_ts(common.trace_window_ts(envs[0])).date().isoformat() if envs else None,
        "last_session_date": common.parse_ts(common.trace_window_ts(envs[-1])).date().isoformat() if envs else None,
        "input_output_tokens": tokens,
        "shareable_fraction": fraction(shareable, len(envs)),
    }, {"population": "project sessions in requested window"}


def _solve_p3_t6(params: dict[str, Any]):
    wanted_project = params["project"]
    matches = [env_session_ref(env) for env in traces() if project(env) == wanted_project]
    if matches:
        return {"abstain": False, "matches": matches}, {"absence_proof": "project was present", "match_count": len(matches)}
    return {"abstain": True, "reason": f"no sessions for project {wanted_project}"}, {
        "absence_proof": "scanned all pointer-resolved trace envelopes and project names",
        "checked_project": wanted_project,
    }


def _solve_p4_t1(params: dict[str, Any]):
    commit = params["commit"]
    matching = [event for event in events("git_anchor_created") if commit_from_anchor(event) == commit]
    trace_ids = sorted({event["trace_id"] for event in matching if event.get("trace_id")})
    sessions = []
    for trace_id in trace_ids:
        env = trace_by_id().get(trace_id)
        sessions.append(env_session_ref(env) if env is not None else {"trace_id": trace_id, "session_id": None})
    gold: dict[str, Any] = {"commit": commit, "sessions": sessions}
    if len(sessions) == 1:
        gold.update(sessions[0])
    return gold, {
        "population": "git anchor creation events in the frozen event log",
        "matching_anchor_events": len(matching),
        "event_ids": [event.get("event_id") for event in matching[:20]],
        "event_ids_truncated": len(matching) > 20,
    }


def _solve_p4_t2(params: dict[str, Any]):
    pattern = params["pattern"]
    matched_trace_ids: set[str] = set()
    patch_events = 0
    for event in events("trace_patch_created"):
        if not common.in_window(event.get("event_time", ""), _window(params)):
            continue
        payload = event.get("payload") or {}
        if path_contains(str(payload.get("file_path") or ""), pattern):
            patch_events += 1
            if event.get("trace_id"):
                matched_trace_ids.add(event["trace_id"])
    missing = sorted(tid for tid in matched_trace_ids if tid not in trace_by_id())
    present = sorted(tid for tid in matched_trace_ids if tid in trace_by_id())
    return {
        "session_count": len(matched_trace_ids),
        "input_output_tokens": sum(total_tokens(trace_by_id()[tid]) for tid in present),
        "session_ids": present,
        "missing_envelopes": missing,
    }, {
        "population": "trace ids present in matching frozen event-log patch rows",
        "matched_patch_events": patch_events,
    }


def _solve_p4_t3(params: dict[str, Any]):
    wanted_project = params["project"]
    envs = [env for env in traces() if project(env) == wanted_project and started_in(env, params)]
    trace_ids = {env["trace_id"] for env in envs}
    commits = set()
    anchor_events = 0
    for event in events("git_anchor_created"):
        if not common.in_window(event.get("event_time", ""), _window(params)):
            continue
        if event.get("trace_id") not in trace_ids:
            continue
        commit = commit_from_anchor(event)
        if commit:
            commits.add(commit)
        anchor_events += 1
    return {"sessions": len(envs), "anchored_commits": len(commits)}, {
        "population": "project sessions by record start time joined to frozen git anchor events",
        "anchor_events": anchor_events,
    }


def _solve_p4_t4(params: dict[str, Any]):
    created: set[str] = set()
    trace_ids: set[str] = set()
    for event in events("trace_patch_created"):
        if not common.in_window(event.get("event_time", ""), _window(params)):
            continue
        patch_id = patch_id_from_payload(event.get("payload") or {})
        if patch_id:
            created.add(patch_id)
        if event.get("trace_id"):
            trace_ids.add(event["trace_id"])
    anchored = set()
    for event in events("git_anchor_created"):
        patch_id = patch_id_from_payload(event.get("payload") or {})
        if patch_id in created:
            anchored.add(patch_id)
    return {"patches_created": len(created), "patches_anchored_to_git_commit": len(anchored)}, {
        "population": "frozen event-log patch rows in requested window",
        "trace_ids_with_patch_events": sorted(trace_ids),
    }


def _solve_p4_t5(params: dict[str, Any]):
    session_id = params["session_id"]
    trace_ids = params.get("trace_ids") or trace_ids_by_session_id().get(session_id, [])
    step_index = int(params["step_index"])
    rows = []
    event_ids = []
    for event in events("context_node_observed"):
        payload = event.get("payload") or {}
        if event.get("trace_id") not in trace_ids:
            continue
        if int(payload.get("step_index") if payload.get("step_index") is not None else event.get("step_index") or -1) != step_index:
            continue
        rows.append(
            {
                "trace_id": event.get("trace_id"),
                "node_id": payload.get("node_id"),
                "parent_node_id": payload.get("parent_node_id"),
                "capture_completeness": payload.get("capture_completeness"),
            }
        )
        event_ids.append(event.get("event_id"))
    rows.sort(key=lambda row: (row["trace_id"] or "", row["node_id"] or ""))
    return rows, {
        "population": "context observations in the frozen event log",
        "session_id": session_id,
        "trace_ids": trace_ids,
        "step_index": step_index,
        "event_ids": event_ids[:20],
        "event_ids_truncated": len(event_ids) > 20,
    }


def _solve_p4_t6(params: dict[str, Any]):
    needle = params["library"]
    rows = []
    for env in traces():
        if not started_in(env, params):
            continue
        patches = record(env).get("patches") or []
        patch_paths = [str(patch.get("file_path") or "") for patch in patches if isinstance(patch, dict)]
        task_desc = str((record(env).get("task") or {}).get("description") or "")
        matched_paths = sorted(path for path in patch_paths if needle in path)
        matched_task = needle in task_desc
        if matched_paths or matched_task:
            rows.append(
                {
                    **env_session_ref(env),
                    "input_output_tokens": total_tokens(env),
                    "matched_patch_paths": matched_paths,
                    "matched_task_description": matched_task,
                }
            )
    rows.sort(key=lambda row: (-row["input_output_tokens"], row["trace_id"]))
    return {
        "library": needle,
        "session_count": len(rows),
        "input_output_tokens": sum(row["input_output_tokens"] for row in rows),
        "sessions": rows,
    }, {"population": "sessions in requested window; exact substring rule over patch paths and task descriptions"}


def _solve_p4_t7(params: dict[str, Any]):
    commit = params["commit"]
    matching = [event for event in events("git_anchor_created") if commit_from_anchor(event) == commit]
    if matching:
        return {"abstain": False, "matches": sorted({event.get("trace_id") for event in matching if event.get("trace_id")})}, {
            "absence_proof": "commit was present in anchor events",
            "matching_anchor_events": len(matching),
        }
    return {"abstain": True, "reason": f"no captured session produced commit {commit}"}, {
        "absence_proof": "scanned all git anchor creation events for matching commit",
        "checked_commit": commit,
    }


SOLVERS = {
    "P1-T1": _solve_p1_t1,
    "P1-T2": _solve_p1_t2,
    "P1-T3": _solve_p1_t3,
    "P1-T4": _solve_p1_t4,
    "P1-T5": _solve_p1_t5,
    "P1-T6": _solve_p1_t6,
    "P1-T7": _solve_p1_t7,
    "P2-T1": _solve_p2_t1,
    "P2-T2": _solve_p2_t2,
    "P2-T3": _solve_p2_t3,
    "P2-T4": _solve_p2_t4,
    "P2-T5": _solve_p2_t5,
    "P2-T6": _solve_p2_t6,
    "P3-T1": _solve_p3_t1,
    "P3-T2": _solve_p3_t2,
    "P3-T3": _solve_p3_t3,
    "P3-T4": _solve_p3_t4,
    "P3-T5": _solve_p3_t5,
    "P3-T6": _solve_p3_t6,
    "P4-T1": _solve_p4_t1,
    "P4-T2": _solve_p4_t2,
    "P4-T3": _solve_p4_t3,
    "P4-T4": _solve_p4_t4,
    "P4-T5": _solve_p4_t5,
    "P4-T6": _solve_p4_t6,
    "P4-T7": _solve_p4_t7,
}


def solve(template_id: str, params: dict[str, Any]):
    try:
        solver = SOLVERS[template_id]
    except KeyError as exc:
        raise ValueError(f"unknown template id {template_id!r}") from exc
    return solver(params)


def solver_path(template_id: str) -> Path:
    return Path(__file__).resolve().with_name(f"{template_id.lower().replace('-', '_')}.py")
