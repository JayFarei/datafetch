---
title: "CRAG Shape Probe — Empirical Findings on Substrate Readiness"
date: 2026-05-18
mode: scan
sources: 3
status: complete
---

# CRAG Shape Probe — Empirical Findings on Substrate Readiness

## Executive Summary

A half-hour probe (`scripts/crag-probe/crag-shape-probe.ts`) constructed 7 hand-written CRAG-shaped trajectories and fed them through the live `extractTemplate` + `authorFunction` pipeline. The probe surfaced a sharper gap than the one predicted in [`16-substrate-benchmark-scouting.md`](16-substrate-benchmark-scouting.md): **every chained CRAG question shape collapses to the single `FANOUT(tool)` intent signature, the observer authors exactly one `toolFanout.ts` helper per tenant, and that helper is a literal data-shape clone of the originating trajectory (hardcoded `getTickerByName + getPeRatio` body with `{query, tickerName}` input schema), not the intent-shaped helper that [`kb/docs/intent-shape-interface.md`](../docs/intent-shape-interface.md) describes as the iter150+ standard**. The reuse probe confirmed empirically that the warm-call across siblings is a silent correctness landmine: invoking the helper with `{query: "Microsoft", tickerName: "MSFT"}` returns Microsoft's *PE ratio* even when the user's question asked for Microsoft's *market cap*, because the body is frozen to call `getPeRatio` regardless of input.

The 5-claim verdict from `16`'s smallest-first probe rubric: **(Crystallisation: PASS, Signature differentiation: FAIL, Helper reuse across siblings: FAIL when tools differ / PASS-with-wrong-answer when tools match by accident, Correctness preservation: FAIL, Intent-shape contract: NOT FIRING for tool-only 2-call trajectories)**. The implication is that the CRAG eval would land NEUTRAL-or-worse on the substrate today, for a reason different from the SkillCraft Sonnet-saturation problem: the substrate's intent-signature scheme is too coarse to differentiate CRAG's compositional question types, and the crystallisation policy authors literal-clone helpers that introduce correctness regressions when the agent's planner picks one for a sibling whose tool sequence differs.

The recommendation is to fix the substrate before running CRAG end-to-end. Three concrete fixes, in priority order: (1) **make the intent-signature scheme finer-grained for the tool-only case** — distinguish dependent-chain from parallel-fanout by checking input/output reference patterns rather than collapsing on category alone; (2) **enforce the intent-shape contract on every authored helper** — refuse to author a 2-call helper whose body has hardcoded tool names; instead, either author an intent-shape helper with planner-resolved internal plan (the iter150+ design), or skip authoring entirely; (3) **add a sub-trajectory-level shape-hash collision check** — refuse to author a second helper with the same name (the current behaviour is "skip silently if name exists," which means the first crystallisation wins for the whole tenant forever).

## What the probe did

`scripts/crag-probe/crag-shape-probe.ts` constructs 7 `TrajectoryRecord` objects representing the CRAG question categories enumerated in `16`. No LLM, no Python, no Mongo, no Atlas — pure in-memory construction of the call records that a CRAG-running agent would produce, fed through `extractTemplate` and `authorFunction` directly. Each trajectory's:

1. intent signature, via `computeIntentSignature(calls)`
2. sub-graph candidates, via `extractSubGraphTemplates(traj)`
3. crystallisation outcome, via `authorFunction({tenantId, baseDir, trajectory, template, libraryResolver, codifierSkill: null})`

is reported. For the first successfully authored helper, the probe additionally tries two warm-call invocations — one with the exact `{query, tickerName}` input the helper was authored from, one with the intent-shape `{intent, company, metric}` that the iter150+ pivot says the helper should accept.

The 7 trajectories cover:

| # | Family | Calls | Intent it represents |
|---|---|---|---|
| A1 | simple-chain (Apple PE) [cold] | 2 | `getTickerByName(Apple) → getPeRatio(AAPL)` |
| A2 | simple-chain (MSFT PE) — same tools [warm?] | 2 | same tool sequence, different entity |
| A3 | simple-chain (MSFT cap) — different metric [warm?] | 2 | same SHAPE but `getMarketCapitalization` instead of `getPeRatio` |
| B | comparison (AAPL vs MSFT) | 4 | parallel fanout over 2 entities, 2 lookups each |
| C | multi-hop (1994 Oscars) | 2 | extract-and-chain across different domain |
| D | false-premise (Ruth on Cubs) | 1 | single lookup + local validation |
| E | aggregation (Hanks 90s) | 11 | one person lookup + 10 movie-year confirmations |

## What the probe found

### Finding 1 — Every chained CRAG trajectory hashes to `FANOUT(tool)`

The category-only collapse in `computeIntentSignature` (template.ts:223-260) treats any run of ≥2 consecutive same-category calls as `FANOUT(category)`. That collapse was deliberate and well-tuned for SkillCraft (per the iter14 validation, 146 trajectories → 55 clusters with 22 multi-trajectory and 0 incoherent); but on CRAG it collapses radically distinct shapes into one bucket:

| Trajectory | Sequence | intentSignature |
|---|---|---|
| A1 (simple chain, 2 calls) | `getTickerByName → getPeRatio` | `FANOUT(tool)` |
| A2 (same tools, sibling) | `getTickerByName → getPeRatio` | `FANOUT(tool)` |
| A3 (different metric) | `getTickerByName → getMarketCapitalization` | `FANOUT(tool)` |
| B (true parallel fanout, 4 calls) | `getTickerByName×2 → getMarketCapitalization×2` | `FANOUT(tool)` |
| C (extract-and-chain, 2 calls, cross-domain) | `getYearInfo → getMovieInfo` | `FANOUT(tool)` |
| E (1+10 fanout, 11 calls) | `getPersonInfo → getMovieInfo×10` | `FANOUT(tool)` |

The only trajectory that hashes differently is D (false-premise), and that's because it has 1 call — the signature is just `tool`, and `extractTemplate` refuses to operate on <2 calls.

The category-only scheme is reasonable when the only `tool.*` shape is fan-out over a parameterised entity set (the SkillCraft regime). On CRAG, where `tool.*` calls are *also* sequential dependent chains, extract-and-rebind multi-hops, and asymmetric one-then-many aggregations, the scheme loses critical structural information. The substrate cannot tell these apart, so it cannot author distinct helpers for them.

### Finding 2 — Exactly ONE helper gets authored per tenant

Because every chained trajectory hashes to `FANOUT(tool)`, the observer's name resolution lands on the same template name (`toolFanout`). Six trajectories all attempted authoring; only the FIRST (A1, the simple chain for Apple PE) succeeded. The other five — A2, A3, B, C, E — were all skipped with the literal reason `name already exists at /tmp/.../lib/crag-probe/toolFanout.ts`. The substrate has no mechanism to distinguish them as different shapes worthy of different helpers; it sees them all as "the same family, already covered."

This is the strongest finding from the probe. The substrate's family cache becomes single-helper-per-signature-per-tenant, which is fine for SkillCraft where one family has one shape, but **catastrophic for CRAG where the same FANOUT(tool) signature covers four structurally-distinct shapes**.

### Finding 3 — The authored helper is a literal data-shape clone, not intent-shape

`kb/docs/intent-shape-interface.md` is the iter150+ honesty rewrite that split helper interfaces into:

> **Public input** = the intent. Examples: `{intent: "repeated tool fan-out", limit?}`, `{intent: "record-backed repeated fan-out", recordFilter?, recordLimit?}`. These are the fields the frontmatter advertises.
> **Internal plan** = a loose-object overlay (`Internal*Plan`) with `entityValues`, `toolBundle`, `toolNames`, `paramName`, `paramByTool`, `recordParamMapByTool`, `sharedInput`.

The probe's authored helper (full source at `/tmp/crag-probe-*/lib/crag-probe/toolFanout.ts`) does **not** match this design. The actual authored body:

```ts
type Input = { query: string; tickerName: string };

export const toolFanout = fn<Input, unknown>({
  intent: "reusable learned interface for the tool_fanout intent shape; internally composes tool.cragFinance.getTickerByName -> tool.cragFinance.getPeRatio",
  input: v.object({ query: v.string(), tickerName: v.string() }),
  output: v.unknown(),
  body: async (input: Input): Promise<unknown> => {
    const out0 = await df.tool.cragFinance["getTickerByName"]({ query: input.query });
    const out1 = await df.tool.cragFinance["getPeRatio"]({ tickerName: input.tickerName });
    return out1;
  },
});
```

The input schema is `{query: string, tickerName: string}` — fully data-shape. The body has hardcoded tool names (`getTickerByName`, `getPeRatio`) and hardcoded param names. There is no `Internal*Plan` overlay, no planner resolution, no intent abstraction. This is the *exact failure mode* the iter150+ pivot was supposed to fix.

The likely cause is that the iter150+ render functions in `src/observer/author.ts` (renderToolFanOutSource and friends) only fire for trajectories that match the toolFanout *true-fanout* pattern (≥2 entities × ≥2 tools); a 2-call sequential chain falls through to a generic `fn<Input, unknown>` author path that emits the literal trajectory clone. The frontmatter `description` even apologises in advance: "Internally chains: tool.cragFinance.getTickerByName -> tool.cragFinance.getPeRatio. Use when the user's question has the same task shape, even if the entity, metric, period, or wording differs. Pass input as { query, tickerName }; the runtime returns the last call's output."

That description is structurally false: the helper does NOT generalise across "different metric, different period, different wording" — its body is frozen.

### Finding 4 — Reuse-probe confirms the correctness landmine

The probe invoked the authored helper twice, with two input shapes:

**Invocation 1 — data-shape input** (`{query: "Microsoft", tickerName: "MSFT"}`):
- Resolved: yes
- Invoked: yes
- Returned: `{tool: "getPeRatio", ok: true, tickerName: "MSFT"}` (mode: interpreted, tier 2, 0 LLM calls)

**Invocation 2 — intent-shape input** (`{intent: "company financial metric", company: "Microsoft", metric: "pe_ratio"}`):
- Threw: `Schema validation failed during input`

So the helper DID warm on the same-tool-sequence sibling (A2) when called with the cloned data-shape input. That's a positive surface result — the cold→warm round-trip works end-to-end for this exact sibling.

But here's the landmine: the helper's body always calls `getPeRatio`, regardless of input. If the agent's planner sees the toolFanout helper, decides it matches the "company financial metric" intent (which the helper's natural-language description claims it does), and invokes it for A3 (Microsoft's *market cap*, not PE ratio), the helper would dutifully fire warm with `{query: "Microsoft", tickerName: "MSFT"}`, return `getPeRatio(MSFT)`'s output, and the agent would land an answer that:

- looks structurally fine (valid AnswerEnvelope, has evidence)
- passes the cost-reduction metrics (warm-call, 0 LLM calls, tier 2)
- is silently wrong (CRAG's grader returns -1 for hallucination)

This is the worst possible outcome on CRAG's tri-state +1/0/-1 grader — an answer that *looks confident* but is *semantically wrong*. The substrate's existing R1 (binary pass/fail) wouldn't even detect the difference between "right warm-call" and "wrong warm-call from helper reuse"; the metric would just register a faster, cheaper run.

### Finding 5 — Sub-graph extraction sees nothing

`extractSubGraphTemplates(traj)` returned 0 candidates for every trajectory. Looking at template.ts:399-410, this is because the sub-graph extractor specifically looks for the first `db.*` call and the first downstream `lib.*` or `tool.*` call that consumes its output. CRAG trajectories in our modeling have *no* `db.*` calls at all (everything is `tool.*`), so the extractor short-circuits at the `firstDbIdx < 0` guard.

This is the design choice from `06-bird-finqa-corpus.md` carried forward — sub-graphs were built around the `db→lib` boundary the FinQA demo emphasises. CRAG, which is all-tool, doesn't fit that boundary. A separate `tool-only` sub-graph extractor (or, equivalently, remapping CRAG mock APIs onto `db.*` collections, see below) would be needed to surface non-trivial structural candidates.

## What this means for the CRAG plan in br/16

The scouting brief at `16` recommended CRAG as the primary substrate-eval surface and predicted that the gaps were (a) render functions for non-FANOUT shapes and (b) tri-state correctness scoring. The probe says the brief was directionally right but understated the depth of the substrate gap:

| Gap from `16` | Probe verdict | Severity revision |
|---|---|---|
| "No render functions for non-FANOUT shapes" | Wrong-shaped. The signature scheme *already* collapses CRAG shapes into FANOUT(tool); the problem isn't missing render functions for non-FANOUT signatures, it's that the FANOUT(tool) render path produces a one-trajectory-clone for the simple-chain case. | **Worse than predicted.** Need to fix the signature scheme AND the render-path fallback, not just add render functions. |
| "Tri-state correctness in R1" | Still needed, severity unchanged. | Same. |
| "CRAG mock-API loading" | Still needed. Probe used `tool.*` modeling but `db.*` modeling is a defensible alternative. | Same. (See below for the modeling decision.) |
| "HTML retrieval primitive" | Untested by probe. Still expected to be needed for tail-entity questions. | Same. |
| "Popularity × dynamism slicing in score-r1-r9" | Untested by probe. | Same. |
| "Intent-shape contract for CRAG helpers" | **Newly-critical.** The probe shows the substrate's pivot doesn't fire on tool-only 2-call trajectories. Without fixing this, every authored CRAG helper is a correctness landmine. | **Promoted to blocker.** Was M effort; needs to be done before any CRAG paired comparison. |
| "Per-question intent workspace creation" | Untested by probe. | Same. |
| "Evidence shape convention" | Untested by probe. | Same. |

The probe also surfaced two gaps that weren't in `16`'s list at all:

**New Gap 9 — Name collision is silent.** Every trajectory after the first that hashes to `FANOUT(tool)` is silently skipped with "name already exists." The observer does not log this as a meaningful skip, does not attempt sub-graph extraction as a recovery path, does not consider authoring a differently-named helper for what is structurally a different shape. On CRAG, this means a single tenant gets exactly ONE FANOUT(tool) helper for the entire 2,706-question public set — the first trajectory wins, all sibling shapes ride on top of it. **Severity: blocker.** Needs a name-collision-with-shape-mismatch detector at minimum.

**New Gap 10 — Sub-graph extractor is `db.*`-rooted.** `extractSubGraphTemplates` returns 0 for any trajectory with no `db.*` call. CRAG's tool-only trajectories therefore get no sub-graph fallback when whole-trajectory crystallisation fails or produces a useless clone. A complementary `tool-only` sub-graph extractor (or a remapping decision) is needed. **Severity: medium**, but if Gap 9 gets fixed by remapping CRAG onto `df.db.*`, this gap becomes moot.

## The modeling decision the probe forces

The probe used `df.tool.cragFinance.*` (treating CRAG mock APIs as named external tools, the way SkillCraft binds external bundles). The alternative — treating CRAG mock APIs as queries against typed `df.db.*` collections — was deferred in the scouting brief and is now the more interesting design choice in light of the probe results.

| | `df.tool.*` modeling (what the probe ran) | `df.db.*` modeling (the alternative) |
|---|---|---|
| **Trajectory call shape** | `tool.cragFinance.getTickerByName(...)` | `db.cragFinance.companies.findExact({name: "Apple"})` |
| **Intent signature collapse** | All to `FANOUT(tool)` (as the probe showed) | All to `FANOUT(db)` — same collapse, different bucket |
| **Sub-graph extractor fires?** | No (extractor is db-rooted, no db.* present) | Yes (db.* leads, downstream tool/lib calls are sub-graph candidates) |
| **Helper template depth** | `toolFanout` / `toolFanoutEnrichment` (2 of 5) | `recordToolFanout` / `recordToolEnrichment` / `recordToolLookup` (3 of 5) — the richer-shape templates |
| **Fits substrate's existing wins** | SkillCraft used this | FinQA / `kb/br/06` used this; the demo's cold-to-warm flip works on this surface |
| **Loading cost** | Quick — wrap the Python Flask in TS shim | Medium — load mock KG into Atlas collections per domain |

The probe's `tool.*` modeling is the *cheaper* probe but the *wrong* modeling for the substrate. Three of the five intent-shape render functions only fire when there's a `db.*` lead-off call (`recordToolFanout`, `recordToolEnrichment`, `recordToolLookup`); the sub-graph extractor only fires when there's a `db.*` call; and the existing FinQA cold-to-warm demo is the existence proof that the substrate's strongest surface is `db.* → tool.* → lib.*`. The probe's `FANOUT(tool)` collapse is a real result but it's running the substrate against its weakest surface area.

**Recommendation:** before any CRAG paired comparison, remap CRAG mock APIs onto `df.db.crag.<domain>.<collection>` — load the mock KG once into Atlas (or an in-memory MountAdapter), expose each entity-table as a CollectionHandle, and let the agent's calls go through `db.findExact` / `db.search`. This pushes CRAG questions onto `FANOUT(db)→tool→lib` and `db→tool→FANOUT(db)→lib` shapes that the substrate's existing render functions can crystallise meaningfully.

If THAT remapping still produces the literal-clone failure mode for the 2-call simple-chain case, then the intent-shape pivot really does need extension to the 2-call trajectory length. That's a smaller fix than rewriting the whole signature scheme.

## Smallest follow-on probe

A 1-hour follow-on probe should re-run the same 7 trajectories under the `db.*` modeling instead of the `tool.*` modeling:

1. Add `cragFinance.companies` / `cragMovie.persons` / `cragMovie.titles` / etc. as in-memory `MountAdapter` collections (mirroring `src/snippet/__smoke__.ts` pattern).
2. Reshape the probe's `call(idx, primitive, input, output)` builders to use `db.cragFinance.companies.findExact({name: "Apple"})` shape primitives.
3. Re-run `extractTemplate` + `authorFunction` and compare authoring outcomes.

Predictions to verify:
- A1's intent signature flips from `FANOUT(tool)` to `db→db` (single-call db, then another single-call db) — also collapses to `FANOUT(db)`. **Maybe the same problem.**
- B's signature becomes `FANOUT(db)→FANOUT(tool)` (since the actual compute is local TS, not a tool/lib call). **Should now match `recordToolLookup`'s `FANOUT(db)→FANOUT(tool)` exactly.**
- C's signature stays `db→db` (or `FANOUT(db)`). **Same collapse problem.**
- E's signature becomes `db→FANOUT(db)` or similar. **Probably matches `recordToolFanout`.**

If the predictions hold, the remapping reduces the gap from "two new helper templates needed plus signature scheme rewrite" to "one new helper template for the 2-call chain case plus a fix to the data-shape-clone fallback." That's an order-of-magnitude reduction in substrate work.

## Key Takeaways

1. **The CRAG eval cannot run honestly today.** The substrate's intent-signature scheme collapses four structurally-distinct CRAG question shapes into one bucket (`FANOUT(tool)`), the observer authors one helper per tenant, and that helper is a literal data-shape clone that introduces silent correctness regressions when reused across siblings with different tools. The published intent-shape pivot from iter150+ does not fire on 2-call tool-only trajectories.
2. **The modeling decision matters more than predicted.** Routing CRAG mock APIs through `df.db.*` (collection queries) rather than `df.tool.*` (named external tools) would push trajectories onto `FANOUT(db)→FANOUT(tool)` and `db→FANOUT(tool)→lib` shapes that the substrate's existing record-rooted render functions already handle. A 1-hour follow-on probe should verify this before any production CRAG run.
3. **Two new blocker-severity gaps surfaced.** Name-collision-with-shape-mismatch is silent (the second-and-subsequent FANOUT(tool) trajectory just gets dropped on the floor); sub-graph extraction is hard-coded to `db.*`-rooted slices (returns 0 for tool-only trajectories). Both need fixing before CRAG; the second goes away if the modeling remap happens.
4. **The probe took 30 minutes and zero LLM calls.** This is the value of the smallest-first probe pattern. The full CRAG adapter + paired comparison would have spent 10 person-days to surface the same finding less cleanly. Reuse the pattern (hand-authored trajectories → extractTemplate + authorFunction) any time we need to validate substrate readiness for a new benchmark surface.

## Sources

- `scripts/crag-probe/crag-shape-probe.ts` (this probe's source).
- `src/observer/template.ts` (computeIntentSignature, extractSubGraphTemplates).
- `src/observer/author.ts` (authorFunction, renderToolFanOutSource and friends).
- `kb/docs/intent-shape-interface.md` (the iter150+ pivot the authored helper fails to honour).
- `kb/br/16-substrate-benchmark-scouting.md` (the scouting brief whose gap list this probe revises).
- Probe artefact: `/tmp/crag-probe-*/lib/crag-probe/toolFanout.ts` (the authored helper source, kept after each run for inspection).
