from collections import defaultdict

import common


WINDOW = ("2026-05-01T00:00:00Z", "2026-06-01T00:00:00Z")


def main() -> None:
    by_model = defaultdict(lambda: {"sessions": 0, "input_tokens": 0, "output_tokens": 0})
    skipped_null_timestamp = 0
    for env in common.iter_traces():
        ts = common.trace_window_ts(env)
        if not ts:
            skipped_null_timestamp += 1
            continue
        if not common.in_window(ts, WINDOW):
            continue
        model = ((env.get("record") or {}).get("agent") or {}).get("model") or "<unknown>"
        toks = common.trace_tokens(env)
        row = by_model[model]
        row["sessions"] += 1
        row["input_tokens"] += toks["input"]
        row["output_tokens"] += toks["output"]

    gold = [
        {"model": model, **values}
        for model, values in sorted(by_model.items(), key=lambda item: item[0])
    ]
    common.emit(
        gold,
        {
            "window": {"start": WINDOW[0], "end": WINDOW[1], "mode": "inclusive_exclusive"},
            "skipped_null_timestamp": skipped_null_timestamp,
        },
    )


if __name__ == "__main__":
    main()
