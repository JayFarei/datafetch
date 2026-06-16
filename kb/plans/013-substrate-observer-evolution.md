---
title: "feat: substrate observer evolution (learn from organic fetch-then-compute work)"
summary: "Make the learning loop see how agents actually work over bulk-mounted stores: composite-answer gate admission, authorFromSource on committed single-fetch trajectories, and composite-output replay equality, with plan-012's M1b/M1c probes as the frozen acceptance tests."
type: feat
status: proposed
date: 2026-06-11
related_research:
  - kb/plans/012-opentraces-arms-experiment.md
  - kb/plans/008-iter3-composition-density.md
---

# Substrate Observer Evolution (Track A)

Scoped from the plan-012 kill-gate terminal FAIL (episode 05 RUN-LOG Attempts 3-5). Three corpus-grounded requirements, each mapped to the exact diagnosed mismatch:

- R1. **Composite-answer gate admission.** Generalise the `DATAFETCH_GATE_PURE_COMPUTE` path (`src/observer/gate.ts`, `singleIsDbStarWithNumericAnswer`) so single-call db.* committed trajectories qualify when the answer is any validated envelope value (sets, series, objects), not only a finite scalar number. Dataset-neutral; opt-in flag semantics preserved.
- R2. **authorFromSource on organic trajectories.** A committed single-fetch + in-snippet-compute trajectory routes to `authorFromSource` capture (the agent's own composition parameterised from source), with origin-question = the workspace intent. The M1b/M1c artifacts are the fixture set.
- R3. **Composite-output replay equality.** Extend the quarantine validator's equality (numeric FAC + Phase-2 string/boolean) to structured outputs (order-insensitive sets, keyed objects, series with per-element tolerance), reusing the pack grader's answer_type semantics so eval and substrate share one equality notion.

Acceptance: re-run plan-012's M1b protocol UNCHANGED (same seed contract, same empty-scripts workspaces, same driver pinning) and obtain >=1 substance-qualifying helper crystallised AND callable-after-replay, plus zero regressions on the existing 43-suite substrate tests and the SkillCraft non-regression checks. The frozen probes are the point: the substrate evolves until the honest gate passes, not until a new bespoke test passes.

Not in scope: any pack/corpus changes; any prompt/mandate changes; cross-tenant promotion; recurrence-key work beyond the G1 carry-forward (key on shapeHash/template_id).

Design risk to respect: this touches `author.ts`/gate/validator, the historically design-laden area (see memory: Phase-2 #3 scoped + BLOCKED). Plan properly before building; this stub records scope, not design.
