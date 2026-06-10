#!/usr/bin/env python3
"""Plan 011 M1: enumerate the frozen OpenTraces snapshot into machine-readable schema facts.

Reads ONLY eval/opentraces/vendor/snapshot/. Writes eval/opentraces/vendor/schema-facts.json
(vendor/ is gitignored; the committed SCHEMA-TRUTH.md quotes only vetted excerpts, R12).
Stdlib only. Deterministic output (sorted keys, no timestamps of its own).
"""
import gzip
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

SNAP = Path(__file__).resolve().parents[1] / "vendor" / "snapshot"
OUT = Path(__file__).resolve().parents[1] / "vendor" / "schema-facts.json"


def key_tree(obj, depth=0, max_depth=3):
    """Type-shape of a JSON value: dict keys to depth, scalar type names, no values."""
    if depth >= max_depth:
        return type(obj).__name__
    if isinstance(obj, dict):
        return {k: key_tree(v, depth + 1, max_depth) for k, v in sorted(obj.items())}
    if isinstance(obj, list):
        return [key_tree(obj[0], depth + 1, max_depth), f"len={len(obj)}"] if obj else []
    return type(obj).__name__


def merge_presence(counter, obj, prefix=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            path = f"{prefix}.{k}" if prefix else k
            counter[path] += 1
            if isinstance(v, dict) and prefix.count(".") < 3:
                merge_presence(counter, v, path)


def enumerate_traces():
    root = SNAP / "objects" / "traces" / "v1"
    facts = {
        "trace_count": 0,
        "projects": Counter(),
        "sources": Counter(),
        "models": Counter(),
        "lifecycles": Counter(),
        "privacy_tiers": Counter(),
        "syncable": Counter(),
        "committed": Counter(),
        "schema_versions": Counter(),
        "ts_min": None,
        "ts_max": None,
        "envelope_presence": Counter(),
        "record_presence_by_source": defaultdict(Counter),
        "step_key_sets": Counter(),
        "token_usage_keys": Counter(),
        "tool_call_keys": Counter(),
        "metrics_keys": Counter(),
        "skill_invocation_traces": 0,
        "patch_count_total": 0,
        "git_link_traces": 0,
        "step_count_total": 0,
        "sample_envelope_shape": None,
    }
    for cur in sorted(root.glob("*/*/current.json")):
        tdir = cur.parent
        try:
            # The pointer is authoritative: 1,376/1,592 dirs carry stale extra bodies
            # (SCHEMA-TRUTH section 7); glob-and-take-last reads pre-rescan envelopes.
            ptr = json.loads(cur.read_text())
            env = json.loads((SNAP / ptr["object_path"]).read_text())
        except Exception as e:
            facts.setdefault("read_errors", []).append(f"{tdir.name}: {type(e).__name__}")
            continue
        facts["trace_count"] += 1
        facts["projects"][env.get("project_slug", "?")] += 1
        rec = env.get("record", {}) or {}
        src = (rec.get("metadata") or {}).get("source", "?")
        facts["sources"][src] += 1
        facts["models"][(rec.get("agent") or {}).get("model") or "?"] += 1
        facts["lifecycles"][rec.get("lifecycle", "?")] += 1
        sec = env.get("security", {}) or {}
        facts["privacy_tiers"][sec.get("privacy_tier", "?")] += 1
        facts["syncable"][str(sec.get("syncable"))] += 1
        facts["committed"][str((rec.get("outcome") or {}).get("committed"))] += 1
        facts["schema_versions"][env.get("schema_version", "?")] += 1
        ts = rec.get("timestamp_start")
        if ts:
            facts["ts_min"] = min(facts["ts_min"] or ts, ts)
            facts["ts_max"] = max(facts["ts_max"] or ts, ts)
        merge_presence(facts["envelope_presence"], env)
        facts["record_presence_by_source"][src].update(
            k for k in (rec.keys() if isinstance(rec, dict) else [])
        )
        steps = rec.get("steps") or []
        facts["step_count_total"] += len(steps)
        for s in steps[:200]:
            facts["step_key_sets"][tuple(sorted(s.keys()))] += 1
            tu = s.get("token_usage")
            if isinstance(tu, dict):
                facts["token_usage_keys"].update(tu.keys())
            for tc in (s.get("tool_calls") or [])[:20]:
                if isinstance(tc, dict):
                    facts["tool_call_keys"].update(tc.keys())
        if isinstance(rec.get("metrics"), dict):
            facts["metrics_keys"].update(rec["metrics"].keys())
        if (rec.get("metadata") or {}).get("skill_invocations"):
            facts["skill_invocation_traces"] += 1
        facts["patch_count_total"] += len(rec.get("patches") or [])
        if rec.get("git_links"):
            facts["git_link_traces"] += 1
        if facts["sample_envelope_shape"] is None:
            facts["sample_envelope_shape"] = key_tree(env, max_depth=4)
    facts["step_key_sets"] = {" | ".join(k): v for k, v in facts["step_key_sets"].items()}
    facts["record_presence_by_source"] = {k: dict(v) for k, v in facts["record_presence_by_source"].items()}
    return facts


def enumerate_events():
    root = SNAP / "events" / "v1" / "batches"
    facts = {
        "batch_count": 0,
        "event_count": 0,
        "event_types": Counter(),
        "writers": Counter(),
        "schema_versions": Counter(),
        "payload_shapes_by_type": {},
        "time_range_by_schema_version": {},
        "distinct_trace_ids": 0,
        "top_fields": Counter(),
    }
    trace_ids = set()
    tranges = defaultdict(lambda: [None, None])
    for batch in sorted(root.glob("*.jsonl.gz")):
        facts["batch_count"] += 1
        try:
            with gzip.open(batch, "rt") as f:
                for line in f:
                    e = json.loads(line)
                    facts["event_count"] += 1
                    et = e.get("event_type", "?")
                    facts["event_types"][et] += 1
                    facts["writers"][e.get("writer", "?")] += 1
                    sv = e.get("SCHEMA_VERSION", "?")
                    facts["schema_versions"][sv] += 1
                    facts["top_fields"].update(e.keys())
                    t = e.get("event_time")
                    if t:
                        lo, hi = tranges[sv]
                        tranges[sv] = [min(lo or t, t), max(hi or t, t)]
                    tid = e.get("trace_id")
                    if tid:
                        trace_ids.add(tid)
                    shapes = facts["payload_shapes_by_type"].setdefault(et, [])
                    if len(shapes) < 2 and isinstance(e.get("payload"), dict):
                        kt = key_tree(e["payload"], max_depth=2)
                        if kt not in shapes:
                            shapes.append(kt)
        except Exception as exc:
            facts.setdefault("read_errors", []).append(f"{batch.name}: {type(exc).__name__}")
    facts["distinct_trace_ids"] = len(trace_ids)
    facts["time_range_by_schema_version"] = {k: v for k, v in sorted(tranges.items())}
    return facts


def enumerate_contexts_blobs():
    out = {}
    for name in ("contexts", "blobs"):
        root = SNAP / name
        if not root.exists():
            out[name] = "ABSENT"
            continue
        files = [p for p in root.rglob("*") if p.is_file()]
        out[name] = {
            "file_count": len(files),
            "bytes": sum(p.stat().st_size for p in files),
            "top_level": sorted(p.name for p in root.iterdir())[:10],
            "sample_relpaths": sorted(str(p.relative_to(root)) for p in files[:5]),
        }
        idx = root / "index.json"
        manifest_like = [p for p in files if p.name.endswith(".json")][:1]
        probe = idx if idx.exists() else (manifest_like[0] if manifest_like else None)
        if probe:
            try:
                out[name]["sample_json_shape"] = key_tree(json.loads(probe.read_text()), max_depth=3)
                out[name]["sample_json_file"] = str(probe.relative_to(SNAP))
            except Exception:
                pass
    return out


def main():
    if not SNAP.exists():
        sys.exit(f"snapshot missing at {SNAP}")
    facts = {
        "snapshot_root": str(SNAP),
        "manifest_shape": key_tree(json.loads((SNAP / "manifest.json").read_text()), max_depth=3),
        "traces": enumerate_traces(),
        "events": enumerate_events(),
        "contexts_blobs": enumerate_contexts_blobs(),
    }

    def default(o):
        if isinstance(o, Counter):
            return {str(k): v for k, v in o.most_common()}
        raise TypeError(type(o).__name__)

    OUT.write_text(json.dumps(facts, indent=1, sort_keys=True, default=default))
    print(f"WROTE {OUT}")
    print(f"traces={facts['traces']['trace_count']} events={facts['events']['event_count']} "
          f"types={len(facts['events']['event_types'])}")


if __name__ == "__main__":
    main()
