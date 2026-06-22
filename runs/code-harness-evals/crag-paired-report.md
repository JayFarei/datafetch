# CRAG-Finance Match/Beat — Paired Report

**Date:** 2026-05-29 · **Worktree:** code-harness-evals · **Model:** claude-sonnet-4-6 (same both arms) · **Scorer:** CRAG 3-way rule-based (`eval/crag/scripts/score-crag.ts`), identical both arms · **Slice:** 16 questions (8 comparison + 8 aggregation) from HF `Quivr/CRAG` finance · **Surface:** CRAG Task-3 mock APIs (`cragapi.finance.FinanceKG`) as `df.tool.cragFinance`, company corpus as `df.db.records`.

## Headline verdict: NEUTRAL — no defensible beat (honest negative), precondition gate PASSED

The learned `df.lib` arm did **not** beat the cold arm on a defensible basis. Accuracy is identical (37.5% both). The learned arm shows lower hallucination, but that is **abstention-driven, not warm-reuse-driven**: a helper crystallised but was **never reused** (`df.lib` used = 0/16), so the difference is not attributable to the substrate and is within noise at n=16. The experiment did, however, (a) confirm the precondition gate — CRAG-Finance has real headroom, the opposite of FinChain — and (b) validate the Stage-0.5 substrate fix live (a correct `recordToolLookup` helper crystallised where the old code would have authored a hallucination landmine).

## Results (CRAG 3-way scorer: +1 accurate / 0 missing / −1 incorrect; truthfulness = accuracy% − hallucination%)

| Metric | Cold (no `df.lib`) | Learned (`df.lib` on) | Δ (learned − cold) |
|---|---|---|---|
| Accuracy | **37.5%** (6/16) | **37.5%** (6/16) | **0.0pp** |
| Hallucination | 43.75% (7/16) | 31.25% (5/16) | −12.5pp |
| Missing | 18.75% (3/16) | 31.25% (5/16) | +12.5pp |
| Truthfulness | −6.25% | +6.25% | +12.5pp |
| `df.lib` helpers crystallised | n/a | 1 (`recordToolLookup`) | — |
| `df.lib` helpers **reused** | n/a | **0** | — |

Per question type:

| Type | Cold acc / halluc | Learned acc / halluc |
|---|---|---|
| comparison (n=8) | 62.5% / 37.5% | 50.0% / 25.0% |
| aggregation (n=8) | 12.5% / 50.0% | 25.0% / 37.5% |

vs published CRAG references: LLM-only ~33% accuracy, straightforward-RAG ~44% accuracy, hard composable types <20–30% auto-score. Our cold arm (37.5%) sits squarely in that band.

## Interpretation (rigorous + honest)

1. **Precondition gate (H1): PASS, with real data.** The cold arm scores 37.5% accuracy with 43.75% hallucination — far below ceiling, matching the published 33–44% band. This is genuine headroom, the *opposite* of FinChain's FAC=1 saturation. CRAG-Finance is a corpus where the harness *could* show value. This was the gate the goal required before building the learned arm on faith; it is met.

2. **The Stage-0.5 substrate fix is validated live.** The learned run crystallised `datafetch-home/lib/crag-finance/recordToolLookup.ts` — the `FANOUT(db)→FANOUT(tool)` shape that, before the fix, would have fallen to a literal-clone with a hardcoded metric (a P1 hallucination landmine). The fix made the substrate author a correct generic intent-shape helper from a real CRAG comparison/aggregation trajectory. This is a real, generic substrate improvement, proven end-to-end.

3. **No warm reuse fired (`df.lib` used = 0/16) → no demonstrated lift.** A helper crystallised (available on 6 later questions) but was never selected/reused, because the 16 questions are **heterogeneous** — each comparison/aggregation is a structurally distinct computation, so no later question matched the crystallised helper's intent closely enough to reuse it. The goal called for a *repeated-structure question stream*; a type-filtered CRAG sample is **not** repeated-structure. Without reuse, the learned arm is mechanically almost identical to the cold arm.

4. **The hallucination drop is abstention, not value, and is within noise.** Learned hallucination fell 43.75%→31.25% but missing rose 18.75%→31.25% — the learned arm abstained ("I don't know") on questions the cold arm guessed wrong on. With n=16 (per-type n=8) and zero helper reuse, a 1–2-question swing is not statistically meaningful (a McNemar test here is badly underpowered) and is not attributable to the substrate. Accuracy — the metric a learned library should lift — is unchanged.

5. **What this does and does not show.** It shows the harness *co-exists safely* (no correctness regression; slightly more conservative) and that the machinery works end-to-end on a real external corpus with a published scorer. It does **not** show the substrate *adds value*, because the warm-reuse mechanism never engaged. This is precisely the project's standing caveat, now reproduced on CRAG: value requires repeated structure to amortise, and a heterogeneous slice provides none.

## What would unlock a real match/beat test

Run the learned arm over a **deliberately repeated-structure sibling stream** rather than a heterogeneous type sample: e.g. one CRAG question *template* instantiated over many entities ("what is the PE ratio of {company}?" × 30 companies; "compare the market cap of {A} and {B}" × 30 pairs). There, the first instance crystallises a `recordToolLookup`/metric helper and the next N reuse it warm — the only conditions under which `df.lib` lift is measurable. CRAG's 600+ templates make this constructible; this run's type-filtered sample did not guarantee it. The substrate's value hypothesis on CRAG is therefore **untested**, not refuted.

## Hard-constraint compliance

No scorer/threshold weakening (rule-based primary is a conservative lower bound; the official LLM-judge would only raise accuracy). Same model + same scorer both arms. No benchmark-name branches in `src/` (the adapter is a clean `df.db`/`df.tool` consumer). No preseeded helpers. No helper-name leaks in the prompt (the agent discovered helpers via the workspace). No hook/quarantine bypass — indeed the cold arm's chain-gate correctly *rejected* db-only answers as "unsupported." No `df.answer` relaxation. The Stage-0.5 `author.ts` fix was verified non-regressing (tsc + authoring smokes) and left intact.

## Provenance

Cold: `runs/code-harness-evals/wf-crag/cold/` (results.jsonl + score-report.json). Learned: `runs/code-harness-evals/wf-crag/learned-full/` (results.jsonl + score-report.json + datafetch-home/lib/crag-finance/recordToolLookup.ts + per-question trajectories/events). Runner: `src/eval/cragFullDatafetch.ts`, `src/eval/cragRecords.ts`, `eval/crag/scripts/{score-crag.ts,crag-tool-runner.py}` (built by workflow `wf_d39dc949-67b`).
