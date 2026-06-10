import common


WINDOW = ("2026-05-17T00:00:00Z", "2026-05-24T00:00:00Z")


def normalize_patch_id(value: str | None) -> str | None:
    if not value:
        return None
    prefix = "tracepatch-sha256:"
    if value.startswith(prefix):
        return value[len(prefix):]
    return value


def patch_id(payload: dict) -> str | None:
    return normalize_patch_id(payload.get("trace_patch_id")) or normalize_patch_id(payload.get("patch_id"))


def main() -> None:
    created = []
    trace_ids = set()
    anchored_patch_ids = set()
    for event in common.iter_events(types={"trace_patch_created", "git_anchor_created"}):
        payload = event.get("payload") or {}
        pid = patch_id(payload)
        if event.get("event_type") == "trace_patch_created":
            if not common.in_window(event.get("event_time", ""), WINDOW):
                continue
            if pid:
                created.append(pid)
            if event.get("trace_id"):
                trace_ids.add(event["trace_id"])
        elif pid:
            anchored_patch_ids.add(pid)

    anchored_created = [pid for pid in created if pid in anchored_patch_ids]
    common.emit(
        {
            "patches_created": len(created),
            "patches_anchored_to_git_commit": len(anchored_created),
        },
        {
            "window": {"start": WINDOW[0], "end": WINDOW[1], "mode": "inclusive_exclusive"},
            "created_unique_patch_ids": len(set(created)),
            "anchored_unique_patch_ids": len(set(anchored_created)),
            "population": "frozen event-log patch rows",
            "trace_ids_with_patch_events": sorted(trace_ids),
        },
    )


if __name__ == "__main__":
    main()
