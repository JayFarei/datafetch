# CONTRACT.md — SaC-aligned PoC on SkillCraft (the interface keystone)

> Authoritative spec: `kb/plans/009-sac-aligned-poc-skillcraft.md` (v2).
> Background: `kb/br/20-perplexity-search-as-code.md`.
> This file is the binding contract for the four parallel build streams.
> If a stream needs to change anything pinned here, it edits this file
> first and flags the change in `STATUS.md`. Code findings below are cited
> by `file:line` against the working tree on branch `sac-poc-build`.

This experiment extends the existing SkillCraft datafetch harness with the
six-arm ladder (R3) so we can land a pre-registered break-even `M*` (R6),
an attribution ladder (R7), and a governance co-pillar (R8). The substrate
already proves crystallisation, promotion, and replay; the gap this PoC
fills is entirely in the runner (arm selection + lifecycle cost ledger +
two-phase fresh-process runner + Arm-1 parity gate), a new cross-arm
scorer, and a small set of governance-probe fixtures. No substrate
behaviour changes; the quarantine validator's numeric FAC replay is reused
verbatim (no tolerance change, per Scope Boundaries).

---

## (a) Arm enum and the selector mechanism

We extend the existing flag mechanism rather than replace it. Today the
runner resolves two things independently:

- `DATAFETCH_INTERFACE_MODE` (`src/hooks/mode.ts:44-55`) selects the
  callability surface: `legacy | hooks-candidate-only | hooks-draft |
  hooks-validated-only`. Production default is `hooks-candidate-only`
  (`src/hooks/mode.ts:35`), which makes zero learned helpers callable
  (`decideCallability` returns `not-callable`, `src/hooks/registry.ts:534`).
- `DATAFETCH_DISABLE_LEARNING` (`resolveDisableLearning`,
  `src/eval/skillcraftFullDatafetch.ts:98-101`) is a single boolean that
  today kills the **entire** learning loop at once: no `hydrateFamilyLibCache`,
  no `installObserver`, no `persistFamilyLibCache` (`:239-245`, `:682-695`,
  `:775-799`). It tags episodes `armId: "datafetch-control" | "datafetch-learned"`.

The PoC needs **six distinct arms**, several of which are partial
decouplings of that single boolean (notably Arm 3 = crystallise + callable
but skip the replay gate, which today cannot be expressed because the
gate and the learning loop are coupled). So we introduce one new
authoritative selector and keep the two existing flags as the surface it
drives.

### `SAC_ARM` — the single authoritative arm selector (NEW)

```
SAC_ARM = arm0 | arm1 | arm2 | arm3 | arm4 | arm5a | arm5b
```

Resolved by a new `resolveSacArm()` in `skillcraftFullDatafetch.ts`
(reads `process.env["SAC_ARM"]`, validates against the enum, throws on an
unknown value — no silent default; a missing `SAC_ARM` falls back to the
legacy `armId` derivation so existing Goal-4 runs are untouched). The
resolved arm is recorded in `run-info.json` as `sacArm` and is the single
source of truth from which every other toggle is derived:

| `SAC_ARM` | meaning (R3) | `DATAFETCH_INTERFACE_MODE` | learning loop | governance (replay gate) | results cache | recipe hint | phases |
|-----------|--------------|----------------------------|---------------|--------------------------|---------------|-------------|--------|
| `arm0`  | no-tools floor | `legacy` (irrelevant; tools off) | off | n/a | off | off | 1 |
| `arm1`  | tool-matched inline-rewrite, no persistence (adversarial bar) | `hooks-candidate-only` | hydrate OFF, observer ON for transcript only, persist OFF, **lib overlay wiped between questions** | n/a | off | 1 |
| `arm2`  | datafetch governed library | `hooks-draft` | full loop ON | **ON** (quarantine/replay PASS flips callability) | off | 1 |
| `arm3`  | ablation: crystallise + callable, SKIP replay gate | `hooks-draft` | crystallise + persist ON, callable ON | **OFF** (helper made callable without a replay PASS) | off | 1 |
| `arm4`  | frozen-library cross-session | `hooks-draft` | phase-1 build + freeze; phase-2 fresh process, cleared transcript, hydrate-only | ON during phase-1 build | off | 2 |
| `arm5a` | results-cache-only (memoization floor) | `hooks-candidate-only` | off (no authored code, no callable helper) | n/a | **ON** (strict name+args key) | off | 2 |
| `arm5b` | recipe-only (instruction-compression floor) | `hooks-candidate-only` | off (no callable code) | n/a | off | **ON** (NL/schema hint distilled from phase-1) | 2 |

Derivation rules (implemented in `resolveSacArm` + a small
`armConfig(arm)` record consumed at the runner's existing toggle sites):

- `interfaceMode`: arm0 -> `legacy`; arm1/arm5a/arm5b -> `hooks-candidate-only`;
  arm2/arm3/arm4 -> `hooks-draft`. The runner sets
  `process.env["DATAFETCH_INTERFACE_MODE"]` from this **before** any call to
  `getInterfaceMode()` (or passes it explicitly; see Risk R-1). It is then
  echoed into `run-info.json.interfaceMode` (already emitted at `:266`).
- `learningEnabled`: false for arm0/arm1/arm5a/arm5b; true for arm2/arm3/arm4.
  When false, the runner takes the existing `disableLearning` path
  (`:239-245`, `:682-695`). When true it hydrates/persists as today.
- `governanceGate`: true for arm2 and arm4-phase1; **false for arm3**. This is
  the new decoupled axis. See §(f) for exactly where arm3 diverges.
- `resultsCache`: true only for arm5a. See §arm5a below.
- `recipeHint`: true only for arm5b. See §arm5b below.
- `phases`: 2 for arm4/arm5a/arm5b (phase-1 build, phase-2 fresh-process
  held-out siblings); 1 otherwise. See §two-phase below.

`DATAFETCH_DISABLE_LEARNING` is retained for back-compat but is now derived
from `SAC_ARM` when `SAC_ARM` is set (the runner sets it internally so the
existing `:196` / `:239` / `:682` sites are unchanged). A run must not set
both `SAC_ARM` and a conflicting `DATAFETCH_DISABLE_LEARNING`/`DATAFETCH_INTERFACE_MODE`;
the runner asserts consistency and fails the run on conflict (see §(d) parity-fail philosophy).

### `armId` widening (episode record)

`AdapterEpisode.armId` (`:162`) is widened from the two-value union to:

```ts
armId?:
  | "datafetch-control"   // retained: legacy disableLearning runs
  | "datafetch-learned"   // retained: legacy learning runs
  | "sac-arm0" | "sac-arm1" | "sac-arm2"
  | "sac-arm3" | "sac-arm4" | "sac-arm5a" | "sac-arm5b";
```

When `SAC_ARM` is set, `armId = "sac-<arm>"`. The normalizer (§(e)) maps
these to a `sacArm` field on the normalized row; the cross-arm scorer keys
exclusively on `sacArm`, never on the legacy two-value `arm`.

### Arm-specific runner behaviour (pinned)

- **arm0 (no-tools floor):** tools are withheld. Pinned mechanism: the
  runner passes an empty tool bundle to the prompt renderer and the snippet
  runtime, and the prompt drops the callable surface / cold-start setup
  blocks. The agent answers from `task.md` + records only. `toolCalls`
  must be 0; the scorer asserts this.
- **arm1 (inline-rewrite, no persistence):** `interfaceMode =
  hooks-candidate-only` (nothing learned is callable), `learningEnabled =
  false`, and **the lib overlay is wiped between every question** — i.e. the
  runner deletes `workspace/lib`, `datafetchHome/lib/<tenant>`, and the
  per-family lib-cache contribution after each episode so no helper survives.
  The prompt instructs the agent to write AND reuse its own helper **within
  that one episode** (the adversarial bar). The shared prompt renderer
  (§(d)) supplies the inline-helper binding line. `promotedToLibCache` is
  always false; `libFunctionsAvailable` at start is 0 for every episode.
- **arm2 (governed library):** the full existing loop with `hooks-draft`.
  A helper becomes callable only after the quarantine/replay PASS
  (`validateAuthoredFromSourceHelpers` -> `decideCallability` returns
  `callable` once maturity flips to `validated-typescript`). This is the
  governance-as-callability framing (R1): the candidate-only -> callable
  promotion **is** the governed step.
- **arm3 (ablation without governance):** identical to arm2 EXCEPT the
  replay gate is skipped and the helper is made callable anyway. See §(f).
- **arm4 (frozen cross-session):** two phases (§two-phase).
- **arm5a (results-cache-only):** see below.
- **arm5b (recipe-only):** see below.

### arm5a results-cache-only (memoization floor) — pinned mechanism

No authored code, no callable helper. Phase-1 records every tool call's
`(toolName, canonicalJSON(args))` -> result into a per-family cache file
`results-cache/<family>.json` under the run out-dir. Phase-2 runs the
held-out siblings with `interfaceMode = hooks-candidate-only` and a
runtime tool-bridge shim that, on each `df.tool` call, looks up the strict
key and returns the cached result on an exact hit (counted as a cache hit),
else performs the live call. Key = `sha256(toolName + " " +
stableStringify(args))` where `stableStringify` sorts object keys. The
runner emits `cacheHitCount` / `cacheMissCount` / `cacheHitRate` per
episode. R4 invariant: phase-2 siblings are new-argument, so decisive cache
hits must be **zero** for arm5a (the scorer asserts `cacheHitCount == 0` on
arm5a phase-2 and fails the run otherwise — proving the memoization floor
genuinely cannot answer the held-out work).

### arm5b recipe-only (instruction-compression floor) — pinned mechanism

No callable code. After phase-1, the runner distils a short
natural-language / schema hint per family (the recipe) from the converged
intent — pinned shape: the `@intent-signature` + the tool bundle + the
param-name + a one-line NL gloss of the fan-out shape, capped at 600 chars,
written to `recipes/<family>.md`. Phase-2 runs held-out siblings with
`interfaceMode = hooks-candidate-only` (nothing callable) and injects the
recipe text into the prompt via the shared renderer's recipe slot. The
agent must re-author the helper from the recipe each episode (no persisted
code path). `recipeChars` is emitted per episode and counted toward
phase-2 input tokens at full weight.

### Two-phase fresh-process runner (arm4 / arm5a / arm5b) — pinned

Phase-1 ("build"): runs the train+warm levels of each family
(`LEARN_FROM_LEVELS`, `:49`) to build the library / cache / recipe, then
**freezes** it (snapshots `libCacheDir` to `phase1-frozen/` for arm4;
writes `results-cache/` for arm5a; writes `recipes/` for arm5b).

Phase-2 ("reuse"): a **fresh child process** (`spawn` a new `tsx`
invocation of the same entrypoint with `SAC_ARM=<arm> --phase=2
--frozen-lib=<phase1-frozen>`) with a **cleared transcript** (no carry-over
of phase-1 prompts/usage) runs the held-out new-argument siblings (the `h1`
hard level plus any held-out warm levels reserved for phase-2; the exact
held-out split is pinned in `PRE-REGISTRATION.md`). Arm4 phase-2 hydrates
the frozen lib read-only and must reuse it (`hydrateFamilyLibCache` with
persist disabled). The fresh process is what makes "cross-session" honest:
phase-2 pays no phase-1 token cost and starts from a cold transcript.

The runner emits, per episode, a `phaseTag: "phase1-build" | "phase2-reuse"`
(distinct from the existing `phase: train|warm|hard|unknown` level tag,
which is retained unchanged). Single-phase arms (0/1/2/3) emit
`phaseTag: "single"`.

---

## (b) Per-episode record schema — existing fields + new cost-ledger fields

The runner emits one `AdapterEpisode` JSON object per episode to
`episodes.jsonl` (`:294-311`). The schema below is the **complete** pinned
contract: every existing field stays (the normalizer and Goal-4 scorer
still consume them), plus the new cost-ledger and arm fields. New fields are
camelCase, optional (`?`) so older readers and resumed runs do not break,
and all-numeric ledger fields default to `null` when not applicable to the
arm (e.g. `governanceCostTokens` is `null` for arm1/arm5a/arm5b).

### Existing fields (retained verbatim — `AdapterEpisode` `:126-163`)

```
taskKey, taskFamily, family, taskId, round, level, mode,
officialPassed, officialStatus, officialScorePercent, officialScore,
answerCorrect, answerStatus,
totalTokens, effectiveTokens, elapsedMs, llmCalls, toolCalls,
libFunctionsUsed, libFunctionsAvailable, libFunctionsCreated, reuseRate,
regressionsPassed, artifactPath, bridgeStatus,
agentExitCode?, snippetExitCode?, agentFailureKind?, phase,
promotedToLibCache,
agentInputTokens?, agentCachedInputTokens?, agentOutputTokens?,
agentReasoningTokens?, agentElapsedMs?, armId?
```

> NOTE on `effectiveTokens`: today it is computed as
> `max(0, inputTokens - cachedInputTokens) + outputTokens` (`:830`), which
> **subtracts the cache**. Per R5 / METRICS, the confirmatory model-context
> token metric must count cached input at **full weight**. We do NOT
> repurpose the existing `effectiveTokens` field (the Goal-4 scorer and
> normalizer depend on its current meaning). Instead the runner emits the
> NEW field `effectiveModelContextTokens` (below) with the full-weight
> definition, and the cross-arm scorer reads ONLY that field. `effectiveTokens`
> is retained unchanged for back-compat.

### NEW cost-ledger + arm fields (added to `AdapterEpisode`)

```ts
// --- arm identity / phase ---
sacArm?: "arm0"|"arm1"|"arm2"|"arm3"|"arm4"|"arm5a"|"arm5b";
phaseTag?: "single" | "phase1-build" | "phase2-reuse";

// --- confirmatory model-context token metric (R5) ---
// = agentInputTokens + agentOutputTokens, cached input counted at FULL
//   weight (NOT subtracting agentCachedInputTokens). This is THE metric
//   the cross-arm scorer and the attribution ladder use.
effectiveModelContextTokens?: number | null;

// --- raw token components (full weight, no subtraction) ---
rawInputTokens?: number | null;     // = agentInputTokens (alias for clarity)
cachedInputTokens?: number | null;  // = agentCachedInputTokens (reported, never subtracted)
outputTokensLedger?: number | null; // = agentOutputTokens (alias for clarity)

// --- lifecycle cost ledger (R5/R6); tokens unless suffixed ---
// Phase-1 amortised costs (populated on phase1-build rows; null on phase2):
buildCostTokens?: number | null;        // codegen + crystallisation model-context tokens spent in phase-1 build for this family
governanceCostTokens?: number | null;   // replay/quarantine validation tokens (arm2/arm4 only; null when gate skipped/absent)
// Per-question marginal costs (populated on the per-question rows):
inlineCostPerQTokens?: number | null;   // arm1: model-context tokens to inline-rewrite the helper this question
warmCallCostPerQTokens?: number | null; // arm4 phase-2: model-context tokens to CALL the frozen helper this question
// Wall-clock + tool/sandbox accounting (already partly present; pinned here):
sandboxMs?: number | null;              // snippet-runtime wall time for this episode
wallClockMs?: number | null;            // agent wall time (mirrors agentElapsedMs; emitted for ledger symmetry)

// --- cache accounting (R4; arm5a primarily, emitted for all arms) ---
cacheHitCount?: number | null;          // strict name+args exact hits this episode
cacheMissCount?: number | null;         // strict name+args misses this episode
cacheHitRate?: number | null;           // cacheHitCount / (hit+miss); 0 when denom 0
decisiveCacheHit?: boolean | null;      // true iff a cache hit supplied a value used in the final answer

// --- recipe accounting (arm5b) ---
recipeChars?: number | null;            // chars of the injected recipe hint (counted at full weight in input)

// --- governance gate decision (R1/R8) ---
governanceGateApplied?: boolean | null; // true iff the quarantine/replay gate ran for this episode's helper(s)
governanceGatePassed?: boolean | null;  // true iff a replay PASS flipped callability (null when gate not applied)
helperCallable?: boolean | null;        // true iff at least one learned helper was callable to the agent this episode

// --- Arm-1 parity gate (R2; §(d)) ---
promptHash?: string | null;             // sha256 of the FULL rendered prompt for this episode
promptParityHash?: string | null;       // sha256 of the prompt with the binding line MASKED (arm1/arm4 must match)
bindingLineHash?: string | null;        // sha256 of just the binding line (arm1 inline vs arm4 df.lib call)
```

### Field semantics the runner MUST honour

- `effectiveModelContextTokens` is the ONLY token field the break-even and
  attribution math use. It equals `agentInputTokens + agentOutputTokens`,
  with `agentCachedInputTokens` reported separately and never subtracted.
- `buildCostTokens` and `governanceCostTokens` are emitted on
  `phase1-build` rows only and are **per-family** (the family's total
  build/governance spend), so the scorer sums them once per family, not per
  question. They are `null` on `single`/`phase2-reuse` rows.
- `inlineCostPerQTokens` is the arm1 per-question marginal model-context
  cost (= that episode's `effectiveModelContextTokens` minus a shared fixed
  prompt floor; the floor is the byte-identical task/context block measured
  once via the parity hash, so arm1 vs arm4 marginal costs are comparable).
  Pinned floor definition: the model-context tokens of the parity-masked
  prompt (`promptParityHash` body) rendered for that question, computed by
  the runner's token counter. `inlineCostPerQTokens = effectiveModelContextTokens
  - parityFloorTokens` (clamped at 0).
- `warmCallCostPerQTokens` is the arm4 phase-2 per-question marginal cost,
  computed identically: `effectiveModelContextTokens - parityFloorTokens`.
- `parityFloorTokens?: number | null` is ALSO emitted (the shared floor) so
  the scorer can recompute marginals without re-tokenising.

> Full pinned ledger field list (the StructuredOutput `episodeSchemaFields`)
> is the union of the retained fields and the NEW fields above.

---

## (c) Break-even M* and all metric definitions

All token quantities below are **model-context tokens** =
`effectiveModelContextTokens` (input + output, cached counted at full
weight). Never "cost savings" unless the full dollar ledger is shown (R5).

### PRIMARY — pre-registered lifecycle break-even M* (R6)

```
M* = (build_cost + governance_cost) / (arm1_inline_cost_per_q - arm4_warm_call_cost_per_q)
```

over **eligible warm reuses** (phase-2 held-out siblings that arm4 actually
answered by calling the frozen helper). Components:

- `build_cost` = sum over families of `buildCostTokens` (arm4 phase-1).
- `governance_cost` = sum over families of `governanceCostTokens` (arm4 phase-1).
- `arm1_inline_cost_per_q` = clustered mean of arm1 `inlineCostPerQTokens`
  over the same held-out question set arm4 is scored on.
- `arm4_warm_call_cost_per_q` = clustered mean of arm4 phase-2
  `warmCallCostPerQTokens` over eligible warm reuses.
- CI: clustered (by question) bootstrap. Report the **95% upper** CI of M*.
- **Success** = 95% upper CI of M* ≤ pre-registered `M0` (set in
  `PRE-REGISTRATION.md`).
- **Clean fail**: if `arm1_inline_cost_per_q - arm4_warm_call_cost_per_q ≤ 0`
  (denominator non-positive), `M* = +infinity` — a clean fail. SaC's
  published design has `M* = infinity` because it re-pays codegen every
  trajectory; the claim is that datafetch's `M*` is finite and ≤ `M0`.

### Cost unit, the parity-floor diagnostic, and the dollar-equivalent tie-breaker (R5)

**Decision (2026-06-02, user-confirmed; supersedes the v2 "char-floor vs
paired-differencing" framing).** The headline unit for BOTH M* and the
attribution ladder is **full-weight model-context tokens**
(`effectiveModelContextTokens` = raw input + cached input at 1× + output) —
what the model actually processes, and directly comparable to SaC's published
model-context reductions. Reported as a **token** claim, never a dollar claim.

- **The char-based `parityFloorTokens` is a DIAGNOSTIC, not the economic unit.**
  It is byte-identical across arm1/arm4 per question (the parity invariant), so
  it cancels exactly in the `arm1_inline − arm4_warm` difference regardless of
  its value. The scorer computes the denominator as the arm1-vs-arm4 paired
  difference of full-weight model-context cost directly (the paired-differencing
  estimand) and surfaces the floor only under
  `primaryBreakEven.parityFloorDiagnostic`. The earlier "the cached floor
  cancels by the prompt-parity gate" claim is RETIRED: the parity gate hashes
  prompt TEXT, not realized prompt-cache reads, so arm1/arm4 per-question cached
  counts are NOT guaranteed equal and the ~139k cached scaffolding does not
  provably cancel — which is precisely why the tie-breaker below exists.

- **REQUIRED dollar-equivalent tie-breaker.** Cached reads bill ~10× cheaper
  than fresh input, so a full-weight token win can overstate the dollar win. The
  scorer recomputes every endpoint under three units (`primaryBreakEven.sensitivity`
  and the per-arm `tokens.sensitivity` in the attribution block):
  - `fullWeight` (cached ×1) — the HEADLINE (reproduces the primary).
  - `freshPlusOutput` (cached ×0) — the cache-excluded marginal.
  - `dollarEquivalent` (cached ×0.1) — the TIE-BREAKER.
  The claim is reported as upheld **and** surviving the dollar ledger only when
  `claimSurvivesDollarLedger` is true (M* still clears M0, and arm4 still beats
  both floors with the CI excluding 0, under the ×0.1 unit). If the win holds at
  full weight but NOT under the dollar unit, the artifact MUST concede it is a
  model-context-token win, not a dollar win. (×0.1 is a published-list-price
  approximation; the exact pinned snapshot price is recorded in `run-info.json`.)

- **`governance_cost` is ~0 by construction.** The FAC quarantine/replay gate
  runs in-process with no model call (`sacArmGovernance` `costTokens = 0`), so
  M* pays back the one-time governed helper BUILD, not a token-expensive gate.
  Reported honestly as such, never inflated.

### CO-PRIMARY — attribution ladder (R7)

The callable-interface claim holds ONLY if **arm4 beats BOTH arm5a AND arm5b**
on `effectiveModelContextTokens` at **non-inferior correctness**. All three
run the same phase-2 held-out siblings.

- "beats" = arm4 mean `effectiveModelContextTokens` strictly below arm5a's
  and below arm5b's, with the clustered bootstrap CI of the pairwise
  difference excluding 0.
- "non-inferior correctness" = the clustered correctness NI rule below holds
  for arm4 vs each of arm5a and arm5b.

### SECONDARY — marginal cost (arm4 vs arm1)

arm4 phase-2 `warmCallCostPerQTokens` vs arm1 `inlineCostPerQTokens`,
clustered by question. Proves cross-session persistence is real. Reported as
secondary, NOT the headline (the v1 single primary was demoted).

### Correctness — clustered BY QUESTION (R9)

- Run k≥5 interleaved seeds per arm (see `PRE-REGISTRATION.md`).
- Aggregate per question to a **majority-vote** correctness label BEFORE any
  pairing. Never treat `(family, level, seed)` as independent pairs.
- Pairwise comparison: McNemar 2×2 on the per-question majority labels
  (discordant counts b, c -> `mcnemar_two_sided`, reusing the function at
  `p1-paired-analysis.py:88-99`).
- Non-inferiority: claimed ONLY if the **pre-registered clustered CI lower
  bound > -5pp**. Otherwise report descriptively: "observed delta X pp,
  formal non-inferiority not established."
- Within-arm noise floor (seed-to-seed disagreement) reported in every table.
- Family-level robustness + BH-FDR across slices reported.

### Cache-hit rate (R4)

Per-question `cacheHitRate` reported for every arm. Phase-2 siblings are
new-argument, so the scorer asserts **zero decisive cache hits**
(`decisiveCacheHit == false` for all phase-2 rows) across arms; strict
cache keys are identical across arms.

### Full lifecycle ledger (reported alongside, R5)

Per arm: `buildCostTokens`, `governanceCostTokens`, `warmCallCostPerQTokens`,
`inlineCostPerQTokens`, raw/cached/output tokens, tool calls, `sandboxMs` +
`wallClockMs`, dollars (if available). Scoped as "model-context token
savings," never "cost savings," unless the dollar ledger is shown.

---

## (d) Prompt-parity-hash mechanism (R2)

A single shared prompt renderer produces the arm1 and arm4 prompts. The ONLY
permitted difference is the **binding line** (arm1: "write and reuse an
inline ephemeral helper this episode"; arm4: "call the persisted
`df.lib.<helper>` interface"). Identical tools, context, retry budget,
prompt-token budget, and opportunity to discover the abstraction.

Today there is NO shared renderer: `renderLivePrompt` (`:2379`) dispatches to
`renderWorkspaceLivePrompt` / `renderBriefLivePrompt`, and the brief path
forks again into `renderLearnedReuseBriefPrompt` / `renderLearnedToolFanoutBriefPrompt`
/ cold-start (`:2416-2513`). The arm1/arm4 prompts must instead come from
ONE new function.

### Pinned mechanism

- New `renderSharedParityPrompt(input, { binding })` in
  `skillcraftFullDatafetch.ts` builds the entire prompt body — task.md,
  literal hints, callable surface / df.d.ts, initial workspace, reuse rules
  — from the SAME code path for arm1 and arm4, with a single **binding
  slot** filled per arm:
  - arm1 binding line: the inline-rewrite instruction (write the helper in
    `scripts/answer.ts`, reuse it within this episode, do not persist).
  - arm4 binding line: the call-the-frozen-helper instruction (call
    `df.lib.<helper>` for the repeated fan-out).
- The binding line is a single contiguous string region. The renderer
  returns `{ prompt, promptHash, promptParityHash, bindingLineHash }`:
  - `promptHash` = `sha256(prompt)`.
  - `promptParityHash` = `sha256(prompt with the binding region replaced by
    a fixed sentinel token `BINDING`)`.
  - `bindingLineHash` = `sha256(binding line)`.
- All three are emitted on the episode record (§(b)) and published.

### The machine-checked invariant (fail-run on mismatch)

For the matched question set, the runner asserts:
`arm1.promptParityHash === arm4.promptParityHash` for the same
`(family, level, seed)`. On mismatch the runner **fails the run** (throws,
non-zero exit) with a diff of the two parity-masked prompts. The published
artifact carries the parity hashes. arm1 and arm4 must also share the
retry budget, prompt-token budget, and tool set (asserted from
`run-info.json` + the per-episode token floor `parityFloorTokens`).

> The runner records both prompt hashes for EVERY arm (not just 1/4) so the
> demo can show byte-identical-except-one-line provenance. Arms 0/2/3/5a/5b
> may legitimately diverge (arm0 drops the tool surface; arm5b injects a
> recipe), so the hard parity assertion is scoped to the arm1<->arm4 pair.

---

## (e) FILE-OWNERSHIP MAP (one file -> exactly one build stream)

Four parallel streams run after this contract. No two streams edit the same
file. If a stream needs a symbol another stream owns, it depends on the
pinned interface here, not on the other stream's in-progress edits.

| File | Owner stream | Scope of edits |
|------|--------------|----------------|
| `src/eval/skillcraftFullDatafetch.ts` | **S1 runner-core** | `resolveSacArm` + `armConfig`; widen `AdapterEpisode` with all NEW fields (§b); `renderSharedParityPrompt` + parity gate; two-phase fresh-process runner; arm0 tool-withholding; arm1 lib-overlay wipe; arm5a results-cache shim; arm5b recipe distil/inject; lifecycle cost-ledger emission; `run-info.json.sacArm`. Reuses `persistFamilyLibCache`/`hydrateFamilyLibCache` (`:2138`,`:2050`) unchanged in signature. |
| `src/eval/sacArmGovernance.ts` (NEW) | **S2 governance** | The arm3 decouple helper (crystallise + force-callable WITHOUT a replay PASS, §f) and a thin wrapper that runs the three deterministic probes + the blind 20+20 mini-suite by reusing `validateAuthoredFromSourceHelpers` (`src/observer/quarantineValidator.ts`) read-only. S1 imports `forceCallableWithoutGovernance()` and `runGovernanceGate()` from here at the existing observer/promote sites; S2 owns the file. |
| `eval/skillcraft/scripts/score-cross-arm.ts` (NEW) | **S3 scorer** | The cross-arm scorer: break-even `M*` + clustered bootstrap CI; arm4-vs-5a/5b attribution; arm4-vs-1 secondary; clustered-by-question McNemar with the -5pp NI rule; cache-hit assertions; BH-FDR slices. Reads `normalized.jsonl` keyed on `sacArm`. **Does NOT extend `score-r1-r9.ts`** (intra-arm, `:431`,`:781`). |
| `eval/skillcraft/scripts/p1-paired-analysis.py` | **S3 scorer** | Add clustered-by-question NI + the `M*` bootstrap CI (alongside the existing McNemar `:88-99` and paired-t `:66-78`; do not remove them). Same owner as the scorer so the TS scorer and Python analysis stay consistent. |
| `eval/skillcraft/scripts/normalize-results.ts` | **S1 runner-core** | Map the NEW episode fields (`sacArm`, `phaseTag`, `effectiveModelContextTokens`, the cost-ledger fields, parity hashes, cache/recipe/governance fields) onto `NormalizedRow`; widen the `Arm` union with the `sac-arm*` ids and add a `sacArm` field. Same owner as the runner because the schema bridge must match the emitter exactly. |
| `skills/datafetch/SKILL.md` | **S4 preseed + fixtures** | Composition-pattern few-shot; name `df.tool`; sub-2000-token, mostly composition few-shots (kb/br/20 recipe). |
| `eval/skillcraft/fixtures/sac-poc/` (NEW dir) | **S4 preseed + fixtures** | The three deterministic governance-probe fixtures (wrong-sibling clone, under-parameterised clone, source-drift) + the blind 20+20 mutant/valid mini-suite. See §(f). |
| `experiments/2026-06-sac-poc/*.md` | **(this keystone)** | CONTRACT / PRE-REGISTRATION / README / STATUS. Streams append to STATUS; they do not rewrite CONTRACT without flagging. |
| `eval/skillcraft/scripts/run-sac-poc.sh` (NEW) | **S1 runner-core** | The arm-matrix + k-seed orchestration wrapper (sets `SAC_ARM`, interleaves seeds, runs phase-1/phase-2, then normalize + score). |

Files that are READ-ONLY for all streams (reused, not edited): `src/hooks/mode.ts`,
`src/hooks/registry.ts`, `src/observer/quarantineValidator.ts`,
`src/observer/install.ts`, `eval/skillcraft/scripts/score-r1-r9.ts`,
`eval/skillcraft/scripts/walk-artifacts.ts`. The numeric FAC replay
(`quarantineValidator.ts:51-58`) is reused with **no tolerance change**
(Scope Boundary).

---

## (f) Governance probes + the numeric FAC replay reuse

### Where arm3 diverges from arm2 (the decoupled gate)

arm2 and arm3 both crystallise and both run under `hooks-draft`. The single
divergence:

- **arm2**: after crystallisation, the runner calls `runGovernanceGate()`
  (S2 wrapper around `validateAuthoredFromSourceHelpers`,
  `quarantineValidator.ts:61`). A helper becomes callable ONLY if the
  idempotency + genericity (held-out sibling) replay PASS flips its maturity
  to `validated-typescript`, at which point `decideCallability`
  (`registry.ts:546-554`, hooks-draft branch) returns `callable`. Tokens
  spent here are recorded as `governanceCostTokens`. `governanceGateApplied
  = true`, `governanceGatePassed` reflects the PASS/FAIL.
- **arm3**: the runner calls `forceCallableWithoutGovernance()` (S2) which
  flips the helper's `@quarantined: true` header to `false` and promotes its
  maturity to `validated-typescript` **without running any replay** — making
  it callable while skipping the gate. `governanceGateApplied = false`,
  `governanceGatePassed = null`, `governanceCostTokens = null`. This is the
  axis today's `DATAFETCH_DISABLE_LEARNING` cannot express (it would kill
  crystallisation entirely); arm3 keeps crystallisation + callability and
  removes ONLY the gate.

This is the governance co-pillar (R8): arm2 vs arm3 on the rate of
confidently-wrong helper-mediated answers, shown via the deterministic
probes below (no measured organic safety rate is claimed; Scope Boundary).

### The three deterministic probes (R8) — fixtures + replay reuse

Fixtures live in `eval/skillcraft/fixtures/sac-poc/` (S4-owned). Each probe
runs a FROZEN gate (the quarantine validator) against a BLIND generator and
held-out siblings, and reuses the numeric FAC replay verbatim:

1. **wrong-sibling clone**: a helper crystallised for family A is replayed
   against a family-B sibling trajectory whose numeric answer differs.
   `replayOnTrajectory` (`quarantineValidator.ts:301`) must FAC-mismatch ->
   the gate must NOT promote (arm2 declines; arm3 would have emitted the
   wrong value). Fixture: `wrong-sibling/{helper.ts, originating.json,
   sibling.json}`.
2. **under-parameterised clone**: a helper that hard-codes a constant the
   sibling varies. The genericity replay against the sibling must
   FAC-mismatch (the helper returns the originating value for the sibling's
   inputs) -> gate declines. Fixture: `under-parameterised/...`.
3. **source-drift**: a numerically-constructible drift — mutate a numeric
   fixture so the frozen helper now returns a STALE value that replay
   catches. The originating trajectory's `answer.value` is changed; replay
   recomputes and FAC-mismatches the stale return -> gate declines. Fixture:
   `source-drift/...`. (This is the only replay-contract extension permitted
   by Scope Boundary — numerically constructible, no tolerance change.)

Each probe's expected outcome is pinned: **arm2 (gate on) declines on all
three; arm3 (gate off) emits the wrong / stale value on all three.** S2's
probe harness asserts exactly this and writes
`governance-probes.json` to the run out-dir.

### Blind 20+20 mutant/valid mini-suite (R8, qualitative)

20 valid + 20 mutant helpers, generated blind (the gate does not know which
is which), replayed through `validateAuthoredFromSourceHelpers`. Reported
**qualitatively** with rule-of-three (wide) uncertainty bounds. No measured
organic safety rate is claimed; the quantitative 50+50 suite is paper
follow-up (Scope Boundary). Fixtures under
`eval/skillcraft/fixtures/sac-poc/blind-suite/`.

---

## Pinned invariants the runner MUST assert (fail-run on violation)

1. `SAC_ARM` resolves to a known enum value or the run throws (no silent default).
2. No conflict between `SAC_ARM` and a manually set
   `DATAFETCH_INTERFACE_MODE` / `DATAFETCH_DISABLE_LEARNING`.
3. arm1.promptParityHash === arm4.promptParityHash for every matched
   `(family, level, seed)`; else fail the run with a parity diff.
4. arm5a phase-2 `decisiveCacheHit == false` for all rows (R4 zero-decisive-hit).
5. arm0 `toolCalls == 0` for all rows.
6. `interfaceMode` in `run-info.json` matches `armConfig(sacArm).interfaceMode`.
7. The governance probes produce the pinned arm2-declines / arm3-emits-wrong
   outcome on all three deterministic cases.
