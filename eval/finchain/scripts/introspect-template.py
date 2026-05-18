#!/usr/bin/env python3
"""Introspect a FinChain template instance and emit JSON.

Used by the TypeScript mount adapter (src/eval/finchainRecords.ts) to
materialise an EvalRecord per (topic, template_index, seed_index)
without per-template hardcoding. The TS side spawns this script once
per record, parses the JSON output.

Usage:
  python3 introspect-template.py \
      --topic <domain>/<topic_basename> \
      --template-index <1-5> \
      --seed-index <int> \
      [--vendor-dir <path>]

Output (stdout): one JSON object with keys:
  question: str
  solution: str (full multi-line gold trace)
  difficulty: "Basic" | "Intermediate" | "Advanced"
  template_name: str (the Python function name)
  template_position: int (1-5)
  gold_final_value: float | None
  gold_intermediate_values: [float, ...]
"""
from __future__ import annotations

import argparse
import importlib
import inspect
import json
import os
import random
import re
import sys
from pathlib import Path

DIFFICULTY_BY_POSITION = {
    1: "Basic",
    2: "Basic",
    3: "Intermediate",
    4: "Intermediate",
    5: "Advanced",
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Introspect a FinChain template instance.")
    p.add_argument("--topic", required=True,
                   help="Topic path relative to data/templates/, e.g. investment_analysis/ci")
    p.add_argument("--template-index", type=int, required=True,
                   help="Template position within topic (1-5)")
    p.add_argument("--seed-index", type=int, required=True,
                   help="Reproducibility seed (used to seed random.* before invocation)")
    p.add_argument("--vendor-dir", default=None,
                   help="Path to vendor/finchain (default: ../vendor/finchain relative to this script)")
    return p.parse_args()


def resolve_vendor_dir(arg: str | None) -> Path:
    if arg:
        return Path(arg).resolve()
    here = Path(__file__).resolve().parent
    return (here.parent / "vendor" / "finchain").resolve()


def load_topic_module(vendor_dir: Path, topic: str):
    templates_root = vendor_dir / "data" / "templates"
    if not templates_root.is_dir():
        raise SystemExit(f"templates dir not found: {templates_root}")
    # topic is "<domain>/<topic_basename>"; convert to module path
    topic_py = templates_root / f"{topic}.py"
    if not topic_py.is_file():
        raise SystemExit(f"topic file not found: {topic_py}")
    sys.path.insert(0, str(templates_root))
    # Import as bare basename module (templates_root is on sys.path)
    domain, basename = topic.split("/", 1)
    sys.path.insert(0, str(templates_root / domain))
    mod = importlib.import_module(basename)
    return mod


def pick_template(mod, position: int):
    """Return the (name, callable) of the position-th template_* function.

    Convention: FinChain template functions are named template_* and ordered
    by source line. Position 1 is the first declared template; position 5 is
    the last. README says 5 templates per topic but the actual count may
    vary (we accept 1-N).
    """
    template_funcs = [
        (name, obj)
        for name, obj in inspect.getmembers(mod, inspect.isfunction)
        if name.startswith("template_")
    ]
    # Sort by source line number to get docstring-order
    template_funcs.sort(key=lambda pair: inspect.getsourcelines(pair[1])[1])
    if not template_funcs:
        raise SystemExit(f"no template_* functions in module {mod.__name__}")
    if position < 1 or position > len(template_funcs):
        raise SystemExit(f"position {position} out of range; topic has {len(template_funcs)} templates")
    return template_funcs[position - 1]


def parse_difficulty_from_docstring(func) -> str | None:
    """Some templates encode difficulty in docstring: '1:Basic:...' or '1: Basic: ...'."""
    doc = (func.__doc__ or "").strip()
    if not doc:
        return None
    # Match "<int>: <Difficulty>:" or "<int>:<Difficulty>:" at start
    m = re.match(r"^\s*(\d+)\s*:\s*(Basic|Intermediate|Advanced)\b", doc, re.IGNORECASE)
    if m:
        return m.group(2).capitalize()
    return None


_NUM_RE = re.compile(r"-?[\d]+(?:,\d{3})*(?:\.\d+)?")


def extract_numbers(text: str) -> list[float]:
    """Extract all decimal numbers from text, stripping thousands separators."""
    out: list[float] = []
    for m in _NUM_RE.finditer(text):
        s = m.group(0).replace(",", "")
        try:
            out.append(float(s))
        except ValueError:
            pass
    return out


def extract_gold_final_value(solution: str) -> float | None:
    """Heuristic: the gold final value is the LAST numeric value in the solution
    string (typically appears as the final '= <number>' line).

    The substrate's evaluator (FAC scorer) compares this against the agent's
    df.answer.value with tolerance. Robust to currency symbols, percent
    signs, and thousands separators.
    """
    numbers = extract_numbers(solution)
    return numbers[-1] if numbers else None


def main() -> int:
    args = parse_args()
    vendor_dir = resolve_vendor_dir(args.vendor_dir)
    mod = load_topic_module(vendor_dir, args.topic)
    name, fn = pick_template(mod, args.template_index)

    # Seed for reproducibility BEFORE calling the template
    random.seed(args.seed_index)

    try:
        result = fn()
    except Exception as exc:  # pylint: disable=broad-except
        json.dump({
            "error": f"template invocation failed: {exc}",
            "topic": args.topic,
            "template_name": name,
            "template_position": args.template_index,
            "seed_index": args.seed_index,
        }, sys.stdout)
        return 1

    if not isinstance(result, tuple) or len(result) != 2:
        json.dump({
            "error": f"template returned non-(question,solution) tuple: type={type(result).__name__}",
            "topic": args.topic,
            "template_name": name,
            "template_position": args.template_index,
            "seed_index": args.seed_index,
        }, sys.stdout)
        return 1

    question, solution = result
    difficulty_doc = parse_difficulty_from_docstring(fn)
    difficulty = difficulty_doc or DIFFICULTY_BY_POSITION.get(args.template_index, "Unknown")
    gold_intermediate_values = extract_numbers(solution)
    gold_final_value = gold_intermediate_values[-1] if gold_intermediate_values else None

    json.dump({
        "topic": args.topic,
        "template_name": name,
        "template_position": args.template_index,
        "seed_index": args.seed_index,
        "difficulty": difficulty,
        "question": question,
        "solution": solution,
        "gold_final_value": gold_final_value,
        "gold_intermediate_values": gold_intermediate_values,
    }, sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
