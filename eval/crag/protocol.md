# CRAG Matched-Arm Paired-Comparison Protocol

> The canonical protocol for the Goal 5 paired-comparison test. Mirrors the
> SkillCraft P1 paired-comparison protocol (see
> `experiments/archive/2026-05-goal4-skillcraft/p1-matched-arm-spec.md` for
> the SkillCraft-side spec). Two arms, identical except for one env-var flag.

## Arms

| Arm           | Substrate observer | Lib-cache live | Env vars                       |
|---|---|---|---|
| `substrate-on`  | yes               | yes            | (defaults)                      |
| `substrate-off` | no                | no             | `DATAFETCH_DISABLE_LEARNING=1` |

The single-flag difference is what makes this a clean matched-arm test. Both
arms see identical prompts, identical CRAG mock-API surface, identical
agent backend, identical retry budget, identical seed.

## Agent backend

- Model: `claude-sonnet-4-6`
- Effort: `low`
- CLI: `claude-p` (via `CLAUDE_CLI=claude-p`)
- Allowed tools: `Bash(datafetch *) Bash(cat *) Bash(ls *) Bash(jq *)`
- No `Read` tool (forces the agent through the substrate's `df.*` surface)

## Sampling

- Public split: 2,706 records (validation + public test from CRAG KDD Cup
  2024).
- Small-N probe (iter6): 50 questions stratified as 5 domains × 2 question
  types × 5 instances. Strata: random within each cell.
- Full eval: all 2,706 records, sequential.

## Per-question artefacts

Each arm × question writes to `eval/crag/results/datafetch/<run-id>/`:

```
<interaction_id>/
  workspace/                  # the agent's intent-workspace mount
    scripts/answer.ts          # what the agent wrote
    df.d.ts                    # the typed manifest the agent saw
    lib/                       # tenant overlay (substrate-on only)
    db/                        # substrate-view of CRAG mock APIs
    .datafetch-ctx.json        # episode context
  trajectory.json              # the recorded primitive-call sequence
  answer.json                  # the agent's df.answer(...) envelope
  grading.json                 # CRAG tri-state score, alt-ans matches
  cost.json                    # tokens, wall-clock, llm-calls, cache stats
```

These are normalised by `score-r1-r10.ts` into the per-arm `normalized.jsonl`
that drives the report.

## Statistics

- **R1 / R3 / R7** (binary or rate metrics): McNemar's test on per-instance
  pass/fail across the matched arm, two-sided.
- **R2 / R4** (continuous metrics): paired t-test on per-instance
  log-token-count / log-wall-clock-ms.
- **R10** (calibration): bootstrap CI on per-slice Brier delta.

Per-slice McNemar is reported for every (domain × question_type) cell with
≥ 20 questions (≈ 40 cells on the full eval). Smaller cells reported with
exact-binomial CI only.

## SkillCraft non-regression gate

Every iteration that touches `src/` re-runs `pnpm eval:skillcraft` on the
new substrate hash before the CRAG run is allowed to count. The SkillCraft
re-run uses the iter164-equivalent config and asserts:

| Axis      | Floor                                  |
|---|---|
| R1        | ≥ 0.929                                 |
| R2 tokens | ≤ Arm A P1 baseline (1,951)             |
| R3 errors | ≤ 0.016                                  |
| 4-vector  | ≥ {NEUTRAL, PASS, PASS, NEUTRAL}        |

If any axis fails, the CRAG iteration is logged as FAILED on the
non-regression gate regardless of the CRAG result.

## Reproducibility

- Seed: fixed per run via `DATAFETCH_SEED`; recorded in the per-run config.
- Substrate git hash: recorded in every per-run config and in the
  EXPERIMENTS.md row.
- Anthropic API version: recorded once per run-base.
- `pnpm install` lockfile: pinned via the worktree's `pnpm-lock.yaml`.

## What this protocol does *not* control for

- Anthropic API health (iter164 caveat: the dominant variance source). If a
  run shows R3 > 0.05 from infrastructure errors, the run is invalidated
  and re-run on a quieter day.
- LLM-judge stochasticity in the CRAG grader. Rule-based R1 is primary;
  LLM-judge R1 is reported separately.
- Cross-arm cache leakage. The substrate-on arm runs first (cold lib-cache);
  the substrate-off arm runs immediately after on the SAME Anthropic
  prompt-cache state. This is by design — the framework cache is the same
  in both arms.
