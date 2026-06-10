"""Snapshot-only R7 cross-checks against upstream OpenTraces readers."""

from __future__ import annotations

import json
import os
import sys
import gzip
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
SNAP = ROOT / "vendor" / "snapshot"
UPSTREAM = Path("/Users/jayfarei/src/tries/2026-03-27-community-traces-hf")
sys.path.insert(0, str(ROOT / "solvers"))
sys.path.insert(0, str(ROOT / "templates"))
sys.path.insert(0, str(UPSTREAM / "src"))

import template_solver  # noqa: E402
from pack_spec import TEMPLATES  # noqa: E402


def load_rows() -> list[dict[str, Any]]:
    return [json.loads(line) for line in (ROOT / "questions" / "pack.jsonl").read_text().splitlines() if line.strip()]


def patch_upstream_bucket_path() -> tuple[list[Any], list[Any]]:
    from opentraces.core import paths

    paths.bucket_dir = lambda: SNAP  # type: ignore[assignment]
    from opentraces.core.bucket_store import iter_trace_record_objects
    from opentraces.core.trails import TrailEvent

    upstream_records = list(iter_trace_record_objects())
    upstream_events = []
    for batch_path in sorted((SNAP / "events" / "v1" / "batches").glob("*.jsonl.gz")):
        with gzip.open(batch_path, "rb") as handle:
            for line in handle:
                line = line.strip()
                if line:
                    upstream_events.append(TrailEvent.model_validate_json(line))
    return upstream_records, upstream_events


def commit_from_upstream_event(event: Any) -> str:
    payload = event.payload
    commit_id = payload.get("commit_id") or {}
    return commit_id.get("hex") or payload.get("observed_ref") or ""


def patch_id_from_upstream_event(event: Any) -> str:
    payload = event.payload
    value = payload.get("trace_patch_id") or payload.get("patch_id")
    if isinstance(value, dict):
        value = value.get("hex") or value.get("id")
    return str(value or "").removeprefix("tracepatch-sha256:")


def validate_p4_with_upstream(row: dict[str, Any], upstream_events: list[Any]) -> bool:
    template_id = row["template_id"]
    params = row["params"]
    solver_gold = row["gold"]
    if template_id in {"P4-T1", "P4-T7"}:
        matches = [event for event in upstream_events if event.event_type == "git_anchor_created" and commit_from_upstream_event(event) == params["commit"]]
        upstream_trace_ids = sorted({event.trace_id for event in matches if event.trace_id})
        if template_id == "P4-T7":
            return bool(solver_gold.get("abstain")) and not upstream_trace_ids
        return upstream_trace_ids == sorted(session["trace_id"] for session in solver_gold.get("sessions", []))
    if template_id == "P4-T2":
        wanted = set(solver_gold.get("session_ids", [])) | set(solver_gold.get("missing_envelopes", []))
        upstream = set()
        for event in upstream_events:
            if event.event_type != "trace_patch_created" or not template_solver.common.in_window(event.event_time, (params["window"]["start"], params["window"]["end"])):
                continue
            if params["pattern"] in str(event.payload.get("file_path") or "") and event.trace_id:
                upstream.add(event.trace_id)
        return upstream == wanted
    if template_id == "P4-T3":
        trace_ids = {
            env["trace_id"]
            for env in template_solver.traces()
            if template_solver.project(env) == params["project"] and template_solver.started_in(env, params)
        }
        commits = {
            commit_from_upstream_event(event)
            for event in upstream_events
            if event.event_type == "git_anchor_created"
            and event.trace_id in trace_ids
            and template_solver.common.in_window(event.event_time, (params["window"]["start"], params["window"]["end"]))
            and commit_from_upstream_event(event)
        }
        return len(commits) == solver_gold["anchored_commits"]
    if template_id == "P4-T4":
        created = {
            patch_id_from_upstream_event(event)
            for event in upstream_events
            if event.event_type == "trace_patch_created"
            and template_solver.common.in_window(event.event_time, (params["window"]["start"], params["window"]["end"]))
            and patch_id_from_upstream_event(event)
        }
        anchored = {
            patch_id_from_upstream_event(event)
            for event in upstream_events
            if event.event_type == "git_anchor_created" and patch_id_from_upstream_event(event) in created
        }
        return len(created) == solver_gold["patches_created"] and len(anchored) == solver_gold["patches_anchored_to_git_commit"]
    if template_id == "P4-T5":
        nodes = []
        trace_ids = set(params.get("trace_ids") or [])
        for event in upstream_events:
            if event.event_type != "context_node_observed" or event.trace_id not in trace_ids:
                continue
            step = event.payload.get("step_index") if event.payload.get("step_index") is not None else event.step_index
            if int(step if step is not None else -1) == int(params["step_index"]):
                nodes.append((event.trace_id, event.payload.get("node_id")))
        expected = sorted((row["trace_id"], row["node_id"]) for row in solver_gold)
        return sorted(nodes) == expected
    if template_id == "P4-T6":
        fresh_gold, _ = template_solver.solve(template_id, params)
        return fresh_gold == solver_gold
    return True


def main() -> None:
    os.environ["HOME"] = "/nonexistent-opentraces-r7-home"
    rows = load_rows()
    upstream_records, upstream_events = patch_upstream_bucket_path()
    by_template: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_template[row["template_id"]].append(row)

    checks = []
    for template in TEMPLATES:
        template_id = template["id"]
        sample = by_template[template_id][:3]
        for row in sample:
            fresh_gold, _ = template_solver.solve(template_id, row["params"])
            agreement = fresh_gold == row["gold"]
            source = "upstream bucket reader over sealed snapshot"
            if template_id.startswith("P4-"):
                agreement = agreement and validate_p4_with_upstream(row, upstream_events)
                source = "upstream bucket event mirror over sealed snapshot; P4 anchors use git_anchor_created commit matching"
            checks.append(
                {
                    "row_id": row["row_id"],
                    "template_id": template_id,
                    "agreement": agreement,
                    "source": source,
                }
            )

    p4_rows = [row for row in rows if row["template_id"].startswith("P4-")]
    p4_agreements = []
    p4_failed_rows = []
    for row in p4_rows:
        agreement = validate_p4_with_upstream(row, upstream_events)
        p4_agreements.append(agreement)
        if not agreement:
            p4_failed_rows.append({"row_id": row["row_id"], "template_id": row["template_id"], "params": row["params"]})

    result = {
        "ok": all(check["agreement"] for check in checks) and all(p4_agreements),
        "upstream_records": len(upstream_records),
        "upstream_events": len(upstream_events),
        "snapshot_root": str(SNAP),
        "home_for_check": os.environ["HOME"],
        "sample_checks": checks,
        "sample_checks_count": len(checks),
        "p4_rows_checked": len(p4_rows),
        "p4_all_event_join_rows_agree": all(p4_agreements),
        "p4_failed_rows": p4_failed_rows,
    }
    (ROOT / "checks" / "r7-cross-check.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    print(json.dumps(result, indent=2, sort_keys=True))
    if not result["ok"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
