#!/usr/bin/env python3
"""Deterministic SVG bar charts for the Milestone 1 report. No dependencies.
Every value here is sourced from the report; see captions in the report for provenance.
Run: python3 reports/figures/make-figures.py
"""
import math, os

BG = "#f7f5ef"      # cream card
INK = "#2b2a27"     # text
MUTED = "#6b675e"   # secondary text
BASE = "#b9b2a4"    # baseline bars
HILITE = "#1f5673"  # the key result bar
OUT = os.path.dirname(os.path.abspath(__file__))

FONT = "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace"
W = 760
PLOT_X = 26
BAR_MAX = 540
ROW_H = 52
BAR_H = 24


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def chart(filename, title, subtitle, rows, hilite_label, footnote=""):
    # rows: list of (label, bar_fraction_0to1, value_text)
    top = 78
    h = top + len(rows) * ROW_H + (34 if footnote else 14)
    p = []
    p.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{h}" viewBox="0 0 {W} {h}" font-family="{FONT}">')
    p.append(f'<rect x="0" y="0" width="{W}" height="{h}" rx="10" fill="{BG}"/>')
    p.append(f'<text x="{PLOT_X}" y="34" font-size="16" font-weight="700" fill="{INK}">{esc(title)}</text>')
    p.append(f'<text x="{PLOT_X}" y="56" font-size="12" fill="{MUTED}">{esc(subtitle)}</text>')
    for i, (label, frac, val) in enumerate(rows):
        y = top + i * ROW_H
        bar_w = max(2, round(frac * BAR_MAX))
        color = HILITE if label == hilite_label else BASE
        p.append(f'<text x="{PLOT_X}" y="{y+13}" font-size="12.5" fill="{INK}">{esc(label)}</text>')
        p.append(f'<rect x="{PLOT_X}" y="{y+20}" width="{bar_w}" height="{BAR_H}" rx="3" fill="{color}"/>')
        p.append(f'<text x="{PLOT_X + bar_w + 10}" y="{y+37}" font-size="12.5" font-weight="600" fill="{INK}">{esc(val)}</text>')
    if footnote:
        p.append(f'<text x="{PLOT_X}" y="{h-12}" font-size="10.5" fill="{MUTED}">{esc(footnote)}</text>')
    p.append('</svg>')
    with open(os.path.join(OUT, filename), "w") as f:
        f.write("\n".join(p) + "\n")
    print("wrote", filename)


# Figure 1: tokens per task, log scale (1e3 .. 1e6)
lo, hi = 3.0, 6.0
def lf(v):
    return (math.log10(v) - lo) / (hi - lo)
chart(
    "tokens-per-task-by-approach.svg",
    "Tokens per task (log scale)",
    "SkillCraft, 126 tasks. datafetch is 172x cheaper than a vanilla agent.",
    [
        ("Vanilla agent", lf(520450), "520,450"),
        ("datafetch", lf(3027), "3,027"),
    ],
    hilite_label="datafetch",
    footnote="Log axis 10^3 to 10^6 tokens. Source: EVAL.md / report section 2.",
)

# Figure 2: four-mode exposure pass rates, linear 0..100
chart(
    "four-mode-exposure-pass-rates.svg",
    "SkillCraft pass rate by interface-exposure mode",
    "Callable-with-fallback (draft) and legacy pass; over-strict modes quarantine learned hooks and collapse.",
    [
        ("legacy", 65.9 / 100, "65.9%"),
        ("candidate-only", 16.7 / 100, "16.7%"),
        ("draft (callable-with-fallback)", 71.4 / 100, "71.4%"),
        ("validated-only", 16.7 / 100, "16.7%"),
    ],
    hilite_label="draft (callable-with-fallback)",
    footnote="Linear axis 0 to 100%. Source: report section 3, commit f7b4a7236.",
)

# Figure 3: M5 non-empty-gold majority correctness, linear 0..10 (max 8.6)
sc = 10.0
chart(
    "m5-majority-correctness-by-arm.svg",
    "M5 majority-correctness on non-empty-gold questions (n=93)",
    "The cold baseline answers zero non-trivial questions; the curated interface answers eight.",
    [
        ("armN  (cold mount)", 0.0 / sc, "0/93  (0.0%)"),
        ("armR  (recipe floor)", 2.2 / sc, "2/93  (2.2%)"),
        ("armL  (curated interface)", 8.6 / sc, "8/93  (8.6%)"),
    ],
    hilite_label="armL  (curated interface)",
    footnote="Linear axis 0 to 10%. Source: report section 6 / OpenTraces M5, commit d246753eb.",
)
