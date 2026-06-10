from collections import Counter

import common


def main() -> None:
    groups = {
        "shareable": {"session_count": 0, "privacy_tiers": Counter()},
        "not_shareable": {"session_count": 0, "privacy_tiers": Counter()},
    }
    for env in common.iter_traces():
        security = common.security_state(env)
        group_name = "shareable" if bool(security.get("syncable")) else "not_shareable"
        groups[group_name]["session_count"] += 1
        groups[group_name]["privacy_tiers"][security.get("privacy_tier") or "<missing>"] += 1

    gold = {}
    for group_name, values in groups.items():
        gold[group_name] = {
            "session_count": values["session_count"],
            "privacy_tiers": [
                {"tier": tier, "sessions": count}
                for tier, count in sorted(values["privacy_tiers"].items())
            ],
        }
    common.emit(gold, {"population": "all pointer-resolved trace envelopes"})


if __name__ == "__main__":
    main()
