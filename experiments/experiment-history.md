# Experiment History — the long arc

> This is the consolidated narrative of the substrate's experimental
> arc. It exists so that a future contributor (or future-us) can read
> it cold and understand why the substrate is the way it is, what we
> tried and why, what worked, what didn't, and what's still open. It
> deliberately covers every meaningful pivot across Goals 1-4
> (iter1-iter167), not just the highlights. Source material:
> `experiments/EXPERIMENT_NOTES.md` (2238 lines, chronological
> scratchpad), `experiments/EXPERIMENTS.md` (curated 688 lines),
> `experiments/PLAN.md`, `experiments/goal.md`, `experiments/STATUS.md`,
> `kb/docs/intent-shape-interface.md`, `eval/skillcraft/rubric.md`,
> `experiments/post-iter164-research.md`, `experiments/goal4-academic-design-directions.md`,
> `experiments/goal4-battle-of-ideas-goal.md`, and the full git log.

## 1. What this project is

**Datafetch is a substrate that turns agent code into a recordable,
replayable, learnable execution surface.** The agent writes a
TypeScript snippet against a typed `df.*` runtime; every primitive
call is captured into a trajectory; an observer crystallises common
compositions into typed callable helpers (`df.lib.<name>`) that
subsequent agent episodes see and reuse. The interface improves per
tenant from observed usage; the substrate ships the *mechanism*, not
the tenant content.

The original product hypothesis traces to the FinQA cold-to-warm
demo (the `src/observer/__smoke__/finqa.ts` smoke; see also the
"kb/" directory which is the FinQA-flow design documentation). When
the hackathon period began, the dominant question was: can we *prove*
the learning loop accrues real benefit on a public benchmark? That
question reshaped the project around **SkillCraft**, the public
benchmark used to measure substrate behaviour.

**SkillCraft** is 21 task families × 6 difficulty levels (`e1, e2,
e3, m1, m2, h1`) = **126 tasks**. Vendored at
`eval/skillcraft/vendor/skillcraft/`. The eval harness lives under
`eval/skillcraft/`. Each task has an initial workspace of records,
a question, a set of expected outputs, and an external evaluator
that scores answers 0-100 with a pass threshold of 70.

From iter9 of Goal 2 onward, the SkillCraft eval track is the dominant
benchmark; the FinQA-flow `kb/` documentation describes the original
product story but the SkillCraft scaffolding (`src/eval/`,
`eval/skillcraft/`) is where measurement happens.

The four goals are the arc:

- **Goal 1 (DONE):** push pass rate. Substrate without learning.
- **Goal 2 (PARTIAL):** prove the learning loop fires end-to-end.
- **Goal 3 (CLOSED 3/7):** generic, code-mode-native, cost-effective
  learning loop. Closed when its rubric was diagnosed as overfitting
  to per-entity-fan-out data shape.
- **Goal 4 (MET on iter164, caveats post-review):** intent-convergence
  crystallisation + a learning-honest rubric (R1-R9). The substrate is
  data-shape-agnostic; the rubric measures whether the loop genuinely
  learns and benefits.

## 2. Goal 1 — pass-rate hill climb (DONE)

**Headline: 94.4% pass on the full 126, 3,027 effective tokens/task,
0.8% runtime errors.** Closed 28.5pp of the 30.1pp gap to the
official SkillCraft-base ceiling at 172× lower token cost per task.
Four iterations, all with `--no-lib-cache` (the learning loop was
deliberately disabled so we'd isolate substrate-level wins from
learning-loop wins):

| iter | lever | full-126 |
|---|---|---|
| 1 | VFS hook registry replaces direct lib resolution; quarantine works; structured-unsupported envelopes replace raw runtime crashes. | baseline |
| 2 | Claude backend + bash-native multi-turn probing via `pnpm datafetch:run`. Multi-turn collapses the "agent guessed wrong about tool response shape and threw" failure mode. | 84.1% pass, 80% token cut vs codex |
| 3 | Snippet runtime auto-invokes uninvoked `main()` / `run()` / `solve()`. Forensic walk of failed stderr/prepared-answer files surfaced this as 50% of remaining failures. Trailer fired on 24/126 episodes; all 24 scored ≥ 70. | 91.3% pass, +7.2pp |
| 4 | Snippet timeout 180s → 300s. Four heavy-iteration tasks were making real progress when killed. | **94.4% pass**, +3.1pp, goal met |

Full headline rows in `experiments/hook-registry-experiment.md`. Goal 1
cleared all three thresholds (pass ≥ 0.92, tokens ≤ 8,000, runtime
error rate ≤ 0.05) simultaneously.

Two retrospective points that mattered for everything that followed:

1. **Forensic walks of stderr paid off twice in a row.** Both E1 (auto-
   invoke trailer) and E2 (timeout bump) originated from inspecting
   failure traces by hand instead of trusting the error-taxonomy
   classifier's "other" bucket. The forensic walk script
   (`scripts/audit-autoinvoke.mts`) is permanent toolkit.
2. **The normalize script's `infrastructure_error` heuristic is too
   aggressive** for the harness-boundary SIGTERM case — it demoted
   evaluator-passing rows to infrastructure failures. We did not patch
   it during Goal 1 (the goal pinned the score to the analyze output),
   but the patch landed during Goal 3 iter14 (`bfd8c847`) and recovered
   ~15pp of measured pass rate on the next big run.

## 3. Goal 2 — prove the learning loop fires (PARTIAL, 6 of 7)

**Headline: the substrate's learning loop fires end-to-end on the new
harness.** Six of seven goal thresholds clear on a six-family pilot
(via the older `skillcraftDatafetch.ts` harness) and on the new
harness's tvmaze probe with the iter5-8 substrate changes. The
seventh threshold (`avgLearnedInterfacesAvailable warm ≥ 2.0`) is
structurally unreachable with the iter8 observer.

Eight iterations across E0.5 → E8:

| iter | finding |
|---|---|
| E0.5 | Per-tier rollups added to analyze-results so the seven thresholds are computable from a single JSON. Pure instrumentation. |
| E1 | Lib-cache flag-flip alone produces zero learning-loop metrics. **The observer was never installed in the SkillCraft full harness** — every iter1-4 run was on a dead learning-loop path; `--no-lib-cache` was a redundant flag. Substrate bug. |
| E1.5 | Observer wired into full harness. Persist extended to read from `<datafetchHome>/lib/<tenantId>/`. Still zero — the gate's heuristic #5 requires a `db.*` first call. SkillCraft trajectories under the new harness are pure-tool fan-out. Initially called "structurally incompatible." |
| E1.5 correction | The user flagged that the loop had fired on SkillCraft before. Right — under the *older* `skillcraftDatafetch.ts` harness, which mounts `df.db.records`, drops a `per_entity`-shaped seed, and shapes the trajectory into `db.records.search → lib.<seed>` exactly the way the gate expects. The newer Goal-1 harness traded substrate-rooting for pass rate. Lesson: **read the prior reports on disk before declaring structural impossibility.** |
| E2 | Older `skillcraftDatafetch.ts` harness on the `country` family with `hooks-draft` mode: **100% correctness, -85% warm tokens vs baseline, 100% reuse, one observer-authored helper crystallised.** First clean proof of the loop. The `hooks-draft` mode flag is load-bearing — without it the registry exposes crystallised helpers as `not-callable` and the agent crashes when it tries to use one. |
| E3 | Same setup across all six old-harness families: **36 episodes, 100% correctness, -79% warm tokens, 83% reuse, 0 regressions, 0 quarantines.** Decomposed answer to the user's "seed vs learning" question: seed value -44% on cold; learning value -58% on top of cold; composed -77% with correctness held. |
| E4 (iter5) | Ported `df.db.records` mount + generic `sc_per_entity` seed into the new harness via `src/eval/evalRecords.ts`. Claude with the wiring ignores the new primitives and writes pure `df.tool` fan-out. Scaffold-push variant regressed pass rate from 6/6 to 3/6 (variant B in EXPERIMENTS.md E4). **The agent's strong prior dominates new affordances** — Goal 1's training had crystallised a `df.tool`-only pattern into the prompt. |
| E5 (iter6) | Codex on the new harness DID use the new primitives. But the observer's `consumesEarlierOutput` data-flow check rejected the trajectory because numeric entity IDs (169, 82) aren't in the signature heuristic. |
| E7 (iter7) | Extended `pickSignatures` to emit numeric values (≥ 2 digits) + recurse one level into nested object values. Observer crystallised `scPerEntity.ts` from e2's trajectory. e1 snippet errored, blocking promotion. |
| E8 (iter8) | Broadened `LEARN_FROM_LEVELS` from `{e1}` to `{e1, e2, e3, m1, m2}` so any non-hard passing episode promotes. **Lib-cache populates same-run; m2 and h1 see `libFunctionsAvailable = 1`. Loop fires end-to-end on the new harness.** |

Goal 2 ended at 6/7 because the seventh threshold (≥ 2.0 helpers
available on warm) is structurally limited by the observer's single-
helper-per-trajectory crystallisation: with one helper per family, you
can't average 2.0 on warm. That's a Goal-3 problem.

## 4. Goal 3 — generic, code-mode-native, cost-effective learning loop (CLOSED 3/7)

User-set spirit (2026-05-13): VFS + bash + `df.*` snippets are the
only interaction surface. Substrate ships zero tenant-specific code.
Per-tenant adaptation accrues from observed usage. Claude-cheap
tokens. Code mode is the core primitive for dynamic + adaptive
interfaces. Two conditions to hold:
**(A)** SkillCraft 7-of-7 on a full-126;
**(B)** novel-tenant smoke runs end-to-end with zero substrate edits.

Iterations 9-16 ran the substrate batch + bugfixes:

- **iter9** — commit-phase substrate-rooted validator
  (`requireSubstrateRootedChain` on SessionCtx). Forces the agent's
  answer.ts to contain at least one `db.*` or `lib.*` primitive, or
  the answer envelope is rewritten to `{status: "unsupported"}`.
- **iter10** — observer sub-graph extractor. A trajectory's whole
  template is gated as before; in addition, 0+ sub-graph templates
  (`[firstDbCall ... firstConsumer]` and `[firstConsumer ... end]`)
  are gated separately. Crucial bet: that the validator pushes Claude
  toward `db.findExact → tool.A → tool.B → ... → lib.per_entity` so
  sub-graphs emerge.
- **iter11** — df.d.ts discovery re-rank: sort by `(maturity, successes
  desc, recency desc, name asc)`. Validated helpers first.
- **iter12** — smoke-replay promotion gate: static-shape match of the
  authored body's primitives against the trajectory's primitives.
  Match → validated-typescript callable; mismatch → callable-with-
  fallback. Deterministic, side-effect-free.
- **iter13** — novel-tenant smoke (`src/observer/__smoke__/novel-tenant.ts`).
  Mounts a 5-record book catalogue under a new tenant, runs two
  snippets, asserts the second uses the helper crystallised by the
  first. **11/11.** **Goal 3 part (B) passes.**

Plus three mid-probe bugfixes that surfaced on the first probe attempts
(per_entity TypeError, mirror-wipe race, observer async race) — landed
atomically in commit `0d0ea4df`.

**iter14 full-126:** initially reported as 73.8% pass rate, a brutal
regression from iter4's 94.4%. A codex architect consultation
surfaced two root causes:

1. **Normalizer false-negative.** `normalize-results.ts` was flagging
   19 evaluator-passing rows as `infrastructure_error` because the
   agent process timed out after writing a valid answer. Patched in
   `bfd8c847`. Real pass rate: **88.9%.**
2. **`EvalRecord.id` field collision.** `id` was `"<family>:<entity>"`;
   agents passed the prefixed string to per-entity tools; tools
   rejected it; answers were garbage. iter15 fix (`82cf6688`): `id`
   is the raw entity identifier, `recordKey` carries the prefix.
   Subset run on the four worst families: 17/24 vs iter14's 9/24
   (+33pp).

Final Goal 3 state: **88.9% pass on full-126; 3/7 thresholds**
(passRate, runtimeErrorRate, quarantineRate). The three unmet
thresholds (`avgLearnedInterfacesAvailable ≥ 2.0`, reuse warm ≥ 0.30,
warm/train ≤ 0.70) were diagnosed as over-fitting to SkillCraft's
per-entity-fan-out data shape because the observer keyed
crystallisation on `shapeHash` — a hash of concrete primitive + field
names. Two tenants doing structurally identical work over different
data never share a learned interface. Goal 3 closed in favour of
Goal 4's redesign.

The Rawls-style review of Goal 3 surfaced the honesty risk that drove
the next pivot: **structural reuse > semantic reuse.** A helper that's
called doesn't mean the helper did meaningful work; it may just be
shape-matched.

## 5. Goal 4 — intent-convergence crystallisation + learning-honest rubric

This is the dense part. iter1 of Goal 4 was 2026-05-14; iter167 was
2026-05-17 (the post-iter164 review aftermath). The arc spans 4 days
and ~160 iterations, with most numbered iterations being targeted
probes rather than full-126 runs.

### 5.1 The rubric (R1-R9 plus qualifications)

Goal 3's "7 thresholds" were replaced by a rubric that measures
correctness, cost, trust, novel-tenant onboarding, convergence, reuse,
cost-drop, and cross-shape transfer. The honest description lives in
`eval/skillcraft/rubric.md`; this is the brief:

| Rubric | Measures | Threshold |
|---|---|---|
| **R1 passRate** | `mean(officialPassed)` across the learning arm | ≥ 0.92 |
| **R2 avgEffectiveTokens** | mean of `effectiveTokens` per episode (excl. framework cache) | ≤ 8,000 |
| **R3 runtimeErrorRate** | `mean(runtimeStatus === "runtime_error")` | ≤ 0.05 |
| **R4 quarantineRate** | distinct quarantined helpers / distinct crystallised helpers | ≤ 0.03 |
| **R5 novelTenantSmoke** | `pnpm test` runs `__smoke__/novel-tenant.ts` green | binary |
| **R6 convergenceRate** | of intent clusters with ≥ 2 successful trajectories, fraction with exactly one callable crystallised helper carrying the cluster's `intentSignature` | ≥ 0.80 |
| **R7 conditionalReuse** | of warm episodes where a same-intent non-seed crystallised helper is available, fraction that call one (seed excluded) | ≥ 0.60 |
| **R8 conditionalCostDrop** | for every reuse episode, pair to nearest earlier same-intent non-reuse; mean ratio of `reuseCost / baselineCost`. **Dual gate (added 2026-05-17):** mean ≤ 0.70 AND per-pair pass-fraction ≥ 0.70 | dual |
| **R9 crossShapeTransfer** | number of intent signatures whose helper is reused across ≥ 2 different families | ≥ 1 |

Plus **qualifications** (gate `allMet` independently):
- **cacheBoundedByFramework** — every row's `agentCachedInputTokens` ≤
  250k. Operationalises "no inter-episode state leak in the cache."
- **cacheTokensZero** — `agentCachedInputTokens === 0` on every row.
  Gating only when `CACHE_QUALIFICATION_STRICT=1`.

R6-R9 require the artifact walker (`walk-artifacts.ts`) to be
runnable; the original `episodes.jsonl` carries counts only.

### 5.2 Iters 1-8 — building the data-shape-agnostic key

The first eight iterations built the intent-signature scheme,
convergence gate, and parameterised authoring. All small commits,
none touching scorer thresholds.

| iter | commit | deliverable |
|---|---|---|
| 1 | `b3b2e18c` | Artifact walker — makes R6-R9 scoreable. Dry-score on iter14 data: R7 = 0.19 (target ≥ 0.60); R6 = 1/28 shapeHash clusters convergent. Empirical case for the redesign. |
| 2 | `16a6dea5` | Offline `intentSignature` analyzer. **De-risk verdict PROCEED.** 146 trajectories → 55 clusters, 22 multi-trajectory, **17 cross-family**, 0 incoherent. Dominant cluster `db→FANOUT(tool,6+,cycle1)→lib` spans 10 families with different data shapes — the `per_entity` pattern, learnable from convergence. |
| 3 | `c7d44f7b` | `intentSignature` on `CallTemplate` (`src/observer/template.ts:197+`) + `extractNestedTemplates` (group depth≥1 by `scope.parentPrimitive`). Behaviour-preserving. |
| 4 | (range) | `src/observer/convergenceIndex.ts` + gate check #7 (crystallise only at ≥ N=2 distinct convergent trajectories; `DATAFETCH_CONVERGENCE_N` env-overridable). Smokes had to change with behaviour — first records, second crystallises. The demo pins N=1 to keep its 2-question narrative. |
| 5 | `a5d06ffb` | `renderFanOutSource` — pure tool fan-outs author as parameterised per_entity-shaped helpers (`toolBundle`/`toolNames`/`paramName` ALWAYS input params, never frozen). |
| 6 | `d8c6bc8f` | `cross-shape-transfer.ts` smoke — widgets-learned helper runs on gadgets, 8/8. **R9 proven in isolation.** |
| R9 harness | `21ec6b46` | `__intent__/` shared pool wired into the eval — parameterised fan-out helpers promoted (deduped by `@intent-signature`), hydrated into every family. R9 wired into the full eval. |
| 7 | `2b67a3d6` | `score-r1-r9.ts` — the R1-R9 scorecard join step. |
| 8 | `761816d7` | Surface learned fanout reuse (last committed before the long uncommitted run). |

The pinned `intentSignature` spec v2 (validated by iter2's offline
analyzer): map each top-level call to a CATEGORY (`db` / `lib` /
`tool`); collapse a run of ≥ 2 consecutive same-category calls into
`FANOUT(category)`; concrete primitive + field names are dropped; the
key is the `→`-joined skeleton. **Degree was deliberately excluded
from the key** (a 3-entity invocation and a 7-entity invocation share
an intent).

iter7's instrumented full-126 ran on Codex `gpt-5.4-mini` because
Sonnet was 429-walled. It completed cleanly but missed R1/R2/R3/R6/R7
badly. The clearest diagnostic: the dominant cluster
`db→FANOUT(tool,6+,cycle1)→lib` had 44 successful trajectories but no
callable learned helper. That kicked off the long substrate-hardening
arc.

### 5.3 Iters 9-49 — productionisation arc

After iter8 there's a long unpushed run that touched the substrate
heavily. The commit boundary (`761816d7` → `ca8a2707`) jumps from
"iter 8: surface learned fanout reuse" to "intent-signature v2 —
degree-stripped + helper-only short-circuits" — meaning iters ~9-49
were collapsed into the `ca8a2707` and `13b8e089` substrate commits.

Key landings (`13b8e089` "SkillCraft helper renderers + intent-shape
interface + ReGAL promotion gate"):

- **codex-direct backend**: a Responses-API direct path (no Codex CLI
  bridging), used because it has no prompt cache and produces clean R8
  baselines.
- **claude backend**: the `claude --print` CLI wrapper.
- **lib-cache promotion** mechanics tightened — helpers reach the
  cross-episode cache deterministically.
- **normalize-results** revised to handle multi-tier rollups, helper
  instrumentation joins, and the cache-token field.

### 5.4 Iters 49-78 — the "Battle of Ideas" era

After iter49 the work split into parallel attack arms. The framing
doc is `experiments/goal4-battle-of-ideas-goal.md`. Four assumption arms
were tested in parallel via small evals:

- **A. Contract-aware tool admissibility** — `recordToolFanout` should
  only expose tools whose input value is directly valid for the
  mounted record entity. Same-entity vs dependent.
- **B. Verification-gated promotion** — replay candidate helper
  outputs against source trajectory outputs before promotion.
- **C. Hierarchical decomposition** — same-entity fan-out, dependent
  enrichment, and answer projection are different planning skills.
- **D. Fault-localizing answer builder** — generic source-prep fixes
  (unwrap envelopes, normalize syntax) to keep R1/R3 stable.

iter56's two-family validate (tvmaze + university) passed
R1/R2/R3/R4/R6/R7/R9; R8 failed at 0.713. Independent review flagged
the structural-R9 concern: university could pass mostly by relying on
by-country outputs, so cross-family helper calls proved *structural*
reuse more strongly than *semantic* reuse.

iters 58-77 implemented the SkillX same-entity/dependent split and
introduced `fanout-slot-diagnostics.ts` (the offline verifier that
classifies each helper's executed tool slots as
`verified/narrow/suspect/reject/dependent`).

**iter78 was the first full-126 of the era**, run on codex-direct
with the iter76/77 candidate. Result: 90/126 passes, 18 runtime
errors, R6 = 0.4 FAIL, R7 = 0.87 PASS, R8 = 0.73 FAIL. Diagnostics
exposed the candidate's limit: same-entity admissibility was clean
on tvmaze+university but didn't generalise to random-user, rickmorty,
usgs, world-bank (44 suspect + 79 reject slots). The same-entity
governance was right; the implementation was scoped to the two
training families.

iter78 forced the academic-design-directions doc (ReGAL, PSN, SkillX)
because the small-eval rubric kept allowing reward-hacky-looking
passes that fell apart at scale.

### 5.5 Iters 79-149 — substrate hardening

This is the longest stretch. It was an interleaved sequence of:

- **codex-direct stabilisation** (`2ad23b3f` "feat(eval): codex-direct
  backend, intent-shape planner, generic answer-source rewriters")
- **recordToolFanout / recordToolEnrichment / toolFanoutEnrichment**
  helper renderers (one per intent shape, all parameterised over
  `toolBundle/toolNames/paramName`)
- **R10 intent-interface separation** (the user steer, 2026-05-16
  08:20): the learned interface must be intent-shaped; the execution
  plan may be data-shaped. The public input flips from
  `{entityValues, toolBundle, toolNames, paramName, ...}` to
  `{intent, limit?}` plus a hidden `Internal*Plan` (cast at body
  time). Full detail in `kb/docs/intent-shape-interface.md`.
- **tool memoization + soft-error envelopes** (`3e376997`) so a
  failing tool subprocess returns `{success: false, error, tool,
  input}` instead of throwing the whole snippet.
- **convergence gate relaxation** (`0d846439`) — sub-graph relaxation,
  pure-fanout allowance, intent dedup.

By iter144-149 the substrate had stabilised but was bouncing between
R1/R3 (correctness) and R6/R7/R8 (learning quality), with weak
partial-score clusters dragging certain runs below threshold.

### 5.6 Iters 150-167 — the recent campaign

This is the period the post-mortem turns on. Two backends were tested
(codex-direct = no cache, Claude = caches but has the iter154 cache
violation to resolve). All small-suite runs are 36 rows (6 families ×
e1-h1) unless noted.

Per-iter table:

| iter | backend | scale | R1 | R3 | R6 | R7 | R8 | gates PASS | notes |
|---|---|---|---|---|---|---|---|---|---|
| 150-153 | codex | 36 | trending toward all green | varies | varies | varies | varies | — | pre-iter154 stabilisation; iter153 = first small-suite **6/8** baseline (R8 just over at 0.7092) |
| **154** | claude | 36 | 1.00 | 0 | 1.0 | 0.67 | 0.87 | **DISQ** | cache violation (~97k cached/episode); R1 perfect but cache rule fails |
| **155** | codex | 36 | 0.97 | 0.03 | 1.0 | 0.83 | 0.72 | 6/8 | + success/ok envelope unwrap; pokeapi/m1 syntax error (multi-line `??`/`||`) |
| **156** | codex | 36 | 1.00 | 0 | 1.0 | 0.77 | 0.74 | 7/8 | + multi-line `??`/`||` rewriter (paren-depth segmentation) |
| **157** | codex | 36 | 0.97 | 0.03 | 0.75 | 0.87 | 0.71 | 5/8 | + rowsOf prompt bullet; **regressed R6**; reverted prompt, kept rowsOf code |
| **158** | codex | 36 | 0.97 | 0 | 1.0 | 0.92 | **0.66** | **8/8** | first all-pass small-suite; partly luck-of-classifier |
| **159** | codex | 126 | 0.95 | 0.02 | 0.71 | 1.0 | 0.73 | 6/8 | first full-126 on qualified substrate; R6 + R8 structural fails |
| **160** | claude | 36 | 0.97 | 0.03 | 1.0 | 0.77 | 0.79 | 7/8 | cache violation "resolved" (later: turned out to be normalizer artifact) |
| **161** | claude | 126 | 0.48 | 0.29 | 1.0 | 0.87 | 0.55 | 5/8 | invalidated; 114/126 Anthropic 500s |
| **162-163** | claude | 36 | 0.89 | 0.08 | 1.0 | 0.79 | 1.27 | 5/8 | String() coercion broadening for `.toLowerCase`/`.includes`/`.startsWith` |
| **164** | claude | 126 | **0.94** | **0.008** | **1.0** | **0.86** | **0.67** | **8/8** | **Goal 4 declared MET**: all R1-R9 hold |

Run paths under `eval/skillcraft/results/datafetch/` (gitignored, kept
locally):
- iter158: `goal4-iter158-rowsof-code-only-codex-semantic-20260516/`
- iter159: `goal4-iter159-full126-codex-20260516/`
- iter160: `goal4-iter160-qualified-substrate-claude-semantic-20260516/`
- iter164: `goal4-iter164-full126-claude-clean-20260516/`

iter164's per-tier breakdown: train 19/21 (90.5%), warm 80/84 (95.2%),
hard 19/21 (90.5%); avg effective tokens 1490 / 1600 / 1775; 0
infrastructure errors; 0/126 cache-tokens-nonzero. The 8 failures:
all 6 cat-facts-collector episodes (correctness 60-65, just under the
≥ 70 pass threshold), random-user-database/m1 (correctness), and
random-user-database/h1 (runtime error).

**Post-iter164 Codex adversarial review (2026-05-17)** caught three
real issues with the declared-met run:

1. **Normalizer cache-bug**: the normalizer was silently dropping
   `agentCachedInputTokens` on a code path that bypassed the new join,
   so "cache zero" on some rows was a missing-field artifact. The fix
   landed alongside the next two.
2. **R8 mean-only gating** let iter164 squeak through with
   `meanRatio = 0.6665` while only `0.6444` of pairs individually met
   the ≤ 0.70 floor. A handful of cheap pairs against one expensive
   baseline were dragging the mean down. **Dual gate adopted**: mean
   AND per-pair pass-fraction must both clear.
3. **Benchmark-shaped envelope keys**: `rowsOf`'s list-envelope key
   list was sourced from REST conventions only; an early draft had
   included family-specific keys (`characters/episodes/economies`)
   that would have been benchmark-identifier bleed-in. Already
   reverted before iter157; the review confirmed the right call.

The cache-token qualification was reframed from strict
`cacheTokensZero` to `cacheBoundedByFramework` (≤ 250k per row) —
operationalising "no inter-episode state leak" instead of "Claude must
not cache its system prompt." Strict-zero is preserved as an opt-in
via `CACHE_QUALIFICATION_STRICT=1`.

These corrections landed in `4fc0febd` "feat(scorer): dual R8 gate,
cacheBoundedByFramework qualification, PSN maturity state machine"
and `5429221f` "feat(eval): fanout-slot-diagnostics + parallel-eval
shard runner + URL-encoding shim."

**iters 165-167** (after the corrections) landed V1 (ReGAL coverage-
density gate) and V2 (PSN maturity state machine) scaffolds. A
parallel V1/V2 experiment at probe scale showed neither moves the
rubric — V1's coverage-density gate is inert because all 5 helper
templates pass by construction (the gate has no examples to fail);
V2's PSN demotion is inert because helpers don't get enough uses per
episode at probe scale to demote. Both are scaffolding for future
scale.

### 5.7 The four substrate patches that survived

These four patches landed during the iter150-164 push and survived
to the iter164 declared-met state:

1. **Generic `success`/`ok`-envelope unwrap.** All 4 author.ts
   templates (`toolFanout`, `recordToolFanout`, `recordToolEnrichment`,
   `toolFanoutEnrichment`) plus the runtime answer-kit. If a wrapper
   has a `success`/`ok` boolean and one non-metadata key, unwrap to
   that key. Removed the hardcoded envelope-key allowlist as the
   dominant path (kept as fallback for `{data: ...}` / `{value: ...}`).
2. **Multi-line `??`/`||` rewriter.** `rewriteMixedNullishLogicalExpressions`
   segments by `;` at paren-depth 0 instead of by physical line. Plus
   `parenthesizeMixedNullishLogicalIterated` for chains that need
   multiple passes to stabilise.
3. **Generic `rowsOf` list-envelope traversal.** Traverses 8 common
   REST keys (`value, data, results, items, records, rows, entries,
   list`) + chains through `unwrap()` once. Lets the agent read lists
   without writing local `getList`-style helpers.
4. **String() coercion for `.toLowerCase`/`.toUpperCase`.** Wraps
   `(value ?? "").toLowerCase()` in `String(...)` because nullish-
   fallback short-circuits before the empty-string default if `value`
   is a number.

All four are structurally generic — no benchmark identifiers, no
family/task/bundle pattern matching. Test coverage: 356 vitest tests
pass (4 added during the campaign).

## 6. The pivots, in order

Each of these reshaped the substrate or the rubric and the consequences
echoed forward. They're presented in chronological order:

1. **FinQA cold-to-warm demo → SkillCraft 126-task eval as primary
   benchmark.** The product story was always FinQA-flow (`kb/` docs).
   The SkillCraft pivot turned product proof into measurement. Cost:
   the `db.records` mount that SkillCraft uses is structurally
   different from FinQA's domain. Benefit: the loop's value is testable
   on a public corpus.

2. **Single-helper crystallisation → convergence-gated (N=2)
   crystallisation.** Goal 3's observer crystallised after one
   trajectory. Goal 4 iter 4 requires ≥ 2 trajectories on the same
   `intentSignature`. The smokes had to be rewritten — single-
   trajectory expectations are gone. The demo pins
   `DATAFETCH_CONVERGENCE_N=1` to keep its 2-question narrative.

3. **Syntactic `shapeHash` → semantic `intentSignature`.** The Goal 3
   crystallisation key was a syntactic hash. Goal 4 iter 3 introduced
   the data-shape-agnostic `intentSignature` (category skeleton + FANOUT
   collapse, structural slots only, never concrete field names). The
   offline analyzer (iter 2) de-risked this before any substrate spend
   — 146 trajectories → 55 clusters, 17 cross-family, 0 incoherent.

4. **Data-shape interface → intent-shape interface.** The R10 user
   steer (2026-05-16 08:20) flipped the public call signature from
   `{entityValues, toolBundle, toolNames, paramName, ...}` (the
   agent's job to fill) to `{intent, limit?}` (planner's job to fill
   from the hidden `Internal*Plan`). This is the same separation
   Voyage AI's CodeMode paper calls "execution vs interface."
   Cost: the planner is now visibly on the hook for filling internal
   plan slots; every `missing_internal_plan` error is a TODO. Benefit:
   R7/R8/R9 become meaningfully measurable.

5. **R8 mean-only gating → dual gate (mean + per-pair pass-fraction).**
   Codex's 2026-05-17 review caught that iter164's R8 squeaked through
   because a handful of cheap pairs against a single expensive
   baseline pulled the mean below 0.70 while only 64% of pairs
   individually met the gate. Dual gate prevents this arithmetic
   gaming.

6. **Strict `cacheTokensZero` → `cacheBoundedByFramework` (≤ 250k).**
   Same review caught that Claude Code's CLI backends cache the
   framework system prompt + tool definitions server-side; that
   caching is framework-owned, not a learning-loop leak. The 250k
   ceiling catches substrate state leaking into the cache (a learned
   helper grown too large, an accumulating lib-cache, a resumed
   session). Strict-zero preserved as an opt-in.

7. **Substrate-author-only helpers → ReGAL coverage-density gate + PSN
   maturity.** iters 165-167 landed V1 (ReGAL coverage density before
   promotion) and V2 (PSN maturity state machine: `candidate →
   verified → preferred ↔ suspect → quarantined`). Both inert at
   current scale — V1 because all 5 helper templates pass by
   construction (no examples to fail), V2 because helpers don't get
   enough uses per episode at probe scale to demote. Both are
   scaffolding for future scale or for the "agent-authored helpers"
   primitive.

8. **R8 chasing → "SkillCraft has proven skill-based learning works,
   pivot framing" (user 2026-05-17).** The Goal 4 declared-met state
   plus the Codex review's identification of cross-family-pairing R8
   drift led to the recognition that **R8 has a measurement floor**
   (the framework system prompt + tool definitions dominate any
   reuse-episode cost, so the ratio can't compress past a certain
   point). The framing pivots from "make R8 robust" to "VFS + code-mode-
   as-learning-interface is the proven unique contribution; SkillCraft
   doesn't dictate that mechanism, our substrate does."

## 7. What was tried and didn't work

These are real dead ends — investing more in them is not the right
move:

- **Codex-direct full-126 (iter159) for R6 + R8 simultaneously.**
  iter159 was 6/8: R1=0.95 PASS, R3=0.02 PASS, R6=0.71 FAIL,
  R8=0.73 FAIL. The R6 failure is two compositional shapes
  (`db→FANOUT(tool)→FANOUT(lib)→FANOUT(tool)` and
  `FANOUT(tool)→lib→FANOUT(tool)→lib→FANOUT(tool)`) that no current
  template authors. The R8 failure is the cross-family-pairing
  structural floor. Closing both at once requires either new helper
  templates (substrate work) or scorer changes (forbidden by Goal 4).

- **V1 ReGAL gate at small-probe scale.** Coverage-density gate is
  inert: all 5 helper templates have unit tests that pass by
  construction, so the gate never blocks anything at probe scale. It
  would only fire when an agent authors a novel helper template that
  doesn't have built-in coverage. Real value only emerges when
  agent-authored helpers become a primitive.

- **V2 PSN maturity at small-probe scale.** State machine is inert:
  helpers don't get enough uses per episode to trigger demotion
  (`suspect → quarantined` requires 3 losses). At full-126 scale with
  ~10-25 uses per helper, the maturity transitions become observable
  but the gate is still default-off (`PSN_MATURITY_GATE=1` is opt-in).

- **Anthropic SDK driver.** Built but never used. The user's setup is
  OAuth-only (no API key); the SDK driver requires an API key.
  `claude --print` CLI is the live path.

- **Various probe-bullet prompt additions (iter157 regression).** The
  `rowsOf` code change was strictly backward-compatible but the
  accompanying prompt bullet ("don't write local `getList`-style
  helpers") had cluster-classifier-shifting side effects: a new
  qualifying cluster appeared without a callable helper, dragging R6
  to 0.75. **Substrate-side prompt steering has nontrivial second-
  order effects on intent clustering.** The lesson: changes to the
  rendered prompt are not isolated to the per-episode behaviour they
  intend.

- **`per_entity_with_records` and other seed variants.** Too specific,
  not aligned with the intent-signature scheme. The seed evolves
  toward being a generic intent-shaped scaffold; specialised variants
  fragment the convergence pool.

- **iter80-85 unverified-record fallback variants.** Hiding the seed
  when no record contract exists or installing a generic
  `safeRecordsFindExact` scaffold each gave runtime stability but
  fragmented helper convergence in interesting ways. iter85 had
  R1=0.97 R3=0.03 but R6=0.2 because only the pure `FANOUT(tool)`
  helper crystallised exactly while `db→FANOUT(tool)` clusters had no
  exact callable helper.

- **iter78's "battle of ideas" full-126.** It surfaced the
  iter76/77-candidate's family-specific generalisation gap
  (random-user, rickmorty, usgs, world-bank). Useful falsification, but
  the codepath underneath had to be re-architected (A/C+D family).

## 8. Academic paper map

Seven papers shaped the substrate's direction. Full digests in
`experiments/goal4-academic-design-directions.md` and
`experiments/post-iter164-research.md`. Mapping to substrate state:

| Paper | What it offers | Landed? | Substrate touch |
|---|---|---|---|
| **ReGAL** (arxiv:2401.16467) | Refactor batches of primitive programs into candidate abstractions; verify before promotion. | Partially — V1 coverage-density gate scaffolded (iter167a) but inert at scale. Full replay-and-verify is paper 7's job. | `eval/skillcraft/scripts/fanout-slot-diagnostics.ts` is the offline verifier today. |
| **PSN** (arxiv:2601.03509) | Programmatic skill networks + maturity gating + fault localisation. | Yes — V2 state machine in `score-r1-r9.ts:245-422`. Inert at probe scale; gated by `PSN_MATURITY_GATE=1`. | Per-helper attempts/passes/wins/losses tracking. |
| **SkillX** (arxiv:2604.04804) | Three-level skill hierarchy (atomic / functional / planning). | Same-entity vs dependent split landed (recordToolFanout vs recordToolEnrichment); planning-skill layer partial. | `src/observer/template.ts` topics distinguish `recordToolFanout` / `recordToolEnrichment` / `recordToolLookup` / `toolFanoutEnrichment`. |
| **Memory Transfer / INSIGHT** (arxiv:2604.14004) | Insight format (abstract principle) transfers +7.8% better than trajectories on novel domains. | **Not landed.** Queued as B2 overnight goal. | Would add `@insight` to helper frontmatter, surfaced at discovery time. |
| **f(x)→f(g(x)) composition** (arxiv:2509.25123) | Atomic skills must be fully internalised before composition is trained separately. | **Not landed.** Relevant to the R6 compositional-cluster gap. | Would add `@composes-with` edges from offline cluster analysis. |
| **UCT critic-gated tool creation** (arxiv:2602.01983) | Sandboxed critic reviews (code, tests, sample I/O) before promotion. | **Not landed.** Relevant to the missing semantic validator. | Would add critic-replay step before `stampPromotionMetadata`. |
| **SkillCraft** (arxiv:2603.00718) | The benchmark itself. Proved skill-based learning works. | **Used as benchmark.** | Doesn't dictate VFS+code-mode mechanism — that's our unique contribution. |

The user's synthesis of papers 5-7 (post-iter164 research): the four
mechanisms together form a four-part fix that maps directly to
ReGAL + SkillX + PSN + Memory Transfer respectively — precondition-
aware interfaces (ReGAL), verification-gated promotion (SkillX-style
hierarchical), maturity + fault localisation (PSN), insight layer
(Memory Transfer). The compose-with edges (paper 6) close the
compositional R6 gap. The critic replay (paper 7) is the proper
semantic gate. The insight stamping (paper 5) is the cheapest single
lever to lift R7.

## 9. Outstanding questions and future work

These are the live questions at iter167:

1. **Does iter164 MET reproduce?** Per-run variance with Claude was
   huge during the campaign (iter160 vs iter162 swung R1 by 8pp and
   R8 by 48pp on the same substrate). A second clean full-126 on the
   same substrate would tell us whether iter164 is a stable result or
   a fortunate alignment of the intent-classifier and a healthy
   Anthropic API window. B1 overnight goal.

2. **Does insight-layer annotation enable semantic selectivity?**
   R7 is bounded by the agent's ability to recognise that a helper
   matches the task. Today recognition is template-shape only. An
   `@insight` field (paper 5) is the cheapest known way to lift R7
   without changing the rubric. B2 overnight goal.

3. **Does the substrate work on real product flow with no SkillCraft
   scaffolding?** The novel-tenant smoke proves zero-edit onboarding
   for a 5-record dataset (Goal 3 part B); the question is whether
   real product flow (with no `df.db.records` mount, no per_entity
   seed, no SkillCraft-style trajectory shapes) yields the same
   convergence behaviour. B3 overnight goal.

4. **Is the codex-direct R6 compositional gap fixable without per-
   shape template proliferation?** The iter159 R6 failure had two
   missing shapes (`db→FANOUT(tool)→FANOUT(lib)→FANOUT(tool)` and
   `FANOUT(tool)→lib→FANOUT(tool)→lib→FANOUT(tool)`). Authoring
   templates for them is data-shape-agnostic substrate work, not a
   benchmark hack — but the count could keep growing as new shapes
   emerge. Paper 6's compose-with edges from offline cluster analysis
   are the alternative: learn the composition DAG as a side-effect of
   clustering, suggest chains at discovery time.

5. **When agent-authored helpers become a primitive, does V1's ReGAL
   gate finally fire?** Today all 5 helper templates pass V1 by
   construction. The gate would only block when an agent authors a
   novel template. That's the next big direction.

6. **Does V2 PSN demotion work at full-126 scale?** At ~10-25 uses per
   helper across the 126 surface, demotion thresholds become
   observable. iter167b ran the V2 scaffold; the gate is opt-in and
   stayed off. A `PSN_MATURITY_GATE=1` full-126 would tell us whether
   the state machine's transitions are calibrated reasonably or need
   re-tuning.

The framing pivot at iter164's close (2026-05-17 user steer) was
the recognition that **SkillCraft has now empirically proven the
substrate's skill-based learning works** — the unique contribution
isn't a SkillCraft number but the VFS + code-mode-as-learning-interface
mechanism that makes the loop tractable. Future work should pivot
from "make R8 robust" (the structural floor work) to "demonstrate the
mechanism on real product flow" (the B3 goal above).

---

*Maintained ad-hoc; refresh when the next big arc closes. The raw
chronological log lives in `experiments/EXPERIMENT_NOTES.md`; the
curated per-iter list lives in `experiments/EXPERIMENTS.md`; the
current snapshot lives in `experiments/STATUS.md`.*
