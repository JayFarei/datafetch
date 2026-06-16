import sys

import common


def commit_from_event(event: dict) -> str:
    payload = event.get("payload") or {}
    commit_id = payload.get("commit_id") or {}
    return commit_id.get("hex") or payload.get("observed_ref") or ""


def main() -> None:
    if len(sys.argv) != 2:
        print("usage: python3 eval/opentraces/solvers/q07.py <commit-sha>", file=sys.stderr)
        raise SystemExit(2)
    wanted = sys.argv[1].strip()
    trace_ids = set()
    event_ids = []
    for event in common.iter_events(types={"git_anchor_created"}):
        if commit_from_event(event) != wanted:
            continue
        if event.get("trace_id"):
            trace_ids.add(event["trace_id"])
        event_ids.append(event.get("event_id"))
    common.emit(
        {"commit_sha": wanted, "session_ids": sorted(trace_ids)},
        {
            "matching_anchor_events": len(event_ids),
            "event_ids": event_ids[:20],
            "event_ids_truncated": len(event_ids) > 20,
        },
    )


if __name__ == "__main__":
    main()
