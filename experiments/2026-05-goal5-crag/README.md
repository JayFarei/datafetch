# Goal 5 Cycle: CRAG eval harness alongside SkillCraft

> Active cycle. Started 2026-05-18. Successor to Goal 4 (SkillCraft, MET on
> iter164 with caveats). Lives in this directory so SkillCraft non-regression
> re-runs and CRAG iteration logs don't contend at `experiments/` root.

## Start here

- [`STATUS.md`](./STATUS.md) — what's been achieved this cycle, the
  per-iteration scorecard, gaps. Read first.
- [`PLAN.md`](./PLAN.md) — current phase, substrate changes in flight, next
  three iterations. Update when direction shifts.
- [`goal.md`](./goal.md) — canonical Goal 5 `/goal` condition string.
- [`EXPERIMENTS.md`](./EXPERIMENTS.md) — curated chronological log of every
  iteration (hypothesis → change → result → lessons).
- [`EXPERIMENT_NOTES.md`](./EXPERIMENT_NOTES.md) — raw scratchpad with
  real-time thoughts, dead-ends, open questions.

## How a Goal 5 iteration works

Identical to the Goal 4 / SkillCraft cycle workflow documented in
`experiments/README.md`, with one addition: every iteration that lands a
substrate change must also re-run SkillCraft to prove no regression.

1. Read `EXPERIMENTS.md` before forming a hypothesis.
2. State hypothesis in `EXPERIMENT_NOTES.md` (stage: `hypothesis`).
3. Implement against substrate (`src/observer/`, `src/snippet/`, `src/hooks/`,
   `src/eval/`). **Reject any benchmark-specific shortcut.**
4. Probe on a single CRAG domain (typically finance, the most templated).
5. Validate on a held-out CRAG domain pair.
6. Full CRAG eval (small-N first → 2,706 public split when stable).
7. **Re-run SkillCraft on the same substrate hash; assert iter164/P1 baseline
   holds.** This is the generic-substrate gate.
8. Commit headline row to this cycle's `iteration-headlines.md`.
9. Append complete entry to `EXPERIMENTS.md`.
10. `pnpm typecheck` clean, `pnpm test` ≥ 374 passing, working tree committed.

## What goes where

| this directory                     | eval harness (`eval/crag/`)     | kb (`kb/br/`)                   |
|---|---|---|
| session notes, plan, log, hypotheses | runner scripts, scorers, vendor | benchmark/probe background docs |
| iteration-by-iteration narrative   | matched-arm reports, manifests   | one-off scouting + findings     |
| Goal 5 condition string            | per-run scorecards under results/| 16-scouting, 17-probe-findings  |

## Worktree

This cycle runs in its own git worktree at
`.claude/worktrees/eval+crag/` branched from `main`. Branch:
`worktree-eval+crag`. The main checkout stays untouched. No pushes, no PRs
without explicit user approval. Project convention: worktrees go at
`.claude/worktrees/<name>/`, forward slashes in semantic names translate to
`+`, branch name is `worktree-<name>`.
