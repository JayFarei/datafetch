import common


WINDOW = ("2026-05-01T00:00:00Z", "2026-06-01T00:00:00Z")


def main() -> None:
    rows = []
    skipped_null_timestamp = 0
    skipped_zero_steps = 0
    for env in common.iter_traces():
        ts = common.trace_window_ts(env)
        if not ts:
            skipped_null_timestamp += 1
            continue
        if not common.in_window(ts, WINDOW):
            continue
        toks = common.trace_tokens(env)
        steps = toks["steps"]
        if not steps:
            skipped_zero_steps += 1
            continue
        avg = toks["input"] / steps
        rows.append(
            {
                "session_id": env["trace_id"],
                "average_fresh_input_tokens_per_step": round(avg, 2),
                "input_tokens": toks["input"],
                "steps": steps,
            }
        )
    rows.sort(
        key=lambda row: (
            -row["average_fresh_input_tokens_per_step"],
            -row["input_tokens"],
            row["session_id"],
        )
    )
    common.emit(
        rows[:5],
        {
            "window": {"start": WINDOW[0], "end": WINDOW[1], "mode": "inclusive_exclusive"},
            "metric": "total_input_tokens / total_steps",
            "skipped_null_timestamp": skipped_null_timestamp,
            "skipped_zero_steps": skipped_zero_steps,
        },
    )


if __name__ == "__main__":
    main()
