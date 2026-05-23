# Rubric

This file describes the Goal 5 bilateral rubric for the FinChain evaluation arm. It mirrors `eval/skillcraft/rubric.md` and adds the FinChain-specific gates FC1-FC5. The execution-level rubric authority is `experiments/PLAN.md` § Goal 5; this document is the per-benchmark reference.

The FC gates remain hard benchmark-success gates. They are not weakened or
reinterpreted by the code-mode harness diagnostic added below. The diagnostic
exists because a code-centric learning harness has product properties that FC3
and FC4 only partially measure: typed workspace discovery, contract/runtime
agreement, helper crystallisation, warm reuse, governed maturity, and
cost/trajectory compression under saturated correctness. The diagnostic uses
`proven | weak | blocked`, not `pass | fail`: `proven` means the current
scorecard evidence meets the anti-gaming threshold, `weak` means useful but
insufficient evidence, and `blocked` means required evidence is missing.

## R1-R9 (carried from Goal 4)

R1-R9 apply to the FinChain arm exactly as they do to SkillCraft, with the following per-benchmark interpretations:

| Gate | Meaning on FinChain | Source |
|---|---|---|
| R1 `passRate ≥ 0.92` | Episodes where `df.answer.status === "answered"` AND FAC matches within tolerance | `r1-r9-scorecard.json` |
| R2 `avgEffectiveTokens ≤ 8,000` | Across all episodes, same definition as SkillCraft | `r1-r9-scorecard.json` |
| R3 `runtimeErrorRate ≤ 0.05` | Episodes where the agent or snippet exited non-zero | `r1-r9-scorecard.json` |
| R4 `quarantine ≤ 0.03` | Crystallised helpers quarantined by the hook registry | `r1-r9-scorecard.json` |
| R5 novel-tenant smoke | Single project-wide check, not per-benchmark — `src/observer/__smoke__/novel-tenant.ts` stays green | smoke test |
| R6 convergence ≥ 0.80 | Of FinChain intent clusters with ≥ 2 qualifying successful trajectories, ≥ 80% crystallise exactly one callable helper | `walk-artifacts.ts` |
| R7 conditional reuse ≥ 0.60 | Of warm FinChain episodes where a same-intent crystallised helper is available, ≥ 60% call it | `walk-artifacts.ts` |
| R8 conditional cost-drop (dual gate) | mean paired ratio ≤ 0.70 AND per-pair pass-fraction ≥ 0.70 across paired same-intent reuse vs non-reuse episodes within FinChain | `walk-artifacts.ts` |
| R9 cross-shape transfer | At least one `intentSignature` whose crystallised helper is reused across ≥ 2 FinChain topics with different parameter structures (e.g. `template_ci_simple_calculation` reusing on `template_di_simple_calculation` if the underlying intent is "compound-growth formula") | `walk-artifacts.ts` |

R9's strict cross-benchmark variant is captured in FC4 below.

## FC1 — FinChain Final Answer Correctness vs paper baseline

**Pass:** Substrate-ON Claude Sonnet 4.6 ChainEval FAC ≥ paper's published Claude Sonnet 4.5 FAC on each difficulty tier (Basic, Intermediate, Advanced).

**Why per-tier:** Frontier models saturate Basic; lift is concentrated in Intermediate and Advanced. Aggregate FAC can hide a regression on Basic offset by a gain on Advanced. Per-tier reporting prevents that.

**Source baseline:** snapshotted from FinChain paper Table 2 (arXiv:2506.02515 v4, verified 2026-05-19 via WebFetch against the arxiv HTML). The interactive leaderboard at https://mbzuai-nlp.github.io/finchain/leaderboard.html is JS-rendered and not extractable via static fetch; paper Table 2 is the canonical source. Numbers live at `eval/finchain/configs/paper-baseline.json` (loaded by `score-finchain.ts` via `--paper-baseline`).

**Snapshot (Claude Sonnet 4.5 from paper Table 2):**

| Metric | Aggregate score | Stdev |
|---|---|---|
| ChainEval | 66.33 | 9.44 |
| Final Answer Correctness (FAC) | 83.34 | 31.79 |
| BERTScore | 86.07 | — |

Comparison from same table:
- Claude Sonnet 4 (4.0): ChainEval 66.20, FAC 82.62
- GPT-5: ChainEval 66.57, FAC 82.03
- GPT-5-mini: ChainEval 67.17, FAC 80.28 (highest ChainEval)
- Gemini 2.5 Pro: ChainEval 66.04, FAC 84.34 (highest FAC)

**Per-difficulty breakdown** is in the paper's Appendix E.3 (not reproduced in the arxiv HTML). Iter 4's substrate-OFF baseline run on Claude Sonnet 4.6 populates the per-tier OFF column directly; the paper baseline is currently held at the aggregate level (83.34% FAC, 66.33% ChainEval) for all three tiers. Once Appendix E.3 numbers are obtained (or the substrate-OFF iter 4 run provides a fresh per-tier reference), `paper-baseline.json` is updated.

| Difficulty | Claude Sonnet 4.5 (paper, aggregate) | Claude Sonnet 4.6 (substrate-OFF, iter 4) | Claude Sonnet 4.6 (substrate-ON, iter 5+) |
|---|---|---|---|
| Basic | FAC 83.34 / ChainEval 66.33 | TBD | TBD |
| Intermediate | FAC 83.34 / ChainEval 66.33 | TBD | TBD |
| Advanced | FAC 83.34 / ChainEval 66.33 | TBD | TBD |

## FC2 — ChainEval step-alignment vs paper baseline

**Pass:** Substrate-ON ChainEval step-alignment ≥ paper's published Claude Sonnet 4.5 step-alignment per difficulty tier.

**Source baseline:** same as FC1. Snapshot table same shape; populated at iter 4.

## FC3 — Substrate-ON > Substrate-OFF (matched-arm paired test)

**Pass:** On paired (topic, template, seed_index) units across the substrate-ON and substrate-OFF arms:

- Paired t-test on FAC (0/1) shows p < 0.05 in favour of substrate-ON.
- AND ≥10% reduction on at least one of {effective tokens, wall-clock} on warm-tier sibling cells (sub-episodes within a `(topic, template)` group where the substrate-ON arm had a same-template helper already crystallised before the current seed ran).

Computed by `eval/finchain/scripts/p1-paired-analysis.py` (reusing the SkillCraft P1 analyser).

FC3 is intentionally strict and still useful as benchmark evidence. When both
arms already saturate FAC, FC3 may be false even when the code-mode harness is
improving the product shape. In that case, inspect `codeModeHarness.compression`
in `finchain-scorecard.json`: it records the weaker but product-relevant claim
that learned mode preserved paired correctness and cleared a minimum cost
reduction threshold. Tiny positive deltas stay `weak`. This diagnostic is not
a substitute for FC3 pass.

## FC4 — Cross-benchmark transfer

**Pass:** At least one `intentSignature` whose crystallised helper was called in ≥1 SkillCraft family AND ≥1 FinChain topic on the same substrate commit. Both calls must be in the trajectory (not just hydrated into df.d.ts).

**Evidence path:** `eval/finchain/results/datafetch/<run>/finchain-scorecard.json#crossBenchmarkTransfer` AND `eval/skillcraft/results/datafetch/<run>/r1-r9-scorecard.json#crossShapeTransfer`. The two scorecards must reference the same helper signature with the same `intentSignature` field.

FC4 measures the strictest form of transfer: the same intent signature called
from both SkillCraft and FinChain. The broader product question is whether the
same code-mode harness can discover, externalize, promote, and reuse tenant
code across repeated intent families. That broader question is reported under
`codeModeHarness.generality`, split into within-benchmark transfer and
cross-benchmark same-signature transfer. FC4 remains the same-signature gate.

## FC5 — Bilateral non-regression (SkillCraft)

**Pass:** The paired SkillCraft regression run on the same Goal 5 substrate commit reproduces iter164's R1-R9 PASS under `cacheBoundedByFramework`, with:

- 4-vector verdict ≥ `{NEUTRAL, PASS, PASS, NEUTRAL}` vs iter164's P1 paired-comparison baseline.
- Pass rate ≥ 95.2% (the projected post-P1-followups pass rate per `experiments/STATUS.md`).
- No per-family regression beyond the existing 3 P1 anti-patterns (`pokeapi-pokedex`, `random-user-database`, `recipe-cookbook-builder`); ideally with those 3 also recovered by the post-P1 generic fixes already on main (`14bae808`, `4555f968`, `7d416692`).

**Evidence path:** `eval/skillcraft/results/datafetch/<run>/r1-r9-scorecard.json` + `goal5-<iter>-skillcraft-regression-<YYYYMMDD>.md`.

## Reading The Scorecard

`finchain-scorecard.json` shape (iter 3 produces):

```json
{
  "fc1": {
    "basic":        {"substrateOn": 0.XX, "substrateOff": 0.XX, "paperBaseline": 0.XX, "passes": true|false},
    "intermediate": {...},
    "advanced":     {...}
  },
  "fc2": { same shape as fc1 },
  "fc3": {
    "pairedTPValue": 0.XX,
    "tokenReductionPct": 0.XX,
    "wallClockReductionPct": 0.XX,
    "passes": true|false
  },
  "fc4": {
    "intentSignature": "FANOUT(...) | ...",
    "skillcraftFamilies": ["..."],
    "finchainTopics": ["..."],
    "passes": true|false
  },
  "fc5": {
    "skillcraftRegressionScorecardPath": "eval/skillcraft/results/...",
    "fourVector": {"correctness": "NEUTRAL", "tokens": "PASS", "wallClock": "PASS", "sigma": "NEUTRAL"},
    "passes": true|false
  },
  "codeModeHarness": {
    "note": "diagnostic only; FC1-FC5 semantics unchanged",
    "layers": {
      "benchmarkSafety": {
        "status": "proven|weak|blocked",
        "requirement": "preserve correctness before treating reuse or compression as useful"
      },
      "codeModeContract": {
        "status": "weak",
        "requirement": "prove the VFS/TypeScript surface matches runtime behavior",
        "evidenceOutsideScorecard": ["tests/finchain-workspace-surface.test.ts"]
      },
      "learningLoop": {
        "status": "proven|weak|blocked",
        "requirement": "repeated intents crystallise tenant helpers and warm episodes call them through df.lib"
      },
      "reuseEvidence": {
        "status": "proven|weak|blocked",
        "requirement": "separate prompt-directed reuse from filesystem-discovered and held-out reuse"
      },
      "compression": {
        "status": "proven|weak|blocked",
        "requirement": "learned path preserves accuracy and clears a minimum cost-reduction threshold"
      },
      "libraryMaturity": {
        "status": "proven|weak|blocked",
        "requirement": "learned helpers stay inside hook/quarantine governance and expose replay/change/verifier/rollback contracts"
      },
      "generality": {
        "status": "proven|weak|blocked",
        "requirement": "separate within-domain reusable harness behavior from strict cross-benchmark same-signature transfer"
      }
    }
  },
  "cacheBoundedByFramework": true,
  "substrateCommitSha": "..."
}
```

Goal 5 is MET when `r1-r9-scorecard.json#allPass === true` AND `finchain-scorecard.json#fc1.allPass && fc2.allPass && fc3.passes && fc4.passes && fc5.passes`.

The `codeModeHarness` section answers a different question: whether the
code-centric product architecture is moving in the right direction. It can
show useful product progress while Goal 5 remains unmet.

For a diagnostic layer to be `proven`, the current scorer requires at least
three paired episodes, at least three warm reuse opportunities for learning-loop
and compression claims, at least 10% token-or-wall reduction for compression,
and helper maturity evidence beyond quarantine: replay contract, change
contract, verifier, and rollback fields. Prompt-directed helper calls are
reported separately from filesystem-discovered or held-out discovered reuse.
