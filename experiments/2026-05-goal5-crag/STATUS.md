# Goal 5 status

> Snapshot updated when a phase closes; intermediate progress lives in
> [PLAN.md](./PLAN.md), [EXPERIMENTS.md](./EXPERIMENTS.md), and
> [EXPERIMENT_NOTES.md](./EXPERIMENT_NOTES.md). Full chronological arc accrues
> in this file as iterations land.

## Current state (2026-05-18, cycle start)

**Goal 5 just-bootstrapped.** Worktree created at
`.claude/worktrees/eval+crag/` from `main` (commit
`ed2b6b5f3 docs(experiments): archive goal-4 SkillCraft cycle files; rename
descriptively`). Branch `worktree-eval+crag`. Cycle directory scaffolded with
this set of files. Eval harness scaffolded at `eval/crag/`.

**Carried-over starting context (from the on-branch work that produced the
scouting + probe artefacts):**
- `kb/br/16-substrate-benchmark-scouting.md` — the scouting brief that chose
  CRAG as the next benchmark.
- `kb/br/17-crag-shape-probe-findings.md` — the pre-cycle probe report. **Run
  against the on-branch substrate state of `decouple-substrate-from-skillcraft`
  (not main); findings need re-validation as iter1.**
- `scripts/crag-probe/crag-shape-probe.ts` — the hand-authored trajectory
  probe that produced br/17.

**Substrate state at cycle start:** `ed2b6b5f3` on main. The
`decouple-substrate-from-skillcraft` branch is ~2,182 insertions ahead
(`src/runtime/answerKit.ts`, `src/runtime/toolCatalog.ts`, observer/template/
author/install/gate modifications) and is NOT in this worktree. Substrate
changes for Goal 5 land in this worktree's `worktree-eval+crag` branch and
stay generic.

## P1/iter164 baseline (the non-regression floor)

The SAME substrate hash that produces the Goal 5 CRAG win must also re-run
SkillCraft full-126 at no worse than this:

| Axis      | Floor           | Source                                   |
|---|---|---|
| R1        | ≥ 0.929         | iter164 / P1 paired comparison, Arm A    |
| R2 tokens | ≤ baseline      | P1 paired comparison, Arm A 1,951 tokens |
| R3 errors | ≤ 0.016         | iter164                                  |
| 4-vector  | ≥ {NEUTRAL, PASS, PASS, NEUTRAL} | P1 (Arm A vs Arm B)           |
| Tests     | 374/374         | `pnpm test`                              |
| Typecheck | 0 errors        | `pnpm typecheck`                         |

## Phase status

| Phase | Description                                            | Status     |
|---|---|---|
| P0    | Cycle + harness scaffold                               | ✅ done    |
| P1    | Iter1 — re-probe substrate state under main            | ✅ done (PASSED, finding (A): br/17 replicates) |
| P2    | Iter2 — mock-API modeling probe (db.* vs tool.*)       | ✅ done (INCONCLUSIVE: both modelings have gaps) |
| P2.5  | Iter3 — hybrid db+lib modeling probe                   | dropped (diminishing returns; surfacing gap in real LLM-driven eval instead) |
| P3    | Vendor CRAG dataset (public split, 2,706 records)      | ✅ done (E3, 2026-05-19) |
| P4    | Build CRAG adapter (src/eval/cragFullDatafetch.ts)     | ⏳ next    |
| P3    | Resolve mock-API modeling (df.db.* vs df.tool.*)       | pending    |
| P4    | Build CRAG adapter (src/eval/cragFullDatafetch.ts)     | pending    |
| P5    | Build CRAG tri-state scorer + R1-R10 normalizer         | pending    |
| P6    | Small-N probe (50 questions) substrate-OFF + ON         | pending    |
| P7    | Substrate iteration loop until thresholds met           | pending    |
| P8    | Full 2,706-question eval + final paired-comparison      | pending    |

## Open questions (live)

1. **br/17 findings under main's substrate state.** The probe showed
   `FANOUT(tool)` signature collapse + literal data-shape-clone helper bodies.
   Main may have different observer behaviour (e.g. iter150+ intent-shape
   pivot fires differently). Iter1 re-runs the probe to confirm.
2. **Mock-API modeling: `df.tool.*` vs `df.db.*`.** br/17 used `tool.*`;
   `db.*` would push CRAG trajectories onto `FANOUT(db) → FANOUT(tool) → lib`
   shapes the substrate already crystallises. Resolve in iter2.
3. **R7 reuse rate floor.** Goal 5 threshold says "at least one
   sibling-template family." Tighter floor (e.g. ≥30% of templates show warm
   hits) would be a stronger USP claim but is a guessed number. Decide after
   small-N probe shows what the natural rate is.

## Goal history (one line each)

- **Goal 1 (DONE).** 94.4% pass on full-126 SkillCraft, lib-cache disabled.
- **Goal 2 (PARTIAL 6/7).** Learning loop fires end-to-end on pilot families.
- **Goal 3 (closed 3/7).** Full-126 88.9% pass; observer over-fit to
  SkillCraft shape; superseded by Goal 4.
- **Goal 4 (MET on iter164, 2026-05-17, with caveats).** R1-R9 all PASS on
  Claude full-126 under `cacheBoundedByFramework`.
- **Goal 5 (active).** Prove generic substrate by winning on CRAG without
  regressing SkillCraft.

## Working files

| file                    | purpose                                                                     |
|---|---|
| [`README.md`](./README.md)                       | pointer doc                                       |
| [`STATUS.md`](./STATUS.md)                       | this file                                         |
| [`PLAN.md`](./PLAN.md)                           | current phase, iteration schedule                  |
| [`goal.md`](./goal.md)                           | canonical Goal 5 condition string                  |
| [`EXPERIMENTS.md`](./EXPERIMENTS.md)             | curated chronological iteration log                |
| [`EXPERIMENT_NOTES.md`](./EXPERIMENT_NOTES.md)   | raw scratchpad, real-time thoughts                 |
| `../kb/br/16-substrate-benchmark-scouting.md`     | why CRAG (scouting brief)                          |
| `../kb/br/17-crag-shape-probe-findings.md`        | pre-cycle empirical findings on substrate shape    |
| `../eval/crag/`                                   | harness (rubric, protocol, runner, results)         |
| `../scripts/crag-probe/crag-shape-probe.ts`       | hand-authored trajectory probe                      |
