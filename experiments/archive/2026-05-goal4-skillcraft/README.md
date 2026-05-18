# archive / 2026-05 / goal-4 SkillCraft cycle

Goal-4-specific working documents archived 2026-05-18 after the substrate fixes landed and the SkillCraft iteration arc closed. The multi-goal living docs (PLAN, STATUS, EXPERIMENT_NOTES, EXPERIMENTS, experiment-history, goal, README) stayed at the top of `experiments/`.

## Files

- [`p1-matched-arm-spec.md`](./p1-matched-arm-spec.md) — Goal-4 P1 spec: matched-arm performance proof on SkillCraft. Outcome lives in [`../../STATUS.md`](../../STATUS.md) § "P1 matched-arm paired comparison" and in [`../../../eval/skillcraft/results/datafetch/goal4-p1-paired-comparison-20260517.md`](../../../eval/skillcraft/results/datafetch/goal4-p1-paired-comparison-20260517.md).
- [`p2-product-flow-spec.md`](./p2-product-flow-spec.md) — Goal-4 P2 spec: non-SkillCraft cross-eval against jsonplaceholder. Outcome lives in [`../../STATUS.md`](../../STATUS.md) § "Goal 4 P2".
- [`academic-design-directions.md`](./academic-design-directions.md) — planning note that turned the ReGAL / PSN / SkillX academic ideas into concrete substrate/SkillCraft probes during the Goal 4 attack loop.
- [`post-iter164-paper-digests.md`](./post-iter164-paper-digests.md) — four-paper research digest (Memory Transfer / f(g(x)) composition / UCT critic / SkillCraft) collected after iter164 closed.
- [`hook-registry-iteration-headlines.md`](./hook-registry-iteration-headlines.md) — committed headline-row table per SkillCraft iteration across the full Goal 1-4 arc. The append-one-row-per-iter pattern closed at iter167; future evidence lives in [`../../experiment-history.md`](../../experiment-history.md) and per-eval reports under `../../../eval/`.

## Why these were archived

Each was a goal-cycle-scoped working document — written for the cycle, fully consumed by it, no longer mutated. Keeping them in the top of `experiments/` made the folder read as "what is the project doing right now?" when most of it was actually "what did we do last cycle?". Future readers who want the chronology should start with [`../../experiment-history.md`](../../experiment-history.md); future readers who want the current state should start with [`../../STATUS.md`](../../STATUS.md).
