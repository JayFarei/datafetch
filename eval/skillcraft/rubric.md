# The R1-R9 Rubric, As Actually Scored

This is the honest description of the Goal-4 scorecard as computed by
`eval/skillcraft/scripts/score-r1-r9.ts`. Two readers should walk away:

- Engineers who want to know what each condition really measures
  (cite line numbers, don't paraphrase the PLAN doc).
- Reviewers who want to know what the rubric *doesn't* yet measure and
  why some conditions only hold within their stated scope.

## The Nine Conditions

### R1 — passRate

- **File:line:** `score-r1-r9.ts:620`, threshold at `:1183-1184`.
- **Measures:** `mean(officialPassed)` across all `arm == "datafetch-learned"`
  rows in `normalized.jsonl`. `officialPassed` is the upstream
  SkillCraft pass/fail bit, not the substrate's opinion.
- **Threshold:** ≥ 0.92.
- **Honest scope:** counts only the learning arm. The eval `arm` filter
  at `:431` is what makes this number Goal-4-relevant; mixing in a
  no-learn baseline would dilute it.

### R2 — avgEffectiveTokens

- **File:line:** `:621-624`, threshold at `:1188-1191`.
- **Measures:** mean of `effectiveTokens` (non-null, finite) across the
  learning-arm rows. `effectiveTokens` is the normalizer's per-episode
  effective-cost figure including snippet retry overhead.
- **Threshold:** ≤ 8000.
- **Honest scope:** does not include framework-prompt cache tokens (see
  qualifications below). The number reflects what the substrate pays
  per episode in marginal compute, not total Claude billing.

### R3 — runtimeErrorRate

- **File:line:** `:625-627`, threshold at `:1194-1198`.
- **Measures:** `mean(runtimeStatus === "runtime_error")`. Counts only
  the substrate-classified runtime-error bucket from
  `classify-runtime-errors.ts`; infrastructure errors (network, harness
  timeouts) are not in the numerator.
- **Threshold:** ≤ 0.05.

### R4 — quarantineRate

- **File:line:** `:629-636`, threshold at `:1201-1211`.
- **Measures:** distinct quarantined crystallised helpers divided by
  distinct crystallised helpers. A helper is "crystallised" if it has a
  non-null `shapeHash` in its `HelperOrigin` (observer-authored, not
  seed). It is "quarantined" if its name appears in any episode's
  `quarantinedHelpers`.
- **Threshold:** ≤ 0.03.
- **Honest scope:** a single helper quarantined across many episodes
  counts once (set dedup at `:479-482`).

### R5 — novelTenantSmoke

- **File:line:** stub at `:1213-1219`. Value is always `null`.
- **Measures:** EXTERNAL — verified by `pnpm test` running the
  `__smoke__/novel-tenant.ts` harness. The scorecard records `met: null`
  and `allMetExceptR5` ignores it (`:1292-1294`).
- **Threshold:** smoke green (binary, surfaced by gap-analysis, not by
  this script).

### R6 — convergenceRate

- **File:line:** `:659-698`, threshold at `:1220-1234`.
- **Measures:** of intent clusters with ≥ 2 successful trajectories, the
  fraction where exactly one callable crystallised helper carries the
  cluster's `intentSignature`. "Callable" means crystallised AND not
  quarantined (`:487-490`).
- **Threshold:** ≥ 0.80.
- **Honest scope:** uses exact whole-trajectory signatures. Sub-intent
  matches (a `FANOUT(tool)` helper covering a `db→FANOUT(tool)→lib`
  trajectory) do not count toward R6 — those go in the compositional
  diagnostics block (see below). A cluster with two trajectories that
  both happened to fail will not be in the qualifying denominator,
  which means R6 silently shrinks when the substrate is fragile, not
  just when it fails to converge.

### R7 — conditionalReuse

- **File:line:** `:700-740`, threshold at `:1235-1247`.
- **Measures:** of warm-phase episodes where a same-intent non-seed
  crystallised helper is in `helpersAvailable`, the fraction where the
  agent actually called a same-intent non-seed helper.
- **Threshold:** ≥ 0.60.
- **Honest scope:** scoped to `phase === "warm"`. Hard-phase episodes
  are excluded — the rubric reasoning is that warm is where reuse
  should be most reliable; hard's failure modes belong to a different
  question. The seed helper (`per_entity`) is excluded by the
  `!o.isSeed` filter at `:719`.

### R8 — conditionalCostDrop (dual gate, added 2026-05-17)

- **File:line:** computation at `:741-827`, dual-gate threshold at
  `:1248-1273`.
- **Measures:** for every reuse episode (called at least one same-intent
  non-seed crystallised helper), pair it with the nearest earlier
  same-intent NON-reuse episode (clean baseline, `helpersCalled.length === 0`),
  by trajectory timestamp. The pair's ratio is
  `reuseCost / baselineCost`. Score is the mean of those ratios across
  all pairs.
- **Threshold:** *both* `meanPairedRatio ≤ 0.70` **AND**
  `perPairPassFraction ≥ 0.70` where the per-pair pass fraction is the
  fraction of pairs whose individual ratio is ≤ 0.70.
- **Why dual:** Codex's 2026-05-17 review (cited in the source comment
  at `:1254-1259`) caught that iter164 squeaked through with
  `meanRatio = 0.6665` while only `0.6444` of pairs individually met
  the ≤ 0.70 floor. A handful of very cheap reuse pairs against a
  single expensive baseline were dragging the mean down even though
  most reuse episodes weren't really cheaper. The per-pair pass
  fraction prevents that arithmetic gaming.
- **Honest scope:** "nearest earlier" is timestamp-ordered, so the
  baseline is the most recent qualifying non-reuse episode. Pairs
  across families are allowed when they share `intentSignature`. The
  ratio is bounded by the floor of token costs the Claude framework
  forces — see Known Limitations.

### R9 — crossShapeTransfer

- **File:line:** `:1122-1158`, threshold at `:1275-1286`.
- **Measures:** the number of intent signatures whose crystallised
  helper was called across ≥ 2 distinct families. The exemplar
  signature (top by family count) is reported as the value.
- **Threshold:** ≥ 1 intentSignature reused across ≥ 2 families.
- **Honest scope:** a "family" here is `family` as recorded in
  `instrumentation` rows (different SkillCraft families = different db
  collections / tool bundles = genuinely different data shapes). A
  helper called twice within one family doesn't count.

## The Qualifications Block

Beyond R1-R9, the scorecard has a "qualifications" section that gates
the overall `allMet` independently. Two qualifications exist as of
2026-05-17:

### cacheBoundedByFramework

- **File:line:** `:1328-1352`, gating at `:1378-1380`.
- **Constant:** `FRAMEWORK_CACHE_CEILING = 250_000` at `:1328`.
- **Measures:** every row's `agentCachedInputTokens` must be ≤ 250k.
- **Always gating.**

### cacheTokensZero

- **File:line:** `:1338-1340`.
- **Measures:** `agentCachedInputTokens === 0` on every row.
- **Gating only when** `CACHE_QUALIFICATION_STRICT=1`.

### The Reframe

Iter164's review (cited in the source comment at `:1297-1322`) caught
that the original "cacheTokensZero" rule was failing in practice
because Claude Code's CLI backends (`claude --print`, `claude-p`)
cache the framework system prompt + tool definitions server-side.
That caching is identical across episodes, framework-owned, and not a
learning-loop leak.

The *spirit* of the original rule was to prevent inter-episode state
leak (iter78's cocktail-menu-generator/e3 leaked context from a prior
episode's session). The reframe is:

- The 250k ceiling catches substrate state leaking into the cache (a
  learned helper that grew too large, an accumulating lib-cache, a
  resumed session). Anything above the ceiling implies non-framework
  content is being cached.
- Strict-zero is preserved as an opt-in via `CACHE_QUALIFICATION_STRICT=1`
  for runs on the SDK backend path that shouldn't be caching at all.

This is the "spirit of the rule still enforced" stance — the ceiling
is the operationalised version of "no inter-episode state leak."

## PSN Helper Maturity State Machine

`score-r1-r9.ts:245-422` implements a state machine over every
crystallised helper's life-history, gated by env var `PSN_MATURITY_GATE=1`
(`:505`).

### States

`candidate → verified → preferred ↔ suspect → quarantined`

### Transitions

Documented inline at `:365-411`. Briefly:

| From | To | Condition |
|---|---|---|
| `candidate` | `verified` | passes ≥ 2 |
| `verified` | `preferred` | passes ≥ 4 AND `winRate ≥ 0.70` (wins / (wins+losses)) |
| `preferred` | `suspect` | 2 consecutive losses |
| `suspect` | `verified` | over next 4 attempts post-demotion, `winRate ≥ 0.60` |
| `suspect` | `quarantined` | total losses ≥ 3 |

"Win" = the helper's R8-style paired ratio ≤ 0.70. "Loss" = > 0.70.
The per-helper R8 pairs are computed in parallel at `:529-585` so the
state machine can attribute wins/losses to the specific helper that
was called (rather than to the intentSignature as a whole).

### When Gating Is On

`isMatureForGating` (`:418-421`) accepts only `verified` or
`preferred`. R6/R7/R8 then filter out helpers that haven't reached
those states (R6: `:679-683`; R7: `:720-723`; R8: `:764-767`). This
means a freshly-promoted helper does not contribute to the
convergence/reuse/cost-drop numerators until it has demonstrated two
passes (the candidate→verified bar).

### When Gating Is Off (default)

The state-machine output is reported in `helperMaturity.byHelper` and
`helperMaturity.stateCounts` (`:1408-1416`) for diagnostic visibility
only. R6/R7/R8 use the bare crystallised-and-not-quarantined predicate.

## Compositional Sub-Intent Diagnostics

`score-r1-r9.ts:829-1120` recomputes R6/R7/R8 against a relaxed
matching rule: a helper "covers" an episode if its `intentSignature`
appears as a contiguous sub-sequence of the episode's signature
(`containsContiguousSubIntent`, `:204-215`), with two guards:

- Single-token signatures like `db` or `lib` are too broad to count
  unless they're `FANOUT(*)` (see `isEligibleCompositionalHelper`,
  `:217-222`).
- Otherwise any contiguous match qualifies — so a `FANOUT(tool)` helper
  can cover a `db→FANOUT(tool)→lib` episode for diagnostic purposes.

The compositional block is emitted under `compositionalDiagnostics`
with the explicit policy string at `:1077-1078`:

> "diagnostic only; official R6-R8 remain exact whole-trajectory gates.
> Sub-intent coverage requires a contiguous signature match and rejects
> broad single-token helpers except FANOUT templates."

It is reported but never gates `allMet`.

## Known Limitations

### R8 has a floor

The per-helper R8 win/loss bookkeeping is bounded by the floor of
output tokens Claude's compact code emits. Even a perfect reuse
episode that "should" cost almost nothing still pays the system
prompt + tool definitions + answer-emit tokens. With baselines that
were themselves cheap, the ratio can creep above 0.70 not because the
helper is bad but because the absolute floor dominates the
calculation.

### Cross-family pairing can drag the mean

R8's "nearest earlier same-intent" rule allows cross-family pairing
when the signature matches. If a small family's expensive baseline is
the only earlier episode for a particular signature, every subsequent
reuse episode pairs against it — the resulting ratios skew
artificially low. The dual-gate (mean + per-pair) catches the
arithmetic of this but does not catch the substantive issue: the
baseline doesn't represent the same task family. Future work: optional
within-family pairing as a stricter mode.

### R6/R7/R8 don't measure replay equivalence

The current rubric measures convergence (one helper per cluster),
reuse rate (does the agent call it), and cost (is it cheaper). It does
NOT measure semantic equivalence — running the helper on the source
trajectory's records and checking the output matches the recorded
output. That is the ReGAL gate properly done, and it is reserved for
the `fanout-slot-diagnostics`-extension future work described in
`../../experiments/archive/2026-05-goal4-skillcraft/post-iter164-paper-digests.md` paper 7.

### Per-helper attribution can be confused

When an episode calls multiple same-intent helpers in one trajectory,
the per-helper R8 attributes the same `ratio` to every called helper
(`:577-584`). This is intentional — we can't statistically separate
which one is responsible for the cost change — but it means
`helperMaturity.byHelper.costDropWins` for a given helper includes
co-attribution noise from other helpers it was bundled with.

### `cacheTokensZero` is null when the field is absent

If the normalizer didn't emit `agentCachedInputTokens` on any row,
both qualifications report `met: null` and the framework-bounded gate
is treated as "N/A" (`:1338-1340`, `:1350-1352`). The Codex 2026-05-17
review caught a regression where the normalizer was silently dropping
this field — the fix landed alongside the dual-gate work.

## Console Output Surface

Per `:1446-1486`, the script prints:

- One PASS/FAIL/???? line per rubric R1-R9.
- A helper maturity line: `candidate=N verified=N preferred=N suspect=N quarantined=N`.
- The all-conditions-except-R5 summary.
- The qualification verdict (strict vs framework-bounded).
- A signature-join diagnostic (how many crystallised helper signatures
  intersect with cluster signatures) — when the intersection is tiny,
  R6/R9 are unscoreable for structural reasons rather than learning
  failure.
- A compositional diagnostics one-liner.
- The scorecard JSON path.

The JSON written to `<baseDir>/r1-r9-scorecard.json` carries all the
per-condition detail (cluster lists, pair lists, episode lists) that
the console summary collapses.
