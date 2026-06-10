from collections import defaultdict

import common


WINDOW = ("2026-05-01T00:00:00Z", "2026-06-01T00:00:00Z")


def main() -> None:
    totals_by_day = defaultdict(int)
    sessions_by_day = defaultdict(list)
    skipped_null_timestamp = 0
    for env in common.iter_traces():
        ts = common.trace_window_ts(env)
        if not ts:
            skipped_null_timestamp += 1
            continue
        if not common.in_window(ts, WINDOW):
            continue
        toks = common.trace_tokens(env)
        total = toks["input"] + toks["output"]
        day = common.parse_ts(ts).date().isoformat()
        totals_by_day[day] += total
        sessions_by_day[day].append((env["trace_id"], total))

    top_day, top_total = sorted(totals_by_day.items(), key=lambda item: (-item[1], item[0]))[0]
    threshold = top_total * 0.10
    contributors = []
    for trace_id, total in sessions_by_day[top_day]:
        if total >= threshold:
            contributors.append(
                {
                    "session_id": trace_id,
                    "tokens": total,
                    "share_of_day": round(total / top_total, 6),
                }
            )
    contributors.sort(key=lambda row: (-row["tokens"], row["session_id"]))
    common.emit(
        {
            "day": top_day,
            "day_tokens": top_total,
            "threshold_tokens": threshold,
            "sessions": contributors,
        },
        {
            "window": {"start": WINDOW[0], "end": WINDOW[1], "mode": "inclusive_exclusive"},
            "metric": "total_input_tokens + total_output_tokens",
            "skipped_null_timestamp": skipped_null_timestamp,
        },
    )


if __name__ == "__main__":
    main()
