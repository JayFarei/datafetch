"""Verification checks for plan 011 M4/M5 artifacts."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
sys.path.insert(0, str(ROOT / "solvers"))
sys.path.insert(0, str(ROOT / "templates"))

import template_solver  # noqa: E402
from pack_spec import TEMPLATE_BY_ID, TEMPLATES  # noqa: E402


def load_rows() -> list[dict[str, Any]]:
    return [json.loads(line) for line in (ROOT / "questions" / "pack.jsonl").read_text().splitlines() if line.strip()]


def canonical_output(template_id: str, params: dict[str, Any]) -> bytes:
    gold, evidence = template_solver.solve(template_id, params)
    return (json.dumps({"gold": gold, "evidence": evidence}, sort_keys=True, default=str) + "\n").encode()


def check_shape(rows: list[dict[str, Any]]) -> dict[str, Any]:
    ids = {template["id"] for template in TEMPLATES}
    counts = Counter(row["template_id"] for row in rows)
    missing = sorted(ids - set(counts))
    too_few = {tid: count for tid, count in counts.items() if count < 5}
    row_fields = {"question", "persona", "template_id", "params", "gold", "answer_type", "evidence", "difficulty"}
    malformed = [row.get("row_id") for row in rows if not row_fields <= set(row)]
    abstentions = sum(1 for row in rows if row["answer_type"] == "abstain")
    ok = not missing and not too_few and not malformed and len(rows) >= 200 and abstentions / len(rows) >= 0.10
    return {
        "ok": ok,
        "row_count": len(rows),
        "template_count": len(counts),
        "rows_per_template": dict(sorted(counts.items())),
        "missing_templates": missing,
        "templates_with_fewer_than_5_rows": too_few,
        "malformed_rows": malformed,
        "abstention_rows": abstentions,
        "abstention_fraction": round(abstentions / len(rows), 6),
    }


def check_determinism(rows: list[dict[str, Any]]) -> dict[str, Any]:
    mismatches = []
    digest = hashlib.sha256()
    for row in rows:
        first = canonical_output(row["template_id"], row["params"])
        second = canonical_output(row["template_id"], row["params"])
        if first != second:
            mismatches.append(row["row_id"])
        digest.update(row["row_id"].encode())
        digest.update(b"\0")
        digest.update(first)
    return {
        "ok": not mismatches,
        "rows_checked": len(rows),
        "mismatches": mismatches,
        "combined_output_sha256": digest.hexdigest(),
    }


def check_cli_usage() -> dict[str, Any]:
    failures = []
    solver_paths = [Path(template["solver"]) for template in TEMPLATES]
    solver_paths.append(Path("eval/opentraces/solvers/q07.py"))
    for path in solver_paths:
        proc = subprocess.run([sys.executable, str(path)], cwd=REPO, capture_output=True, text=True, check=False)
        if proc.returncode != 2 or "usage:" not in proc.stderr:
            failures.append({"solver": str(path), "returncode": proc.returncode, "stderr": proc.stderr[:200]})
    return {"ok": not failures, "solvers_checked": len(solver_paths), "failures": failures}


def check_leaks(rows: list[dict[str, Any]]) -> dict[str, Any]:
    deny_path = ROOT / "templates" / "deny-list.txt"
    deny_list = [line.strip() for line in deny_path.read_text().splitlines() if line.strip()]
    hits = []
    for row in rows:
        question = row["question"]
        for token in deny_list:
            if token in question:
                hits.append({"row_id": row["row_id"], "template_id": row["template_id"], "token": token})
    return {"ok": not hits, "deny_list_size": len(deny_list), "hit_count": len(hits), "hits": hits[:50]}


def main() -> None:
    rows = load_rows()
    result = {
        "shape": check_shape(rows),
        "determinism": check_determinism(rows),
        "cli_usage": check_cli_usage(),
        "leak_check": check_leaks(rows),
    }
    result["ok"] = all(section.get("ok") for section in result.values() if isinstance(section, dict))
    (ROOT / "checks" / "pack-check-summary.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    print(json.dumps(result, indent=2, sort_keys=True))
    if not result["ok"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

