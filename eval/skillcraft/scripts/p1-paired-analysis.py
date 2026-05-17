#!/usr/bin/env python3
"""P1 matched-arm paired analysis.

Reads two normalized.jsonl files (substrate-ON and substrate-OFF arms of
the same SkillCraft full-126) and emits the 4 tables plus statistical
confidence required by the goal4-p1 paired-comparison report.

The script is read-only and benchmark-agnostic: it relies only on
NormalizedRow shape (arm, family, level, phase, officialPassed,
effectiveTokens, wallClockMs, toolCalls, llmRequests, runtimeStatus).

Usage:
  python3 eval/skillcraft/scripts/p1-paired-analysis.py \
    --arm-a <ON-normalized.jsonl> \
    --arm-b <OFF-normalized.jsonl> \
    --out  <paired-comparison.md>

Defaults pull files from goal4-p1-armA/armB out-dirs.
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any


# --- I/O ---------------------------------------------------------------

def load_rows(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open() as fp:
        for line in fp:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def index_by_task(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    idx: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = row.get("canonicalTaskKey") or row["taskKey"]
        idx[key] = row
    return idx


# --- stats helpers -----------------------------------------------------

def safe_mean(values: list[float | None]) -> float | None:
    nums = [v for v in values if v is not None and isinstance(v, (int, float)) and not math.isnan(v)]
    return statistics.fmean(nums) if nums else None


def safe_stdev(values: list[float | None]) -> float | None:
    nums = [v for v in values if v is not None and isinstance(v, (int, float)) and not math.isnan(v)]
    return statistics.stdev(nums) if len(nums) >= 2 else None


def paired_t(deltas: list[float]) -> tuple[float | None, float | None]:
    """Welch-equivalent paired t-test: t = mean / (sd / sqrt(n)). Returns (t, p-two-sided).
    p is an analytic approximation using the survival function of the t distribution.
    For n>=30 the normal approximation is fine; for smaller n we still use it as a rough p."""
    n = len(deltas)
    if n < 2:
        return None, None
    m = statistics.fmean(deltas)
    sd = statistics.stdev(deltas)
    if sd == 0:
        return None, 0.0
    t = m / (sd / math.sqrt(n))
    # Two-sided p from a normal CDF approximation (good for n>=30):
    # p = 2 * (1 - Phi(|t|))
    p = 2 * (1 - normal_cdf(abs(t)))
    return t, p


def normal_cdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def mcnemar_two_sided(b: int, c: int) -> float | None:
    """McNemar exact two-sided p for discordant pair counts (b, c).
    Uses cumulative binomial(n=b+c, p=0.5)."""
    n = b + c
    if n == 0:
        return None
    k = min(b, c)
    # P(X <= k) under binom(n, 0.5) = sum_{i=0..k} C(n,i) * 0.5**n
    p_one = 0.0
    for i in range(k + 1):
        p_one += math.comb(n, i) * (0.5 ** n)
    return min(1.0, 2 * p_one)


# --- per-arm summary ---------------------------------------------------

def arm_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    passed = [1 if r.get("officialPassed") else 0 for r in rows]
    effective_tokens = [r.get("effectiveTokens") for r in rows]
    wall_clock = [r.get("wallClockMs") for r in rows]
    runtime_err = sum(1 for r in rows if r.get("runtimeStatus") == "runtime_error")
    infra_err = sum(1 for r in rows if r.get("runtimeStatus") == "infrastructure_error")
    return {
        "n": len(rows),
        "passRate": safe_mean(passed),
        "passCount": sum(passed),
        "avgEffectiveTokens": safe_mean(effective_tokens),
        "stdEffectiveTokens": safe_stdev(effective_tokens),
        "avgWallClockMs": safe_mean(wall_clock),
        "stdWallClockMs": safe_stdev(wall_clock),
        "runtimeErrorCount": runtime_err,
        "infrastructureErrorCount": infra_err,
    }


def per_tier(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for tier in ("train", "warm", "hard"):
        tier_rows = [r for r in rows if r.get("phase") == tier]
        if not tier_rows:
            continue
        out[tier] = arm_summary(tier_rows)
    return out


def per_family(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    by_fam: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        by_fam[r["family"]].append(r)
    for fam, fam_rows in by_fam.items():
        out[fam] = arm_summary(fam_rows)
    return out


# --- formatting --------------------------------------------------------

def fmt_n(v: Any, places: int = 2) -> str:
    if v is None:
        return "—"
    if isinstance(v, int) or (isinstance(v, float) and v.is_integer()):
        return f"{int(v):,}"
    if isinstance(v, float):
        return f"{v:,.{places}f}"
    return str(v)


def fmt_pct(v: Any) -> str:
    if v is None:
        return "—"
    return f"{v*100:.1f}%"


def fmt_delta(arm_a: float | None, arm_b: float | None, kind: str = "abs") -> str:
    if arm_a is None or arm_b is None:
        return "—"
    delta = arm_a - arm_b
    if kind == "abs_pct":
        return f"{delta*100:+.1f}pp"
    if kind == "ratio":
        if arm_b == 0:
            return "—"
        return f"{arm_a/arm_b:.3f}x"
    return f"{delta:+.1f}"


def relative_pct(arm_a: float | None, arm_b: float | None) -> str:
    if arm_a is None or arm_b is None or arm_b == 0:
        return "—"
    return f"{(arm_a - arm_b) / arm_b * 100:+.1f}%"


# --- verdict ----------------------------------------------------------

def classify(advantage_pct: float | None, p: float | None) -> str:
    """Spec-defined 4-vector classifier.

    PASS       : ARM-A advantage >= +10pp/% AND p < 0.05
    MARGINAL   : ARM-A advantage 2..10pp/% AND p < 0.10
    REGRESSION : ARM-B wins by > 2pp/% AND p < 0.05
    NEUTRAL    : anything else (no significant signal at the bar above)
    """
    if advantage_pct is None:
        return "NO-DATA"
    if p is None:
        p = 1.0
    if advantage_pct >= 10 and p < 0.05:
        return "PASS"
    if advantage_pct < -2 and p < 0.05:
        return "REGRESSION"
    if advantage_pct >= 2 and p < 0.10:
        return "MARGINAL"
    return "NEUTRAL"


# --- main report ------------------------------------------------------

def render_report(arm_a_path: Path, arm_b_path: Path) -> str:
    a_rows = load_rows(arm_a_path)
    b_rows = load_rows(arm_b_path)
    a_idx = index_by_task(a_rows)
    b_idx = index_by_task(b_rows)
    paired_keys = sorted(set(a_idx) & set(b_idx))

    a_sum = arm_summary(a_rows)
    b_sum = arm_summary(b_rows)

    # Paired deltas (only for tasks present in both arms)
    pass_a_paired = [1 if a_idx[k].get("officialPassed") else 0 for k in paired_keys]
    pass_b_paired = [1 if b_idx[k].get("officialPassed") else 0 for k in paired_keys]
    pass_delta = [a - b for a, b in zip(pass_a_paired, pass_b_paired)]

    # McNemar on pass discordance
    treatment_only = sum(1 for a, b in zip(pass_a_paired, pass_b_paired) if a == 1 and b == 0)
    control_only = sum(1 for a, b in zip(pass_a_paired, pass_b_paired) if a == 0 and b == 1)
    p_mcnemar = mcnemar_two_sided(treatment_only, control_only)

    # Token deltas (only valid where both have numeric effectiveTokens)
    token_pairs = [
        (a_idx[k].get("effectiveTokens"), b_idx[k].get("effectiveTokens"))
        for k in paired_keys
        if a_idx[k].get("effectiveTokens") is not None and b_idx[k].get("effectiveTokens") is not None
    ]
    token_deltas = [a - b for a, b in token_pairs]
    t_tok, p_tok = paired_t(token_deltas)

    # Wall-clock deltas
    wall_pairs = [
        (a_idx[k].get("wallClockMs"), b_idx[k].get("wallClockMs"))
        for k in paired_keys
        if a_idx[k].get("wallClockMs") is not None and b_idx[k].get("wallClockMs") is not None
    ]
    wall_deltas = [a - b for a, b in wall_pairs]
    t_wall, p_wall = paired_t(wall_deltas)

    # Variance: stddev ratio across all tasks per arm (cost variance proxy)
    var_a = a_sum["stdEffectiveTokens"]
    var_b = b_sum["stdEffectiveTokens"]

    # Verdicts (substrate-ON wins when: more passes, fewer tokens, less wall, less variance)
    # advantage_pct positive = substrate ON wins
    pass_adv_pct = (a_sum["passRate"] - b_sum["passRate"]) * 100 if a_sum["passRate"] is not None and b_sum["passRate"] is not None else None
    pass_verdict = classify(pass_adv_pct, p_mcnemar)
    # For tokens/wall: positive = arm A LOWER is better; advantage_pct = (B - A) / B * 100
    if a_sum["avgEffectiveTokens"] is not None and b_sum["avgEffectiveTokens"] is not None and b_sum["avgEffectiveTokens"] > 0:
        tok_adv_pct = (b_sum["avgEffectiveTokens"] - a_sum["avgEffectiveTokens"]) / b_sum["avgEffectiveTokens"] * 100
    else:
        tok_adv_pct = None
    tok_verdict = classify(tok_adv_pct, p_tok)
    if a_sum["avgWallClockMs"] is not None and b_sum["avgWallClockMs"] is not None and b_sum["avgWallClockMs"] > 0:
        wall_adv_pct = (b_sum["avgWallClockMs"] - a_sum["avgWallClockMs"]) / b_sum["avgWallClockMs"] * 100
    else:
        wall_adv_pct = None
    wall_verdict = classify(wall_adv_pct, p_wall)
    if var_a is not None and var_b is not None and var_b > 0:
        var_adv_pct = (var_b - var_a) / var_b * 100
    else:
        var_adv_pct = None
    var_verdict = classify(var_adv_pct, None)  # variance has no t-test in this script

    # Per-tier
    a_tier = per_tier(a_rows)
    b_tier = per_tier(b_rows)

    # Per-family
    a_fam = per_family(a_rows)
    b_fam = per_family(b_rows)

    # Build the markdown
    out = []
    out.append("# GOAL P1 — matched-arm performance proof on SkillCraft (paired)")
    out.append("")
    out.append("Substrate-ON (`datafetch-learned`) vs substrate-OFF (`datafetch-control`).")
    out.append("Same harness, same agent backend, same prompt skeleton, same df.tool + df.db + per_entity seed.")
    out.append("Only the learning loop differs: control arm runs with `DATAFETCH_DISABLE_LEARNING=1`,")
    out.append("which skips `hydrateFamilyLibCache`, `installObserver`, and `persistFamilyLibCache`.")
    out.append("")
    out.append(f"Run dates: 2026-05-17. Backend: `claude-p` / `claude-sonnet-4-6` / effort `low`.")
    out.append(f"Episodes per arm: A={a_sum['n']}, B={b_sum['n']}. Paired tasks: {len(paired_keys)}.")
    out.append("")
    out.append("## Headline 4-vector verdict")
    out.append("")
    out.append(f"- **Pass rate**: {pass_verdict}  (Δ = {fmt_delta(a_sum['passRate'], b_sum['passRate'], 'abs_pct')}, McNemar p = {fmt_n(p_mcnemar, 3) if p_mcnemar is not None else '—'})")
    out.append(f"- **Effective tokens**: {tok_verdict}  (A/B ratio = {fmt_delta(a_sum['avgEffectiveTokens'], b_sum['avgEffectiveTokens'], 'ratio')}, paired t p ≈ {fmt_n(p_tok, 3) if p_tok is not None else '—'})")
    out.append(f"- **Wall-clock**: {wall_verdict}  (A/B ratio = {fmt_delta(a_sum['avgWallClockMs'], b_sum['avgWallClockMs'], 'ratio')}, paired t p ≈ {fmt_n(p_wall, 3) if p_wall is not None else '—'})")
    out.append(f"- **Cost variance (σ effective tokens)**: {var_verdict}  (σA = {fmt_n(var_a)}, σB = {fmt_n(var_b)})")
    out.append("")

    # --- Table 1 ---
    out.append("## Table 1 — Headline deltas (full-126 means)")
    out.append("")
    out.append("| Metric | Arm A (substrate ON) | Arm B (substrate OFF) | Δ | % improvement |")
    out.append("|---|---|---|---|---|")
    out.append(f"| R1 pass rate | {fmt_pct(a_sum['passRate'])} ({a_sum['passCount']}/{a_sum['n']}) | {fmt_pct(b_sum['passRate'])} ({b_sum['passCount']}/{b_sum['n']}) | {fmt_delta(a_sum['passRate'], b_sum['passRate'], 'abs_pct')} | {relative_pct(a_sum['passRate'], b_sum['passRate'])} |")
    out.append(f"| R2 mean effective tokens | {fmt_n(a_sum['avgEffectiveTokens'])} | {fmt_n(b_sum['avgEffectiveTokens'])} | {fmt_delta(a_sum['avgEffectiveTokens'], b_sum['avgEffectiveTokens'])} | {relative_pct(a_sum['avgEffectiveTokens'], b_sum['avgEffectiveTokens'])} |")
    out.append(f"| Wall-clock mean per task (ms) | {fmt_n(a_sum['avgWallClockMs'])} | {fmt_n(b_sum['avgWallClockMs'])} | {fmt_delta(a_sum['avgWallClockMs'], b_sum['avgWallClockMs'])} | {relative_pct(a_sum['avgWallClockMs'], b_sum['avgWallClockMs'])} |")
    out.append(f"| Effective-token σ (variance proxy) | {fmt_n(var_a)} | {fmt_n(var_b)} | {fmt_delta(var_a, var_b)} | {relative_pct(var_a, var_b)} |")
    out.append(f"| Runtime errors | {a_sum['runtimeErrorCount']} | {b_sum['runtimeErrorCount']} | — | — |")
    out.append(f"| Infrastructure errors | {a_sum['infrastructureErrorCount']} | {b_sum['infrastructureErrorCount']} | — | — |")
    out.append("")

    # --- Table 2: per-tier ---
    out.append("## Table 2 — Per-tier breakdown")
    out.append("")
    out.append("| Tier | n A | passRate A | tokens A | wallMs A | n B | passRate B | tokens B | wallMs B | passΔ | tokΔ% | wallΔ% |")
    out.append("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for tier in ("train", "warm", "hard"):
        a = a_tier.get(tier)
        b = b_tier.get(tier)
        if a is None or b is None:
            out.append(f"| {tier} | — | — | — | — | — | — | — | — | — | — | — |")
            continue
        out.append(
            f"| {tier} | {a['n']} | {fmt_pct(a['passRate'])} | {fmt_n(a['avgEffectiveTokens'])} | {fmt_n(a['avgWallClockMs'])} | "
            f"{b['n']} | {fmt_pct(b['passRate'])} | {fmt_n(b['avgEffectiveTokens'])} | {fmt_n(b['avgWallClockMs'])} | "
            f"{fmt_delta(a['passRate'], b['passRate'], 'abs_pct')} | {relative_pct(a['avgEffectiveTokens'], b['avgEffectiveTokens'])} | {relative_pct(a['avgWallClockMs'], b['avgWallClockMs'])} |"
        )
    out.append("")

    # --- Table 3: per-family ---
    out.append("## Table 3 — Per-family breakdown (21 families)")
    out.append("")
    out.append("Sorted by Arm-A advantage on pass rate (largest substrate wins first).")
    out.append("")
    out.append("| Family | n A | passA | tokA | n B | passB | tokB | passΔ | tokΔ% |")
    out.append("|---|---|---|---|---|---|---|---|---|")
    fam_rows = []
    all_fams = sorted(set(a_fam) | set(b_fam))
    for fam in all_fams:
        a = a_fam.get(fam)
        b = b_fam.get(fam)
        if a is None or b is None:
            continue
        pass_d = (a["passRate"] - b["passRate"]) if (a["passRate"] is not None and b["passRate"] is not None) else None
        fam_rows.append((pass_d if pass_d is not None else -99, fam, a, b))
    fam_rows.sort(key=lambda t: -t[0])
    for _, fam, a, b in fam_rows:
        out.append(
            f"| {fam} | {a['n']} | {fmt_pct(a['passRate'])} | {fmt_n(a['avgEffectiveTokens'])} | "
            f"{b['n']} | {fmt_pct(b['passRate'])} | {fmt_n(b['avgEffectiveTokens'])} | "
            f"{fmt_delta(a['passRate'], b['passRate'], 'abs_pct')} | "
            f"{relative_pct(a['avgEffectiveTokens'], b['avgEffectiveTokens'])} |"
        )
    out.append("")
    # Flag families with A >> B and B >> A
    a_wins = [(fam, a, b) for _, fam, a, b in fam_rows if (a["passRate"] is not None and b["passRate"] is not None and (a["passRate"] - b["passRate"]) >= 0.10)]
    b_wins = [(fam, a, b) for _, fam, a, b in fam_rows if (a["passRate"] is not None and b["passRate"] is not None and (b["passRate"] - a["passRate"]) > 0.02)]
    out.append(f"Families where A beats B by ≥ 10pp on pass rate: {len(a_wins)} ({', '.join(fam for fam, _, _ in a_wins) or 'none'}).")
    out.append(f"Families where B beats A by > 2pp on pass rate (substrate anti-patterns): {len(b_wins)} ({', '.join(fam for fam, _, _ in b_wins) or 'none'}).")
    out.append("")

    # --- Table 4: statistical confidence ---
    out.append("## Table 4 — Statistical confidence")
    out.append("")
    out.append(f"Paired tasks (canonical task-key match between arms): {len(paired_keys)}")
    out.append("")
    out.append("| Test | Statistic | p-value | n_pairs |")
    out.append("|---|---|---|---|")
    out.append(f"| McNemar (pass agreement, b={treatment_only}, c={control_only}) | discord({treatment_only},{control_only}) | {fmt_n(p_mcnemar, 4) if p_mcnemar is not None else '—'} | {treatment_only + control_only} |")
    out.append(f"| Paired t (effective tokens A − B) | t = {fmt_n(t_tok)} | {fmt_n(p_tok, 4) if p_tok is not None else '—'} | {len(token_deltas)} |")
    out.append(f"| Paired t (wall-clock ms A − B) | t = {fmt_n(t_wall)} | {fmt_n(p_wall, 4) if p_wall is not None else '—'} | {len(wall_deltas)} |")
    out.append("")
    out.append(f"Pass discordance: treatment-only = {treatment_only}, control-only = {control_only}.")
    out.append("")
    out.append("Notes on power: with N=126 (or fewer paired) any |Δ| < ~5pp on a 0/1 pass outcome falls outside what a McNemar can confidently distinguish from noise. Mean-token deltas are easier to detect — token costs vary continuously per task, so the paired t has effective n equal to the number of valid pairs.")
    out.append("")

    out.append("## Interpretation")
    out.append("")
    out.append("Pending — will be authored after the numbers land, with explicit honesty about which dimensions show signal and which don't.")
    out.append("")
    out.append("## What this proves vs what it doesn't")
    out.append("")
    out.append("Pending — will be authored alongside the interpretation.")
    out.append("")
    out.append("## Artifacts")
    out.append("")
    out.append(f"- Arm A scorecard: `{arm_a_path.parent}/r1-r9-scorecard.json`")
    out.append(f"- Arm B scorecard: `{arm_b_path.parent}/r1-r9-scorecard.json`")
    out.append(f"- Arm A helper instrumentation: `{arm_a_path.parent}/helper-instrumentation.jsonl`")
    out.append(f"- Arm B helper instrumentation: `{arm_b_path.parent}/helper-instrumentation.jsonl`")
    out.append(f"- Arm A normalized rows: `{arm_a_path}`")
    out.append(f"- Arm B normalized rows: `{arm_b_path}`")
    out.append("")
    out.append("Verdict classifier: PASS (≥10% & p<0.05), MARGINAL (2-10% & p<0.10), NEUTRAL (|Δ|<2% & p≥0.10), REGRESSION (B wins >2% & p<0.05).")
    return "\n".join(out)


def main() -> int:
    p = argparse.ArgumentParser(description="P1 paired-arm analysis")
    p.add_argument("--arm-a", default="eval/skillcraft/results/datafetch/goal4-p1-armA-substrate-on-20260517/normalized.jsonl")
    p.add_argument("--arm-b", default="eval/skillcraft/results/datafetch/goal4-p1-armB-substrate-off-20260517/normalized.jsonl")
    p.add_argument("--out",   default="eval/skillcraft/results/datafetch/goal4-p1-paired-comparison-20260517.md")
    args = p.parse_args()
    arm_a = Path(args.arm_a)
    arm_b = Path(args.arm_b)
    if not arm_a.exists():
        print(f"missing: {arm_a}", file=sys.stderr); return 1
    if not arm_b.exists():
        print(f"missing: {arm_b}", file=sys.stderr); return 1
    report = render_report(arm_a, arm_b)
    Path(args.out).write_text(report)
    print(f"wrote {args.out} ({len(report)} chars)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
