import common


WINDOW = ("2026-05-01T00:00:00Z", "2026-06-01T00:00:00Z")
NEEDLE = "gemini"


def main() -> None:
    matches = []
    skipped_null_timestamp = 0
    for env in common.iter_traces():
        ts = common.trace_window_ts(env)
        if not ts:
            skipped_null_timestamp += 1
            continue
        if not common.in_window(ts, WINDOW):
            continue
        model = (((env.get("record") or {}).get("agent") or {}).get("model") or "")
        if NEEDLE not in model.lower():
            continue
        toks = common.trace_tokens(env)
        matches.append(
            {
                "session_id": env["trace_id"],
                "model": model,
                "input_output_tokens": toks["input"] + toks["output"],
            }
        )
    total = sum(row["input_output_tokens"] for row in matches)
    common.emit(
        {
            "answer": "none",
            "matching_sessions": len(matches),
            "total_input_output_tokens": total,
            "models": sorted({row["model"] for row in matches}),
        },
        {
            "window": {"start": WINDOW[0], "end": WINDOW[1], "mode": "inclusive_exclusive"},
            "matched_session_ids": [row["session_id"] for row in sorted(matches, key=lambda row: row["session_id"])],
            "skipped_null_timestamp": skipped_null_timestamp,
        },
    )


if __name__ == "__main__":
    main()
