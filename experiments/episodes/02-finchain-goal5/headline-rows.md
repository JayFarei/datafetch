# Goal 5 — FinChain iteration headlines

> Committed headline row per Goal 5 iteration. Mirrors the goal4
> `hook-registry-iteration-headlines.md` table; this is the public
> face of the FinChain integration cycle. Per-iteration commits
> append one row here; the substrate change + the analysis JSON + the
> error taxonomy JSON live under
> `eval/finchain/results/datafetch/<run-base>/`. See
> `experiments/PLAN.md` § Goal 5 for the per-iteration cadence and
> `experiments/EXPERIMENTS.md` for the full hypothesis → change →
> result → lessons entries.

## Bilateral non-regression invariant

Every Goal 5 iteration must hold the SkillCraft iter164 baseline as a
floor:

- R1 ≥ 0.92 (passRate), R2 ≤ 8,000 (avgEffectiveTokens), R3 ≤ 0.05
  (runtimeErrorRate), R4 ≤ 0.03 (quarantine), R5 novel-tenant smoke
  green, R6 ≥ 0.80 (convergence rate), R7 ≥ 0.60 (conditional reuse),
  R8 dual gate {mean ≤ 0.70 AND per-pair pass-fraction ≥ 0.70}, R9
  cross-shape transfer across ≥ 2 SkillCraft families.

A SkillCraft regression that breaks any of these on the Goal 5
substrate commit REJECTS the iteration; the substrate change must be
reverted or generalised before the next attempt. See PLAN.md § Goal 5
"Bilateral non-regression check" for the protocol.

## Headline schema

Each row records one accepted iteration. "Accepted" means the
bilateral full run completed and `pnpm test` + `pnpm typecheck` were
green. Failed iterations get an EXPERIMENTS.md entry but do not
populate this table.

| iter | date | substrate change (SHA) | FinChain instances (size, model, backend) | FC1 (FAC vs paper) | FC2 (step-align vs paper) | FC3 (ON vs OFF, paired t) | FC4 (cross-bench transfer) | FC5 (SkillCraft 4-vector) | R1 | R6 | R7 | R8 | R9 | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

## Iteration rows

(empty — populated as iterations land starting with iter 5; iters 0-4
are infrastructure-only per the PLAN.md schedule and do not produce a
bilateral scorecard)

## Closing summary (added when Goal 5 declared MET)

(to be appended on declare-met turn; includes the substrate commit
SHA, the final bilateral scorecard paths, the cross-benchmark transfer
witness, and a note on which iterations contributed the decisive
movement)
