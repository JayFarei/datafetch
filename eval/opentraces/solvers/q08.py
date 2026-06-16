import common


WINDOW = ("2026-05-01T00:00:00Z", "2026-06-01T00:00:00Z")
NEEDLE = "observer"


def main() -> None:
    trace_ids = set()
    paths = set()
    patch_events = 0
    for event in common.iter_events(types={"trace_patch_created"}, window=WINDOW):
        payload = event.get("payload") or {}
        path = payload.get("file_path") or payload.get("path") or ""
        if NEEDLE not in path.lower():
            continue
        patch_events += 1
        paths.add(path)
        if event.get("trace_id"):
            trace_ids.add(event["trace_id"])

    traces_by_id = {env["trace_id"]: env for env in common.iter_traces()}
    total_tokens = 0
    missing_envelopes = []
    for trace_id in sorted(trace_ids):
        env = traces_by_id.get(trace_id)
        if env is None:
            missing_envelopes.append(trace_id)
            continue
        toks = common.trace_tokens(env)
        total_tokens += toks["input"] + toks["output"]
    common.emit(
        {
            "session_count": len(trace_ids),
            "total_input_output_tokens": total_tokens,
        },
        {
            "window": {"start": WINDOW[0], "end": WINDOW[1], "mode": "inclusive_exclusive"},
            "matched_patch_events": patch_events,
            "matched_paths": sorted(paths),
            "session_ids": sorted(trace_ids),
            "population": "trace ids present in matching frozen event-log patch rows",
            "missing_envelopes": missing_envelopes,
        },
    )


if __name__ == "__main__":
    main()
