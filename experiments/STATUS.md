# Project status: SkillCraft learning-loop iterations

> Snapshot refreshed 2026-05-18 after the post-P1 substrate fixes
> (AST mixed-nullish rewriter, single-key wrapper unwrap, AST
> String-coercion rewriter). Updated when a goal cycle closes;
> intermediate progress lives in [EXPERIMENTS.md](./EXPERIMENTS.md)
> and [EXPERIMENT_NOTES.md](./EXPERIMENT_NOTES.md). Full chronological
> arc in [`experiment-history.md`](experiment-history.md).

## Current state (2026-05-18, post-P1-followups)

**P1 anti-patterns are addressed.** The three families flagged in the
P1 paired comparison (pokeapi-pokedex/m1, random-user-database/m2,
recipe-cookbook-builder/e3) were each root-caused to specific
substrate defects, and three follow-up commits landed on main 2026-05-18:

| Commit | Fix | Recovers |
|---|---|---|
| `14bae808` | AST-based `rewriteMixedNullishLogicalExpressions` (replaces a regex that missed nested-paren receivers) | random-user-database/m2, recipe-cookbook-builder/e3 (esbuild `Cannot use "??" with "\|\|" without parens`) |
| `4555f968` | Generic single-key wrapper unwrap rule in `unwrapToolPayload` (covers `{pokemon: {...}}`, `{show: {...}}` shapes without smuggling benchmark identifiers) | pokeapi-pokedex/m1 (silent empty-data output, score 68.6 → 91.4 in re-smoke) |
| `7d416692` | AST-based `rewriteUnsafeStringCoercionCalls` (replaces a regex that couldn't cross internal parens) | Pre-emptive coverage of receivers like `(fn(a) ?? gn(b)).includes(...)`; same parser-shaped class as the mixed-nullish rewriter |

374/374 vitest tests pass; full typecheck clean. Each substrate fix
was smoke-validated end-to-end on the originally-failing task
(pokeapi/m1 now scores 91.4, usgs/m2 still 100).

**Projected P1 re-eval after fixes:** Arm A R1 climbs from 92.9% →
~95.2% (matching Arm B), flipping the 4-vector from
`{NEUTRAL, PASS, PASS, NEUTRAL}` toward `{NEUTRAL-leaning-positive,
PASS, PASS, NEUTRAL}` or `{MARGINAL, PASS, PASS, NEUTRAL}`. The cost
and wall-clock wins (-41% / -17%) should be at least preserved
because the fixes reduce failed-then-retried agent loops on the same
3 episodes.

## P1 matched-arm paired comparison (2026-05-17)

**P1 matched-arm paired comparison: substrate produces measurable cost
advantage, neutral on pass rate.** Branch
`goal4-p1-matched-arm-skillcraft`. Both arms ran Claude `sonnet-4-6`
+ `claude-p` over full-126, identical prompt skeleton, identical
df.tool / df.db / per_entity seed; the only difference was
`DATAFETCH_DISABLE_LEARNING=1` on Arm B (skips hydrateFamilyLibCache,
installObserver, persistFamilyLibCache).

4-vector verdict: `{NEUTRAL, PASS, PASS, NEUTRAL}`.

| Dim | Arm A (ON) | Arm B (OFF) | Δ | Verdict |
|---|---|---|---|---|
| Pass rate | 92.9% (117/126) | 95.2% (120/126) | -2.4pp | NEUTRAL (McNemar p=0.25) |
| Effective tokens | 1,951 | 3,324 | -41% | **PASS** (paired t p≈0) |
| Wall-clock | 45.6s | 55.1s | -17% | **PASS** (paired t p<0.0001) |
| Token σ | 828 | 1,038 | -20% | NEUTRAL (no formal test) |

17/21 families: same 100% pass rate with substrate-ON using 10-57%
fewer tokens (median ~40%). 3 families regress by 1 episode each
(pokeapi-pokedex, random-user-database, recipe-cookbook-builder),
flagged as anti-patterns to investigate. cat-facts-collector fails
0/6 on both arms (task-scorer ceiling issue, same as iter164).

Report: `eval/skillcraft/results/datafetch/goal4-p1-paired-comparison-20260517.md`.

The substrate's contribution under a strong agent backend is **cost
efficiency, not correctness**. Pass-rate headroom on Claude
sonnet-4-6 at low effort is too narrow to show a correctness signal;
the substrate's measurable advantage is repeated tool-fanout
consolidation that drops per-task tokens by ~40% and wall by ~17%.
Two PASS + two NEUTRAL + zero REGRESSION clears the "respectable
graduation" bar in the P1 spec (≥ 3 PASS or MARGINAL would be a
strong claim; we have 2, with directional improvement on the other
two that the test design can't significantly distinguish).

**Goal 4 declared MET on iter164** (Claude full-126, all R1-R9 + the
qualifications) under the `cacheBoundedByFramework` rule. iter164
satisfies the user's "R1-R9 all hold simultaneously on ONE
instrumented full-126 run + the smokes" formulation. See
EXPERIMENT_NOTES lines 2152-2238 for the iter164 scorecard.

The P1 Arm A scorecard reproduces iter164's MET status: R1=0.929,
R2=1951, R3=0.016, R4=0, R6=0.833, R7=0.846, R8=0.643, R9=PASS
(FANOUT-tool transfer across families). All 8 official gates PASS,
re-validating the iter164 substrate state under the tightened scorer.

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

**Goal 4 P2 closed 2026-05-17, NEUTRAL verdict (revised 2026-05-18).**
Non-SkillCraft cross-eval against jsonplaceholder.typicode.com
archived at `eval/productFlow/results/p2-defensive-evidence-20260517/`.

The original verdict reported a 4.66× cost regression on the
substrate-on arm. Follow-up investigation on 2026-05-18 showed that
was a HARNESS ARTIFACT, not a substrate property — the substrate's
`AGENTS.md` / `CLAUDE.md` / `df.d.ts` workspace contract was being
written to `<DATAFETCH_HOME>/` but never propagated into the
per-episode `workspace/` cwd the agent's `claude-p` actually used. A
corrected `--workspace-lib` arm that mirrors the substrate-shipped
project memory into the workspace + drops the MUST-cat instruction
from the task prompt brings cost to 1.70× one-shot (≈baseline
session-cached).

Revised 5-claim verdict on the corrected arm:
- Crystallisation: PASS (`toolFanout` from e2)
- Discovery (no leak): PASS (substrate manifest, not task prompt)
- Reuse: FAIL on auto-crystallised content; CONFIRMED PASS on
  hand-authored rich helpers (`userPostSummary`). The auto-crystallised
  `toolFanout` is too thin to beat the agent's 5-line `Promise.all`
  reflex; richer helpers DO get reused via the same skill-progressive-
  disclosure pipeline.
- Cost: NEAR-NEUTRAL one-shot, expected ≈baseline session-cached.
- Correctness: 3/3 both arms.

Architectural diagnosis: the substrate's *infrastructure* (observer,
seed, df.d.ts, AGENTS.md, lib/ overlay) transfers off SkillCraft and
runs at acceptable cost. The substrate's *crystallisation policy* is
the open issue — it authors helpers thin enough that agents prefer
re-deriving inline. Next iteration target: narrow the observer's gate
to compositions that meaningfully exceed the inline-rewrite cost.

Branch: `goal4-p2-product-flow-cross-eval`. Follow-up artifacts in
`eval/productFlow/results/p2-skills-disclosure-*/` and
`eval/productFlow/preseed-rich-helper/`.

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
- `experiments/archive/2026-05-goal4-skillcraft/academic-design-directions.md`,
  `experiments/archive/2026-05-goal4-skillcraft/goal4-battle-of-ideas-goal.md` —
  research direction notes for the next phase.
- This narrative-sync commit + four new docs:
  `intent-shape-interface.md`, `eval-rubric.md`,
  `archive/2026-05-goal4-skillcraft/post-iter164-paper-digests.md`, `experiment-history.md`.

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
| [`experiment-history.md`](experiment-history.md) | future-readable narrative of every meaningful iteration |
| [`../kb/docs/intent-shape-interface.md`](../kb/docs/intent-shape-interface.md) | the data-shape → intent-shape interface pivot |
| [`../eval/skillcraft/rubric.md`](../eval/skillcraft/rubric.md) | honest R1-R9 + qualifications description |
| [`archive/2026-05-goal4-skillcraft/post-iter164-paper-digests.md`](archive/2026-05-goal4-skillcraft/post-iter164-paper-digests.md) | 3 new paper digests (Memory Transfer / f(g(x)) composition / UCT critic) |
| [`archive/2026-05-goal4-skillcraft/academic-design-directions.md`](archive/2026-05-goal4-skillcraft/academic-design-directions.md) | ReGAL / PSN / SkillX translations |
| [`archive/2026-05-goal4-skillcraft/goal4-battle-of-ideas-goal.md`](archive/2026-05-goal4-skillcraft/goal4-battle-of-ideas-goal.md) | Goal-4 Battle-of-Ideas bootstrap (archived) |
