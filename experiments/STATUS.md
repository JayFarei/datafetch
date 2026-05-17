# Project status: SkillCraft learning-loop iterations

> Snapshot refreshed 2026-05-17 after the post-iter164 Codex audit
> and the rubric reframe. Updated when a goal cycle closes;
> intermediate progress lives in [EXPERIMENTS.md](./EXPERIMENTS.md)
> and [EXPERIMENT_NOTES.md](./EXPERIMENT_NOTES.md). Full chronological
> arc in [`../docs/experiment-history.md`](../docs/experiment-history.md).

## Current state (2026-05-17)

**Goal 4 declared MET on iter164** (Claude full-126, all R1-R9 + the
qualifications) under the `cacheBoundedByFramework` rule. iter164
satisfies the user's "R1-R9 all hold simultaneously on ONE
instrumented full-126 run + the smokes" formulation. See
EXPERIMENT_NOTES lines 2152-2238 for the iter164 scorecard.

**MET comes with caveats.** A Codex adversarial review on 2026-05-17
caught:

- The normalizer was silently dropping `agentCachedInputTokens` —
  iter164's "0/126 cache nonzero" headline was a measurement artifact.
  Real value is 126/126 cache>0 (Anthropic prompt cache is on by
  default for `claude --print` and cannot be disabled).
- R8's mean-only gate accepted pairs with 1.0+ ratios. Tightened to a
  dual gate: mean ≤ 0.70 AND per-pair pass-fraction ≥ 0.70.
- Benchmark-shaped envelope keys (`pokemon`, `species`, `show`,
  `university`, `details`) had leaked into the substrate's
  envelope-unwrap allowlist — SkillCraft shape bleeding into generic
  code. Removed; the generic success/ok-envelope rule covers them.

The cache qualification was reframed as `cacheBoundedByFramework`:
reject only inter-episode state leak inside our substrate, not the
framework-level prompt caching that `claude --print` / `claude-p`
applies unavoidably. **Under the tightened scorer iter164
re-validates as PASS on R1-R9 + framework-bounded cache, and FAILs
the strict cache-tokens-zero reading.** The user accepted the reframe
on 2026-05-17.

**The user has pivoted framing.** SkillCraft has served its purpose
(it proved skill-based learning works; arxiv:2603.00718). Next focus
is the VFS + code-mode-as-learning-interface story: how the substrate
behaves on real product flows rather than benchmark slices, with the
agent as both consumer and implicit developer of its own interface.

**Goal 4 P2 closed 2026-05-17, NEUTRAL verdict.** Non-SkillCraft
cross-eval against jsonplaceholder.typicode.com archived at
`eval/productFlow/results/p2-defensive-evidence-20260517/`. 5-claim
scorecard: crystallisation PASS (`toolFanout.ts` learned from e2),
discovery PASS (warm prompts contain 0 occurrences of the learned
helper name, harness validator enforces), reuse PASS (e3 substrate-on
trajectory contains `lib.toolFanout` — agent discovered the helper via
`cat df.d.ts` and called it from `scripts/answer.ts`), correctness PASS
both arms 3/3, cost REGRESSION substrate-on warm 6749 effective tokens
vs off 1448 (-4.7×). Mechanically transfers off SkillCraft; cost
crossover is past this 3-episode micro-scale. Branch:
`goal4-p2-product-flow-cross-eval`.

## Recent iterations (iter150-167) — headline

| iter | scale | backend | R1 | R6 | R8 | gates PASS |
|---|---|---|---|---|---|---|
| 153 | 36 | codex-direct | 0.97 | 0.80 | 0.71 | 6/8 |
| 156 | 36 | codex-direct | 1.00 | 1.00 | 0.74 | 7/8 |
| 158 | 36 | codex-direct | 0.97 | 1.00 | 0.66 | **8/8** |
| 159 | 126 | codex-direct | 0.95 | 0.71 | 0.73 | 6/8 |
| 160 | 36 | claude | 0.97 | 1.00 | 0.79 | 7/8 |
| 161 | 126 | claude | 0.48 | 1.00 | 0.55 | 5/8 (Anthropic 500s; invalidated) |
| 164 | 126 | claude | 0.94 | 1.00 | 0.67 | **8/8** (MET; caveats above) |
| 165-167 | probe | claude | — | — | — | V1 ReGAL / V2 PSN gate experiments, inert at probe scale |

Iter158 was the first crossing of all 8 gates simultaneously, on the
small-suite codex-direct slice. iter164 is the only full-126 crossing.
Both depend on classifier luck — iter156 and iter160 sit just outside
the gate with identical substrate.

## What is now committed vs uncommitted

Just-completed tidying landed 10 commits (`ca8a2707` → `cd7450e1`):

- The four generic substrate patches (success/ok-envelope unwrap,
  multi-line `??`/`||` rewriter, generic `rowsOf`, String() coercion).
- V1 ReGAL gate + V2 PSN maturity scaffolds in `src/observer/gate.ts`
  + `src/observer/template.ts`, behind env flags. INERT at small
  scale: the 5 helper templates pass the V1 gate by construction;
  V2 demotion needs more data than the 36-row probe gives.
- `score-r1-r9.ts` tightened: dual R8 gate + cache-tokens normalizer
  fix + `cacheBoundedByFramework` qualification.
- `eval/skillcraft/scripts/fanout-slot-diagnostics.ts` — the
  iter150-era slot verifier, productionised.
- `tests/skillcraft-full-datafetch-planner.test.ts` — 125+ tests
  guarding the four substrate patches.
- `docs/goal4-academic-design-directions.md`,
  `docs/goal4-battle-of-ideas-goal.md` — research direction notes
  for the next phase.
- This narrative-sync commit + four new docs:
  `intent-shape-interface.md`, `eval-rubric.md`,
  `post-iter164-research.md`, `experiment-history.md`.

EXPERIMENT_NOTES.md still ends at iter164 (line 2238). iter165-167 +
the 2026-05-17 Codex audit + the reframe entries need to be appended
before the next overnight run. The history doc has the canonical
narrative covering them.

## The four substrate patches (landed iter153 → iter164)

All generic, no benchmark identifiers, all test-covered:

1. **Success/ok-envelope unwrap** — `src/observer/author.ts` (4
   templates) + `src/eval/skillcraftFullDatafetch.ts` runtime
   answer-kit. If a wrapper has `success`/`ok` boolean + exactly
   one non-metadata payload key, unwrap. Replaces the legacy
   `envelopeKeys` allowlist for the common REST shape.
2. **Multi-line `??`/`||` rewriter** —
   `src/eval/skillcraftFullDatafetch.ts` `rewriteMixedNullishLogicalExpressions`.
   Paren-depth segmentation + iterated parenthesisation. Fixes
   prettier-wrapped const RHS the per-line rewriter missed.
3. **Generic `rowsOf`** — `renderAnswerKitSource()` traverses
   `value/data/results/items/records/rows/entries/list` + one
   unwrap chain. Lets the agent read lists out of tool responses
   without local `getList`-style helpers.
4. **String() coercion** — `rewriteUnsafeStringCoercionCalls`.
   Wraps `(expr-with-??).toLowerCase()` / `.toUpperCase()` /
   `.includes()` etc. in `String()`. Fixes
   `entity.toLowerCase is not a function` when nullish-fallback
   short-circuits on a number/boolean.

Scorer fixes landed alongside:

- Dual R8 gate (mean + per-pair pass-fraction).
- Cache-tokens normalizer now reads `agentCachedInputTokens`
  correctly; cache qualification is `cacheBoundedByFramework`,
  not strict zero.
- Benchmark-shaped envelope keys removed from the unwrap allowlist.

## Open caveats

- **iter164 MET was fragile.** Anthropic API health is the dominant
  variable: iter161 (same substrate, ~24h earlier) had 114/126
  500-errors and scored R1=0.48 / R3=0.29. iter164 ran clean.
  Single-shot MET; not yet replicated. iter168 (overnight B1) tests
  reproducibility.
- **V1 ReGAL + V2 PSN are inert at this scale.** All 5 current helper
  templates pass V1 by construction; V2 maturity demotion needs more
  data than the small probe collects. Iter167a/b parallel experiment
  confirmed neither gate moves the rubric.
- **Per-helper R8 cost drop is structurally bounded by Claude's
  already-compact output.** ~1600-token baselines leave little
  helper-saving room before hitting LLM-call overhead floors.
  Cross-family pairs always weak; same-family pairs (usgs) carry
  the mean.
- **codex-direct full-126 (iter159) on the same substrate is 6/8.**
  R6 (compositional clusters) and R8 (cross-family per-row complexity)
  fail. Goal 4 MET is Claude-specific.
- **Strict cache-tokens-zero is unachievable with `claude --print`.**
  The reframe is honest about why; future qualification language must
  distinguish substrate-level state leak from framework-level caching.

## Next phase — overnight goals B1/B2/B3

Pointer to PLAN.md § "Next phase":

- **B1 — iter168 honest re-eval.** Re-run Claude full-126 under the
  tightened scorer (dual R8 + `cacheBoundedByFramework` + benchmark-
  keys-removed substrate). Confirm iter164's MET is reproducible
  across ≥ 2 runs, not a single-run Anthropic-uptime artifact.
- **B2 — insight layer probe.** Memory-Transfer / Insight pattern
  (Paper 5): add `@insight` YAML field to crystallised helpers
  (auto-generated title + description + generalised content). Probe
  whether the richer annotation surfaces enable semantic selectivity.
- **B3 — cold-to-warm via product flow.** Use the existing
  novel-tenant smoke (`src/observer/__smoke__/novel-tenant.ts`) as
  departure point. Validate the substrate's cold-to-warm wins
  generalise off SkillCraft.

## What this project is

Datafetch is a substrate that turns agent code into a recordable,
replayable, learnable execution surface. The agent writes a TypeScript
snippet against a typed `df.*` runtime; every primitive call is
captured into a trajectory; an observer crystallises common
compositions into typed callable helpers (`df.lib.<name>`) that
subsequent agent episodes see and reuse.

SkillCraft (21 task families × 6 difficulty levels = 126 tasks) was
the measurement surface for Goal 1-4. Harness lives in
[`eval/skillcraft/`](../eval/skillcraft/). The kb/ docs describe the
older FinQA cold-to-warm flow (Q1 chemicals → Q2 coal, 4 calls → 1
call); SkillCraft is a parallel evaluation track that has dominated
iter9+. Both share the same substrate primitives (observer, snippet
runtime, hook registry, intent signatures).

## Goal history (one line each)

- **Goal 1 (DONE).** 94.4% pass on full-126, 3,027 effective
  tokens/task, 0.8% runtime errors. Learning loop deliberately
  disabled.
- **Goal 2 (PARTIAL, 6 of 7).** Learning loop fires end-to-end on the
  pilot families. `avgLearnedInterfacesAvailable ≥ 2.0` structurally
  unreachable with the single-helper-per-family observer.
- **Goal 3 (closed at 3/7).** Full-126 = 88.9% pass; three thresholds
  unmet because observer keyed on syntactic `shapeHash`. Goal 4
  superseded with a learning-honest rubric.
- **Goal 4 (MET on iter164 with caveats; 2026-05-17).** R1-R9 all
  hold simultaneously on Claude full-126 + the smokes, under the
  `cacheBoundedByFramework` cache rule. See "Current state" above.

## Working files

| file | purpose |
|---|---|
| [`PLAN.md`](./PLAN.md) | current goal + iteration plan |
| [`EXPERIMENTS.md`](./EXPERIMENTS.md) | curated history of every iteration |
| [`EXPERIMENT_NOTES.md`](./EXPERIMENT_NOTES.md) | chronological scratchpad |
| [`goal.md`](./goal.md) | canonical `/goal` condition strings |
| [`STATUS.md`](./STATUS.md) | this file |
| [`../docs/experiment-history.md`](../docs/experiment-history.md) | future-readable narrative of every meaningful iteration |
| [`../docs/intent-shape-interface.md`](../docs/intent-shape-interface.md) | the data-shape → intent-shape interface pivot |
| [`../docs/eval-rubric.md`](../docs/eval-rubric.md) | honest R1-R9 + qualifications description |
| [`../docs/post-iter164-research.md`](../docs/post-iter164-research.md) | 3 new paper digests (Memory Transfer / f(g(x)) composition / UCT critic) |
| [`../docs/goal4-academic-design-directions.md`](../docs/goal4-academic-design-directions.md) | ReGAL / PSN / SkillX translations |
| [`../docs/goal4-battle-of-ideas-goal.md`](../docs/goal4-battle-of-ideas-goal.md) | candidate framings for goal 5 |
