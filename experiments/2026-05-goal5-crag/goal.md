# Goal 5 — CRAG eval cycle

> Canonical `/goal` condition string for this cycle. Pasted into Claude Code
> `/goal` on 2026-05-18 to activate the session-scoped Stop hook. Total length
> 3,187 characters (well under the 4,000-char ceiling).

## Goal 5 condition

```
Land Goal 5 — CRAG eval cycle. Ship an operational CRAG eval harness at `eval/crag/` mirroring `eval/skillcraft/`'s layout (adapters/, configs/, manifests/, scripts/, vendor/, results/, README.md, rubric.md, protocol.md, proof.md, runbook.md) and an active cycle directory at `experiments/2026-05-goal5-crag/` mirroring the archived `experiments/archive/2026-05-goal4-skillcraft/` (README.md, STATUS.md, PLAN.md, EXPERIMENTS.md, EXPERIMENT_NOTES.md, goal.md, plus per-iteration design docs), verified by a matched-arm paired-comparison report at `eval/crag/results/<run-id>/paired-comparison.md` covering all 5 domains × 8 question types × head/torso/tail × static/slow/fast/realtime slices over the 2,706-question CRAG public split, where substrate-ON beats substrate-OFF on ≥3 of 4 axes (R1 tri-state correctness, R2 effective tokens, wall-clock, R3 runtime errors) AND helper-reuse (R7) fires on at least one sibling-template family, while the SAME substrate git hash holds the SkillCraft iter164/P1 baseline (R1 ≥ 0.929, R2 ≤ baseline tokens, R3 ≤ 0.016, 4-vector ≥ {NEUTRAL, PASS, PASS, NEUTRAL}) on a fresh `pnpm eval:skillcraft` re-run, with `pnpm test` reporting 374/374 pass and `pnpm typecheck` clean — all four (CRAG report, SkillCraft scorecard, test summary, typecheck output) visible via `cat`/`pnpm` to the evaluator's transcript. All work happens in a new git worktree branched from `main` (e.g. `../df-goal5-crag`); do not touch the main checkout, do not push to origin, do not open PRs without explicit user approval. Allowed file scope: `eval/crag/` (new harness), `experiments/2026-05-goal5-crag/` (new cycle dir), `src/observer/`, `src/snippet/`, `src/eval/`, `src/sdk/`, `src/trajectory/`, `src/adapter/`, `src/hooks/`, `scripts/crag-probe/`, and new entries under `kb/br/`; do not modify `kb/mission.md`, `kb/product-design.md`, `kb/market.md`. Any benchmark-specific shortcut in substrate code (e.g. `if (benchmark === 'crag')`, hard-coded CRAG tool names in render functions, CRAG paths in the observer, regex-matched CRAG identifiers in the gate) is a hard reject — the substrate must remain generic so SkillCraft and every future benchmark inherit every fix. Follow the cycle workflow documented in `experiments/README.md` § "How a goal cycle works" (read EXPERIMENTS.md → state hypothesis in EXPERIMENT_NOTES.md → implement against substrate → probe on single domain → validate on held-out pair → full-eval → commit headline → append curated entry). Log each iteration as a curated entry in `experiments/2026-05-goal5-crag/EXPERIMENTS.md` using the project's standard format (EN: title, Date, Goal, Hypothesis, Lever, Change, Probe, Validate, Full-eval, Status, Lessons, Artefacts) with the substrate git hash and links to both benchmarks' scorecards, plus a raw timestamped entry in `experiments/2026-05-goal5-crag/EXPERIMENT_NOTES.md` capturing the implement/probe/validate/analyze stages. On block, append a BLOCKED entry to EXPERIMENT_NOTES.md with attempted paths, evidence gathered, the specific generic-vs-benchmark-specific tension that surfaced, and the input that would unlock progress.
```

## Worktree placement (correction to the goal-text example)

The goal text's worktree example reads `../df-goal5-crag`. The actual
worktree per project convention is at
`.claude/worktrees/eval+crag/` (branch `worktree-eval+crag`). Mirrors
existing worktrees like `.claude/worktrees/eval+finchain` and
`.claude/worktrees/br16-benchmark-shape-probe`.

## Slot ledger

| Slot               | Source                                                                                       |
|---|---|
| Outcome            | matched-arm paired-comparison report + SkillCraft non-regression                            |
| Verification       | `cat eval/crag/results/<run-id>/paired-comparison.md`, `pnpm eval:skillcraft`, `pnpm test`, `pnpm typecheck` |
| Constraints        | SkillCraft P1/iter164 baseline holds, 374/374 tests, typecheck clean, no benchmark shortcuts |
| Boundaries         | worktree only, named file scope, no pushes/PRs, kb/mission|product-design|market untouched   |
| Iteration logging  | EXPERIMENTS.md curated + EXPERIMENT_NOTES.md scratchpad in this cycle dir                    |
| Blocked condition  | BLOCKED entry to EXPERIMENT_NOTES.md with attempted paths, evidence, tension, unlock-input   |

## Lineage

- Goal 1 (DONE): 94.4% pass on full-126 SkillCraft, learning loop disabled.
- Goal 2 (PARTIAL 6/7): learning loop fires end-to-end on pilot families.
- Goal 3 (closed at 3/7): full-126 88.9% pass; observer keyed on syntactic
  shapeHash, three thresholds unmet.
- Goal 4 (MET on iter164 with caveats, 2026-05-17): R1-R9 PASS on Claude
  full-126 under `cacheBoundedByFramework` rule.
- **Goal 5 (active, 2026-05-18-)**: prove the substrate is generic by landing
  measurable wins on a second benchmark (CRAG) without regressing SkillCraft.

## Why CRAG, why now

Decision rationale is in [`kb/br/16-substrate-benchmark-scouting.md`](../../kb/br/16-substrate-benchmark-scouting.md).
Pre-iteration probe findings (run against the
`decouple-substrate-from-skillcraft` branch state, NOT main) are in
[`kb/br/17-crag-shape-probe-findings.md`](../../kb/br/17-crag-shape-probe-findings.md).
The br/17 findings need re-validation against this cycle's main-based
substrate state — that is iter1.
