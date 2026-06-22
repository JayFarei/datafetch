#!/usr/bin/env python3
"""Cluster CRAG finance questions into sibling families by template.

Implements the data-team recipe (kb/br/19 follow-on): abstract entities
(tickers, company names, dates, numbers) out of each query, then group by
the resulting template string. Same-template questions are siblings, the
unit over which datafetch's crystallised df.lib helper amortises.

The neutral first run sampled by question_type (heterogeneous); this groups
by template (homogeneous), which is the fix both teams + the run converge on.

Usage:
  venv311/bin/python eval/crag/scripts/cluster-finance-families.py \
      --in eval/crag/finance_all.json --out-dir eval/crag/families
"""
import argparse, json, re, os
from collections import defaultdict

# KG-answerable metric vocabulary (the finance mock APIs cover these).
KG_TERMS = [
    "p/e", "pe ratio", "price-to-earnings", "price to earnings", "eps",
    "earnings per share", "market cap", "market capitalization", "market capitalisation",
    "dividend", "close", "closing", "open price", "opening", "high", "low",
    "volume", "trading", "price", "share price", "stock",
]

# CRAG finance queries are all lowercase, so capitalization cannot find the
# entity. Cluster by COMPUTATIONAL SHAPE instead (which metric API the
# question needs + single-vs-comparison + aggregation). That is the helper
# SHAPE the observer crystallises, and it is the correct amortisation unit:
# every "resolve ticker -> get PE" sibling reuses one crystallised helper
# regardless of surface wording.
METRIC_SIGNATURES = [
    ("pe",        ["p/e", "pe ratio", "price-to-earnings", "price to earnings", "price earnings"]),
    ("eps",       ["eps", "earnings per share"]),
    ("marketcap", ["market cap", "market capitali"]),
    ("dividend",  ["dividend"]),
    ("price",     ["closing price", "close price", "opening price", "open price", "stock price",
                   "share price", "high price", "low price", "highest price", "lowest price",
                   "trading volume", "volume", " high and low", "price of"]),
]
COMPARISON_MARKERS = ["which company", " vs ", " vs.", " or ", "compare", "comparison",
                       "between", "higher", "lower", "more than", "less than", "greater"]
AGG_MARKERS = ["total", "how many", "average", "sum of", "number of", "count", "over the past"]

def metric_of(q: str) -> str:
    ql = q.lower()
    for name, terms in METRIC_SIGNATURES:
        if any(t in ql for t in terms):
            return name
    return "other"

def shape_key(q: str) -> str:
    ql = q.lower()
    metric = metric_of(q)
    is_cmp = any(mk in ql for mk in COMPARISON_MARKERS)
    is_agg = any(mk in ql for mk in AGG_MARKERS)
    arity = "compare" if is_cmp else "single"
    agg = "+agg" if is_agg else ""
    return f"{metric}:{arity}{agg}"

# Back-compat name used elsewhere in the file.
def abstract(q: str) -> str:
    return shape_key(q)

def kg_answerable(q: str) -> bool:
    # KG-answerable when the question maps to a covered metric API and is not
    # an out-of-KG ask (CEO bios, funding rounds, ESG %, decade history).
    ql = q.lower()
    if metric_of(q) == "other":
        return False
    if any(b in ql for b in ["ceo", "previously work", "funding round", "green energy",
                              "esg", "past decade", "over the decade", "headquarter",
                              "founded", "sector"]):
        return False
    return True

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out-dir", dest="out", required=True)
    ap.add_argument("--min-size", type=int, default=4)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    rows = json.load(open(args.inp))

    fams = defaultdict(list)
    for r in rows:
        fams[abstract(r["query"])].append(r)

    ranked = sorted(fams.items(), key=lambda kv: len(kv[1]), reverse=True)
    families = []
    for tmpl, members in ranked:
        if len(members) < args.min_size:
            continue
        kg = sum(1 for m in members if kg_answerable(m["query"]))
        families.append({
            "template": tmpl,
            "size": len(members),
            "kgAnswerable": kg,
            "types": sorted({m["question_type"] for m in members}),
            "exampleQueries": [m["query"] for m in members[:3]],
            "interaction_ids": [m["interaction_id"] for m in members],
        })

    summary = {
        "totalQuestions": len(rows),
        "familiesWithSizeGE": {str(args.min_size): len(families)},
        "questionsInFamilies": sum(f["size"] for f in families),
        "topFamilies": [
            {k: f[k] for k in ("template", "size", "kgAnswerable", "types", "exampleQueries")}
            for f in families[:20]
        ],
    }
    json.dump(summary, open(os.path.join(args.out, "family-summary.json"), "w"), indent=2)
    json.dump(families, open(os.path.join(args.out, "families.json"), "w"), indent=2)

    print(f"total finance questions: {len(rows)}")
    print(f"families with >= {args.min_size} siblings: {len(families)}")
    print(f"questions covered by those families: {summary['questionsInFamilies']}")
    print("\nTOP FAMILIES (size | kg-answerable | types | template):")
    for f in families[:18]:
        print(f"  {f['size']:3} | kg {f['kgAnswerable']:3}/{f['size']:<3} | {','.join(f['types']):28} | {f['template'][:64]}")
    # Write the largest KG-answerable single-metric family as a ready-to-run slice,
    # ordered so siblings are consecutive (crystallise once, reuse the rest).
    for f in families:
        if f["kgAnswerable"] == f["size"] and f["size"] >= 8:
            members = [r for r in rows if r["interaction_id"] in set(f["interaction_ids"])]
            json.dump(members, open(os.path.join(args.out, "densest-family.json"), "w"), indent=0)
            print(f"\nwrote densest-family.json: {f['size']} siblings | template: {f['template'][:70]}")
            break

if __name__ == "__main__":
    main()
