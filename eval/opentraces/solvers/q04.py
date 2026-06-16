from collections import Counter, defaultdict

import common


WINDOW = ("2026-05-01T00:00:00Z", "2026-06-01T00:00:00Z")


def skill_name(invocation: dict) -> str:
    return invocation.get("skill_name") or invocation.get("skill") or invocation.get("name") or ""


def main() -> None:
    invocation_counts = Counter()
    sessions_by_skill = defaultdict(set)
    traces_by_id = {}
    skipped_null_timestamp = 0
    for env in common.iter_traces():
        ts = common.trace_window_ts(env)
        if not ts:
            skipped_null_timestamp += 1
            continue
        if not common.in_window(ts, WINDOW):
            continue
        traces_by_id[env["trace_id"]] = env
        for invocation in common.skill_invocations(env):
            name = skill_name(invocation)
            if not name:
                continue
            invocation_counts[name] += 1
            sessions_by_skill[name].add(env["trace_id"])

    top_skill, invocation_count = sorted(
        invocation_counts.items(), key=lambda item: (-item[1], item[0])
    )[0]
    session_ids = sorted(sessions_by_skill[top_skill])
    committed = 0
    durations = []
    for trace_id in session_ids:
        env = traces_by_id[trace_id]
        outcome = ((env.get("record") or {}).get("outcome") or {})
        if bool(outcome.get("committed")):
            committed += 1
        durations.append(common.trace_tokens(env)["duration_s"])
    session_count = len(session_ids)
    mean_duration = sum(durations) / session_count if session_count else 0.0
    common.emit(
        {
            "skill": top_skill,
            "invocations": invocation_count,
            "sessions_invoked": session_count,
            "committed_fraction": {
                "numerator": committed,
                "denominator": session_count,
                "value": round(committed / session_count, 6) if session_count else 0,
            },
            "mean_duration_seconds": round(mean_duration, 2),
        },
        {
            "window": {"start": WINDOW[0], "end": WINDOW[1], "mode": "inclusive_exclusive"},
            "session_ids": session_ids,
            "skipped_null_timestamp": skipped_null_timestamp,
        },
    )


if __name__ == "__main__":
    main()
