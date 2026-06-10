"""Plan 011: shared snapshot readers for reference solvers.

Every solver imports from here and reads ONLY the frozen snapshot. Stdlib only.
Determinism contract: all iterators yield in sorted path order; no wall-clock,
no randomness, no network. The current.json pointer is authoritative for which
envelope body is current (SCHEMA-TRUTH section 7).
"""
import gzip
import json
from datetime import datetime, timezone
from pathlib import Path

SNAP = Path(__file__).resolve().parents[1] / "vendor" / "snapshot"
TRACES_ROOT = SNAP / "objects" / "traces" / "v1"
BATCHES_ROOT = SNAP / "events" / "v1" / "batches"


def parse_ts(ts: str) -> datetime:
    """Normalise the snapshot's mixed 'Z' / '+00:00' timestamp suffixes."""
    if ts is None:
        raise ValueError("null timestamp")
    return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(timezone.utc)


def in_window(ts: str, window) -> bool:
    """window = (start_iso, end_iso) inclusive-exclusive, or None for all."""
    if window is None:
        return True
    t = parse_ts(ts)
    return parse_ts(window[0]) <= t < parse_ts(window[1])


def iter_traces(project: str | None = None):
    """Yield current envelope dicts (pointer-resolved), sorted by path."""
    for cur in sorted(TRACES_ROOT.glob("*/*/current.json")):
        ptr = json.loads(cur.read_text())
        if project is not None and ptr.get("project_slug") != project:
            continue
        body = SNAP / ptr["object_path"]
        yield json.loads(body.read_text())


def trace_window_ts(env: dict) -> str | None:
    return (env.get("record") or {}).get("timestamp_start")


def trace_tokens(env: dict) -> dict:
    """Token ledger for one trace. estimated_cost_usd is null in this snapshot;
    cost questions are always answered from these token fields."""
    m = (env.get("record") or {}).get("metrics") or {}
    return {
        "input": m.get("total_input_tokens") or 0,
        "output": m.get("total_output_tokens") or 0,
        "cache_read": m.get("total_cache_read_tokens") or 0,
        "cache_creation": m.get("total_cache_creation_tokens") or 0,
        "steps": m.get("total_steps") or 0,
        "duration_s": m.get("total_duration_s") or 0.0,
        "cache_hit_rate": m.get("cache_hit_rate"),
    }


def skill_invocations(env: dict) -> list:
    return ((env.get("record") or {}).get("metadata") or {}).get("skill_invocations") or []


def security_state(env: dict) -> dict:
    return env.get("security") or {}


def iter_events(types=None, trace_id: str | None = None, window=None):
    """Stream event rows from all batches in filename (sequence) order.

    types: set/list of event_type to keep, or None for all.
    window: (start_iso, end_iso) on event_time, or None.
    """
    keep = set(types) if types else None
    for batch in sorted(BATCHES_ROOT.glob("*.jsonl.gz")):
        with gzip.open(batch, "rt") as f:
            for line in f:
                e = json.loads(line)
                if keep and e.get("event_type") not in keep:
                    continue
                if trace_id and e.get("trace_id") != trace_id:
                    continue
                if window and not in_window(e.get("event_time", ""), window):
                    continue
                yield e


def event_covered_trace_ids() -> set:
    """The ~423-trace subset the event log covers (SCHEMA-TRUTH section 3).
    Event-joined solvers must state their population in terms of this set."""
    return {e["trace_id"] for e in iter_events() if e.get("trace_id")}


def emit(gold, evidence: dict):
    """Solver output contract: single JSON object on stdout, sorted keys."""
    print(json.dumps({"gold": gold, "evidence": evidence}, sort_keys=True, default=str))
