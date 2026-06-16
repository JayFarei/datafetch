from collections import defaultdict

import common


WINDOW = ("2026-05-01T00:00:00Z", "2026-06-01T00:00:00Z")


def main() -> None:
    by_project = defaultdict(list)
    skipped_null_timestamp = 0
    for env in common.iter_traces():
        ts = common.trace_window_ts(env)
        if not ts:
            skipped_null_timestamp += 1
            continue
        if common.in_window(ts, WINDOW):
            by_project[env.get("project_slug") or "<unknown>"].append(env)

    project, traces = sorted(
        by_project.items(), key=lambda item: (-len(item[1]), item[0])
    )[0]
    sorted_traces = sorted(traces, key=lambda env: (common.trace_window_ts(env), env["trace_id"]))
    total_tokens = 0
    shareable = 0
    for env in traces:
        toks = common.trace_tokens(env)
        total_tokens += toks["input"] + toks["output"]
        if bool(common.security_state(env).get("syncable")):
            shareable += 1
    count = len(traces)
    common.emit(
        {
            "project": project,
            "session_count": count,
            "first_session_date": common.parse_ts(common.trace_window_ts(sorted_traces[0])).date().isoformat(),
            "last_session_date": common.parse_ts(common.trace_window_ts(sorted_traces[-1])).date().isoformat(),
            "total_input_output_tokens": total_tokens,
            "shareable_fraction": {
                "numerator": shareable,
                "denominator": count,
                "value": round(shareable / count, 6) if count else 0,
            },
        },
        {
            "window": {"start": WINDOW[0], "end": WINDOW[1], "mode": "inclusive_exclusive"},
            "skipped_null_timestamp": skipped_null_timestamp,
        },
    )


if __name__ == "__main__":
    main()
