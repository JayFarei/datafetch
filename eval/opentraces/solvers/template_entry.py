"""Thin CLI wrapper for parameterised plan 011 solvers."""

from __future__ import annotations

import json
import sys

import common
from template_solver import solve


def main(template_id: str) -> None:
    if len(sys.argv) != 2:
        print(
            f"usage: python3 eval/opentraces/solvers/{template_id.lower().replace('-', '_')}.py '<json-params>'",
            file=sys.stderr,
        )
        raise SystemExit(2)
    try:
        params = json.loads(sys.argv[1])
    except json.JSONDecodeError as exc:
        print(f"invalid JSON params: {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
    if not isinstance(params, dict):
        print("params must be a JSON object", file=sys.stderr)
        raise SystemExit(2)
    gold, evidence = solve(template_id, params)
    common.emit(gold, evidence)

