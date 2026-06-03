# SaC-aligned PoC — RUN-LOG

Append-only attempt log for the datafetch dataset-onboarding-SDK Goal (branch `sac-poc-build`). Each entry: the change, the evidence observed (command output / figures / file paths), and the next-step rationale. BLOCKED entries record attempted paths, evidence gathered, the blocker, and the input that would unlock progress.

---

## 2026-06-02 — Attempt 1: warm-up review + Phase-1 gate reframe

**Change:** No code change. Reviewed the warm-up handoff (`/tmp/datafetch-sac-goal-warmup.md`) by re-verifying its claims against the repo (6-agent fan-out) before starting the Phase-1 gate. Scaffolded this RUN-LOG.

**Evidence observed (re-verified, not taken on the doc's word):**
- Git: branch `sac-poc-build` @ `329fa4c04`; uncommitted fix in exactly `src/eval/sacArms.ts` + `src/eval/skillcraftFullDatafetch.ts` (`effectiveModelContextTokens = input + cached + output`, `sacArms.ts:363-367`, call site `:1283`). `score-cross-arm.ts` + `run-sac-poc.sh` untouched.
- `pnpm typecheck` → exit 0 (re-ran). `pnpm test:unit` → 47 files / 398 tests pass, exit 0 (re-ran). `npx tsx eval/skillcraft/scripts/run-governance-probes.ts` → 3/3 deterministic PASS + blind 20+20 = 0 false-accept / 0 false-reject, exit 0 (re-ran offline).
- File map all present; `RUN-LOG.md` was absent (now created); `PRE-REGISTRATION.md` unfilled (M0 placeholder, sign-off checkboxes empty).
- Honesty: correctness null conceded; no fabricated experiment numbers (all figures are build/smoke or cited priors); "vs ephemeral regime" framing consistent, no "vs SaC" slips.
- §5 leaks all real in source: `quarantineValidator` numeric-only (`src/observer/quarantineValidator.ts:182,156-175,195-213,313-330`); `finqacases`/`rangeTableMetric` hardcodes in `src/observer/author.ts:1458,1472,1649,1742,1774,2208`; HF coupling in `src/server/v1catalog.ts:130-161` (NOT the CLI `add`, which is adapter-agnostic).

**Finding that changes the gate (see BLOCKED below):** the §6 "paired-differencing vs char-floor" decision is mis-framed.
- The scorer ALREADY pairs by question and the ~1,701 char `parityFloorTokens` ALREADY cancels by subtraction in the M* denominator (`score-cross-arm.ts:506-510` → `mean(arm1 emc) − mean(arm4 emc)`). So "switch to full-token paired differences" is a no-op there.
- The doc's stated mechanism is wrong: the parity gate hashes PROMPT TEXT (`computeParityHashes`), not realized prompt-cache reads. arm1 (candidate-only, lib wiped) vs arm4 (hooks-draft, hydrated) have different context/transcripts, so per-question CACHED tokens need not be equal → the "~139k cached floor cancels by the parity gate" premise is unproven and probably false.
- The genuinely open question: `build_cost` numerator (`skillcraftFullDatafetch.ts:1304`) counts cached at FULL weight (~141k/episode) while the denominator nets the shared floor out → `M* = cache-inflated-numerator / cache-net-denominator`. The attribution ladder (arm4 vs arm5a/5b) is scored in raw `effectiveModelContextTokensMean` (`score-cross-arm.ts:853-867`) with NO parity invariant (CONTRACT scopes hard parity to arm1↔arm4 only), so cached-at-full-weight does NOT cancel there. Cached reads cost ~10x less in $, so the win could shrink at fresh+output granularity, which the design does not separately test.
- Secondary: `governance_cost` hardcoded 0 (`sacArmGovernance.ts:83`, in-process FAC replay); `STATUS.md:29` stale ("S3 scorer not started" while the 1274-line scorer exists).

**Next-step rationale:** the Phase-1 gate is a user decision and the framing must be corrected first. Consulting Codex (Architect, advisory) to independently sanity-check the reframe, then surfacing the corrected metric decision to the user. No commit of the cached-token fix until the metric unit is settled (the fix and the scorer change land together).

### BLOCKED — Phase-1 paired-differencing / cost-metric unit decision (needs user)

**Attempted paths:** (1) take the warm-up's recommended "adopt paired-differencing, demote parityFloorTokens to diagnostic" at face value — rejected, because the char floor already cancels in code and the cached floor (the thing that actually dominates the ~141k) does not provably cancel via the parity gate. (2) Default to keeping `effectiveModelContextTokens` full-weight everywhere — viable as a model-context claim but overstates real-dollar savings ~10x and leaves the attribution ladder denominated in an uncontrolled cached unit.

**Evidence gathered:** see Attempt 1 above (file:line refs for the denominator cancellation, the prompt-text-only parity hash, the cache-inflated numerator, and the no-parity attribution comparison).

**Blocker:** the headline amortisation + attribution claim's UNIT is undecided. Specifically: (a) does `build_cost` (numerator) and the arm4-vs-arm5a/5b attribution comparison count cached tokens at full weight, or fresh+output only? (b) do we report a cache-discounted dollar ledger (cached ≈ 0.1x input) alongside the token metric, and require the claim to survive there?

**Input that would unlock progress:** user's choice of headline unit (full-weight model-context tokens / fresh+output-only marginal / both with the dollar ledger as tie-breaker).

**Codex (Architect, advisory, read-only) consult — done:** independently CONFIRMED claims A, B, C against the code (cites `score-cross-arm.ts:700` matched rows, `:1218` parity-hash-only assertion, `:656`/`:798`/`:853` cache-inclusive numerator + raw-token attribution; `skillcraftFullDatafetch.ts:1364` records cached separately; `:1297` buildCost cache-inclusive). Recommendation: **headline = full-weight model-context tokens (cached at 1x)** for BOTH M* and attribution (SaC-comparable, matches CONTRACT), worded explicitly as a "model-context token reduction/amortisation vs the ephemeral regime" claim, NOT a dollar claim; **add a cache-discounted dollar-equivalent ledger (cached ≈ 0.1x) as a required secondary tie-breaker the claim must survive**; demote `parityFloorTokens` to a diagnostic; keep `buildCostTokens` cache-inclusive so numerator/denominator share the unit; add scorer-only sensitivity tables (fresh+output, fresh+discounted-cached+output) from the already-normalised `rawInputTokens`/`cachedInputTokens`/`outputTokensLedger` fields. Effort: Short, scorer-only, no episode-runner churn. On `governance_cost=0`: does not invalidate M* but weakens "pays back the gate" phrasing — report honestly as "FAC gate is a zero-model-token governance/callability control; M* pays back the one-time governed helper BUILD, not a token-expensive gate." Surfacing the unit choice to the user now (Codex rec = option 1).

---

## 2026-06-02 — Attempt 2: Phase-1 metric decision RESOLVED + implemented + verified

**User decision (AskUserQuestion):** option 1 — **full-weight model-context tokens as the headline unit, with a required cache-discounted dollar-equivalent ledger (cached ×0.1) as the tie-breaker the claim must survive.** This RESOLVES the BLOCKED gate above.

**Change (scorer + spec + test only; NO runner-logic churn):**
- `src/eval/sacArms.ts` — fixed the stale formula comment; added exported pure helper `modelContextCostAtCachedWeight({raw,cached,output,cachedWeight})` (single source of truth for the unit arithmetic). Also carries the previously-staged cached-token full-weight fix to `effectiveModelContextTokens`.
- `eval/skillcraft/scripts/score-cross-arm.ts` — denominator now the arm1-vs-arm4 paired difference of full-weight model-context cost directly (char floor DEMOTED to `primaryBreakEven.parityFloorDiagnostic`, shown to cancel); added the 3-unit sensitivity ladder (fullWeight ×1 / freshPlusOutput ×0 / dollarEquivalent ×0.1) to M* and the attribution ladder; added `claimSurvivesDollarLedger` to both; added the `governance_cost≈0` honest note; console prints the tie-breaker line. Imports the helper from `sacArms.ts` so the scorer and runner cannot drift.
- `tests/sac-cost-ledger.test.ts` (NEW) — 7 guards for the cost arithmetic (no scorer test existed before).
- `experiments/2026-06-sac-poc/CONTRACT.md` §(c) + `PRE-REGISTRATION.md` §1 — pinned the unit decision, the parity-floor-as-diagnostic, the dollar tie-breaker rule, and the governance_cost≈0 framing.
- The previously-staged cached-token fix in `src/eval/skillcraftFullDatafetch.ts:1283` is committed together (per warm-up §6).

**Evidence observed:**
- `pnpm typecheck` → exit 0 (re-ran). Targeted `tsc` on the scorer (it is NOT in the project tsc include — a pre-existing gap) → no errors for score-cross-arm.ts / sacArms.ts.
- `pnpm test:unit` → 48 files / 405 tests pass (was 47/398; +1 file/+7 guards), exit 0.
- Synthetic end-to-end scorer run (`/tmp/sac-dryrun/normalized.jsonl`, one family, arms 1/4/5a/5b, `--m0 8`): `PRIMARY M*: point=1.322 95%-upper=1.322 -> SUCCESS`; matches hand-calc 53008/40100. `parityFloorDiagnostic.cancelsInDenominator=true` (arm1=arm4=1700). Sensitivity: fullWeight 1.322 (== primary, the NO-OP equivalence) / freshPlusOutput 2.735 / dollarEquivalent 1.602 — all match hand-calc. `claimSurvivesDollarLedger` true for M* and attribution; attribution beats both floors under all three units; `governanceCostTokens=0`; invariants ALL HELD; exit 0.

**No-op proof (why the primary number is unchanged):** numerator at ×1 = sum per family of (raw+cached+out) = sum of `buildCostTokens` (= emc on phase-1 rows) = old numerator. Denominator: per-question arm1/arm4 char floors are byte-identical (parity invariant), so they cancel in the difference for EVERY bootstrap resample → identical point AND CI. Verified numerically (1.322 both ways) and guarded by the "difference cancels when cached counts match / diverges when they don't" unit test.

**Next-step rationale:** the Phase-1 metric definition is now settled, implemented, and verified green. Two safe deterministic items done after the decision: `run-sac-poc.sh` already wires the scorer (lines 162-169) so no change needed; `STATUS.md` updated (S3 BUILT, milestone 6 checked, metric decision noted). Remaining Phase-1 deliverable (the confirmatory run) is gated — see BLOCKED below.

### BLOCKED — Phase-1 confirmatory run + pre-registration sign-off (needs user)

**Attempted paths:** (1) auto-launch the k≥5-seed run now — declined: `PRE-REGISTRATION.md` §8 line 156 requires the file be COMMITTED BEFORE the confirmatory run starts, and the harness commits only on explicit user request; I cannot honestly start the run while the pre-registration is uncommitted. (2) Fabricate/placeholder the M*/b,c,b+c/cost-frontier results to "close" Phase 1 — declined: violates the Goal's no-fabricated-numbers constraint; these require a real run.

**Evidence gathered:** scorer + metric definition verified green (Attempt 2 above): typecheck exit 0, `test:unit` 405/405, synthetic end-to-end scorer run correct (M*=1.322, no-op confirmed, sensitivity + dollar tie-breaker compute, invariants held, exit 0). `run-sac-poc.sh` is the ready orchestrator (`--families --seeds --m0 --model --reasoning --live`; interleaves seeds; runs scorer at the end). Live backend per warm-up §4: `DATAFETCH_AGENT=claude CLAUDE_CLI=claude-p` ($0 on Claude Max).

**Blocker:** the Phase-1 deliverable (break-even M* with 95% upper CI vs M0, realised b/c/b+c, the attribution ladder result, cost-frontier figure, demo artifact) cannot be produced without executing the confirmatory run, and the run cannot honestly start until (a) the metric-decision changes are committed (so PRE-REG can be committed per its own rule) and (b) the pre-registration §8 run-config is pinned.

**Input that would unlock progress:**
1. Go-ahead to commit the metric-decision changes (the 6-file scope already shown; cached-token fix bundled with the scorer per warm-up §6). This lets PRE-REGISTRATION be committed before the run.
2. The pinned PRE-REGISTRATION §8 run-config: `M0` (confirm the pre-registered 8, or set), `k` (≥5; e.g. 5), the pinned dated model snapshot + reasoning effort (what `claude-p` should run), and the family set (e.g. the SkillCraft families with R7=0.846; `run-sac-poc.sh` example uses `countries-explorer,random-user-database`).
3. Whether to run a tiny live smoke first (1 family × {arm1,arm4,arm2} × 1 seed, per the verify-skill suggestion) before committing to the full 7-arm × k-seed run.

Phase-3 WideSearch-vs-alternative corpus choice also remains open (deferred until Phase 3, as the Goal specifies).

---

## 2026-06-02 — Attempt 3: live smoke (pipeline VALIDATED; reuse loop did NOT fire — new blocker)

**Change:** ran a tiny live smoke via `run-sac-poc.sh` (arms arm1,arm2,arm4 × family `random-user-database` × seed 1 × `--live`, `DATAFETCH_AGENT=claude` / `claude-p`). First attempt died instantly on a real orchestrator bug — `run-sac-poc.sh:94 model_args[@]: unbound variable` (empty-array expansion under `set -u` on macOS bash). Fixed both unguarded expansions to the `${arr[@]+"${arr[@]}"}` idiom (lines 101/103); `bash -n` clean. Relaunched; ran to completion, exit 0.

**Evidence observed — pipeline + parity VALIDATED (the smoke's primary goal):**
- 18 normalized rows (arm1/single 6, arm2/single 6, arm4/phase1-build 5, arm4/phase2-reuse 1); normalize + the new cross-arm scorer both ran; `invariants: ALL HELD`; exit 0.
- **arm1↔arm4 prompt-parity hashes are BYTE-IDENTICAL at all 6 levels** (e1 `0deedebe`, e2 `7bae3132`, e3 `da6c582b`, m1 `b22e1486`, m2 `3b3883e3`, h1 `90d883a7` — match exactly). R2 parity invariant validated on REAL prompts.
- The new scorer code (sensitivity ladder + dollar tie-breaker + parity-floor diagnostic) executed on live rows and printed the `DOLLAR-LEDGER tie-breaker` line.
- arm2 official correctness is fine (e2–h1 pass at 100%); the agent works.

**Evidence observed — the crystallise→reuse loop did NOT fire (new blocker):**
- `M*: point=Infinity -> CLEAN FAIL (denom<=0)` — arm4 warm cost was not below arm1 inline, because there was no warm reuse.
- arm4 phase-1 crystallised NOTHING: `lib-status.json` at m2 = `availableAtStart:[], functionsAfterAgent:[], committedNewFunctions:0, libCalls:0`. The frozen lib (`phase1-frozen/random-user-database/`) contains only `intent-index.jsonl` — no helper functions. So phase-2 had nothing to hydrate (`helperCallable=false, libCalls:0`).
- arm2's `helperCallable=true` was only the pre-seeded `recordToolLookup`, never called (`libCalls:0, committedNewFunctions:0`).
- `libCalls:0` across EVERY arm and level → no reuse fired anywhere.

**Interpretation (honest, no fabrication):** the smoke proved the harness/parity/scorer pipeline is sound, but on `random-user-database` the agent did not crystallise or reuse a helper at all, so M* is a clean fail by construction. Two non-exclusive causes: (a) family choice — `random-user-database` may lack the repeated per-entity fan-out that triggers crystallisation (the R7=0.846 "reuse fires" families are likely the fan-out ones, e.g. pokeapi/dnd/countries-encyclopedia); (b) the S4 preseed (Milestone 3 in `STATUS.md`, "composition few-shot; name df.tool") is NOT STARTED — without it the agent is not induced to crystallise + name `df.tool` helpers. Connects to [[project_crag_within_session_negative]] (frontier models don't spontaneously reuse small helpers) and the [[project_sac_aligned_poc]] "reuse fires" premise, which this smoke puts in question for this family/config.

### BLOCKED — reuse loop must fire before the confirmatory run is meaningful (needs user)

**Attempted paths:** (1) run-sac-poc.sh bash fix → unblocked the orchestrator (validated end-to-end). (2) the smoke itself → validated pipeline/parity but exposed zero crystallisation/reuse. (3) proceeding to the full k≥5 run now → declined: it would produce clean-fail M* on every seed (no reuse → no warm saving), wasting a large live run and producing no headline result.

**Evidence gathered:** see Attempt 3 above (lib-status.json = 0 committed functions, 0 lib calls; empty frozen lib; M* clean-fail).

**Blocker:** the PoC's central mechanism (crystallise a helper in phase-1, reuse it warm in phase-2) did not fire. The confirmatory run cannot yield a finite M*/attribution result until reuse demonstrably fires in a smoke.

**Input that would unlock progress:**
1. Family choice for Phase 1 — which SkillCraft family(ies) actually exhibit the repeated fan-out where reuse fires (candidates with structural per-entity fan-out + ideally numeric answers so the governance gate validates)? `random-user-database` did not.
2. Whether the S4 preseed (Milestone 3) must be built/landed first to induce crystallisation + `df.tool` naming — i.e., is "reuse fires" contingent on the preseed, and should that be the next build step?
3. With those settled, re-run the tiny smoke to confirm reuse fires (libCalls>0, arm4 phase-2 helperCallable=true, M* finite) BEFORE committing to the k≥5 run.

---

## 2026-06-02 — Attempt 4: preseed mandate → crystallise+reuse FIRES (arm2 proven); arm4 warm path gated on phase-1 passing

**Change:** added a MANDATE-strength preseed to `renderLiveAgentInstructions` (→ workspace AGENTS.md; user-chosen channel since claude-p loads the GLOBAL `~/.claude/skills/datafetch/SKILL.md`, not the repo copy — see Attempt-3 channel finding). The mandate: for repeated per-entity tool fan-out, the agent MUST route through `df.lib.per_entity({ entityValues, toolBundle, toolNames, paramName })` (or a learned helper), never a raw inline loop; "inline fan-out is not learnable." Grounded in the FinChain iter-3.0a finding (soft prose ignored, mandate is the lever) and the observer crystallisation mechanism. Parity-safe: arm-agnostic content, and AGENTS.md is NOT part of the parity-hashed prompt. Re-smoked on `countries-encyclopedia` (a confirmed fan-out family) × arm1/arm2/arm4 × seed 1.

**Evidence — the preseed WORKS (crystallise→reuse fires):**
- `pnpm typecheck` exit 0; `pnpm test:unit` 48 files / **405/405** pass, exit 0 (preseed is prompt text).
- arm2: the observer crystallised a REAL transferable helper `lib-cache/countries-encyclopedia/toolFanout.ts` (+ the `__intent__/` shared pool), frontmatter `name: toolFanout, shape-hash 363b95de, "Transferable learned datafetch fan-out helper"`. It was REUSED across episodes: `learnedInterfaceCalls` = 9 (e1) → 1 (e3) → 4 (m1) → 3 (m2); `helperCallable=true` from e1. This is the central mechanism firing for the first time in the SaC harness (vs Attempt-3's all-zero null).
- vs Attempt 3 (random-user-database): there, `libCalls=0` everywhere. The mandate + a fan-out family flipped it.

**Evidence — arm4 two-phase warm path still clean-fails (different, narrower cause):**
- `M*: Infinity / CLEAN FAIL (denom<=0)`; arm4 phase-2/h1 `pass=0, helperCallable=false, availableAtStart=[]`; frozen lib (`phase1-frozen/countries-encyclopedia/`) holds only `intent-index.jsonl` — no `toolFanout.ts`.
- ROOT CAUSE (not a freeze-code bug): arm4 phase-1 FAILED 3 of 5 levels on this single seed (e2,e3,m2 `pass=0`); crystallisation requires a PASSING episode + convergence, so phase-1 never accumulated/persisted a helper to freeze. `find arm4 -name toolFanout*` → nothing (no lib-cache helper). arm2 (5/6 passing) crystallised fine; arm4 phase-1 (2/5 passing) did not. Freeze logic (skillcraftFullDatafetch.ts:525-528, freezes libCacheDir→phase1-frozen) is correct — there was simply nothing to freeze.
- Also: `countries-encyclopedia` correctness is shaky for the agent on a single seed (arm1 e1 fail; arm4 3/5 fail). The k≥5 multi-seed design exists to absorb exactly this noise, but we still want one clean arm4 warm-path demo (phase-1 crystallises → phase-2 reuses → finite M*) before the full run.

**Next-step rationale:** the preseed is validated and committed. The remaining gate for a clean arm4 warm-path demonstration is a fan-out family where arm4 phase-1 reliably PASSES (so it crystallises+freezes a helper), and/or running multiple seeds so at least some phase-1 episodes crystallise per family. This is the family-selection input still owed (which overlaps the confirmatory-run family set). Surfacing the choice to the user. NOT a runner bug; do not edit freeze/hydrate logic.

---

## 2026-06-02 — Attempt 5: pre-registration FROZEN; confirmatory k=5 run launched

**User decision:** pin config + run the full k≥5 ladder now; family choice delegated ("easier ones").

**Change:** froze `PRE-REGISTRATION.md` §8 (M0=8 unchanged, k=5, model `claude-sonnet-4-6` via claude-p, families = cat-facts-collector / dog-breeds-encyclopedia / pokeapi-pokedex, held-out split e1..m2 / h1) and committed it BEFORE the run (integrity requirement §8). Families chosen as higher-pass-rate per-entity fan-out (so arm4 phase-1 crystallises); post-hoc easier-family selection disclosed per §6 (existence proof, not generality).

**Run:** all 7 arms × 5 interleaved seeds × 3 families via `run-sac-poc.sh --live` (`DATAFETCH_AGENT=claude`, sonnet-4-6). Structured PER-FAMILY (separate orchestrator invocations to `eval/skillcraft/results/sac-poc/confirm-k5/<fam>`) so a single-family crash cannot abort the whole run; the first family (~3h of ~9h total at ~50s/episode) is an early end-to-end checkpoint on the arm4 warm path. After all families, the union of normalized.jsonl is scored once with `score-cross-arm.ts --m0 8`.

**Evidence to surface on completion:** per-arm M* + 95% upper CI vs M0=8 (full-weight headline + dollarEquivalent tie-breaker), realised b/c/b+c (clustered McNemar), the arm4-vs-arm5a/5b attribution ladder + claimSurvivesDollarLedger, and `pnpm typecheck` + `pnpm test` exit lines. Running now; results pending.

---

## 2026-06-03 — Attempt 6: confirmatory k=5 run COMPLETE — headline FAILS + run INVALID by its own gates

**Run:** 630 episodes, 7 arms × 5 seeds × 3 families (cat-facts-collector / dog-breeds-encyclopedia / pokeapi-pokedex), claude-sonnet-4-6, ~8h (23:46→07:56). All families completed; union scored (`confirm-k5/score.json`; the scorer exited 2 — correctly — because of pinned-invariant violations, but the scorecard was written).

**HEADLINE RESULT — the PoC claim does NOT hold as run (honest negative):**
- PRIMARY M* = **+Infinity / CLEAN FAIL**: denominator = arm1_inline (143,943 tok/q) − arm4_warm (145,065 tok/q) = **−1,121.6** (warm path costs MORE than inline; no amortisation). Only 3 eligible warm-reuse questions. M* survives dollar ledger = false (moot — clean fail).
- ATTRIBUTION: arm4 beats BOTH floors on tokens (vs5a −179,246; vs5b −159,373; beats=true) BUT fails correctness NI to both (niHolds=false). `claimUpheld=false`. The "cheaper" is an artefact of arm4 FAILING (failed/abstained answers are cheap), not a real win.

**WHY — two real defects the run exposed (not just a null):**
1. **arm4 two-phase runner is broken on correctness.** arm4 pass = **9/90 (10%)**; phase-2 = 2/15; phase-1 = 7/75 (~9%). On the SAME phase-1 levels (e1..m2), single-phase **arm2 passes 69/90 (77%)** and arm1 32%. The only difference is arm4's two-phase fresh-process path → its phase-1 correctness collapses, so little/nothing good crystallises to freeze, and phase-2 (hydrating an empty/poor frozen lib while mandated to call it) fails. This is a substrate bug in the named two-phase runner, not a property of the thesis.
2. **R4 held-out assumption is FALSE for these families.** 25 of 39 invariant violations are `arm5a phase-2 decisiveCacheHit==true / cacheHitCount 12-20` — i.e. h1 reuses phase-1 entities/args, so the memoization floor (arm5a) CACHE-HITS the "held-out" siblings. h1 is not new-argument here, which both invalidates the attribution comparison and lets arm5a win trivially. Plus 2× arm1↔arm4 promptParityHash mismatch (parity broke on 2 questions at scale; held in the smoke).

**Unexpected (NOT the headline; flag, do not over-claim):** arm2 (governed single-session reuse) shows **+38.89pp correctness over arm1** (b=9 c=2, NI=true), with heavy reuse (callable 85/90, learnedInterfaceCalls=138). This CONTRADICTS the pre-registered single-session correctness null (§3 predicted ~0). It may be a real governed-reuse correctness benefit OR a confound (arm1's wipe-between-questions inline-rewrite is a weak baseline at 32%). Either way it is the cross-SESSION (arm4) claim that is the headline, and that failed. Report arm2's delta as a surprising secondary observation needing its own clean test, not a win.

**VERDICT:** this run is NOT a valid confirmatory result — it violates its own pre-registered invariants (R4 new-argument, R2 parity) and the cross-session arm is broken. It is an informative FAILED run. No headline number can be claimed from it. Concede plainly.

### BLOCKED — two fixes required before a valid confirmatory run (needs user)

**Blocker A (substrate bug, runner-logic):** arm4 two-phase path collapses phase-1 correctness (10% vs arm2 77% on identical levels). Must root-cause the two-phase fresh-process / frozen-lib / phase-2 path. This requires editing `src/eval/skillcraftFullDatafetch.ts` two-phase logic — which the Goal says not to churn during Phase 1, so it needs the user's explicit OK (the metric/preseed work is committed and unaffected).

**Blocker B (experiment design):** the phase-1/phase-2 held-out split (`LEARN_FROM_LEVELS` e1..m2 / h1) does NOT make h1 new-argument for these families → memoization (arm5a) trivially wins and R4 is violated. Need either families where h1 is genuinely new-argument, or a different held-out construction that guarantees novelty (the R4 assertion is the canary).

**Input that would unlock progress:** (1) OK to debug/fix the arm4 two-phase runner (Blocker A); (2) guidance on the held-out/family design so phase-2 is provably new-argument (Blocker B). Until both hold, re-running k≥5 will keep producing clean-fail + invariant-violation results.

---

## 2026-06-03 — Attempt 7: Blocker A ROOT-CAUSED + FIXED + verified (arm4 warm path now fires)

**Root cause (confirmed from artifacts):** `renderSharedParityPrompt` used a phase-blind, hardcoded placeholder `helperName = "familyFanout"` and gave arm4 the binding "CALL `df.lib.familyFanout(...)` (already listed in df.d.ts)" in BOTH phases. `familyFanout` is never in df.d.ts (seed is `per_entity`; crystallised helper is `toolFanout`). 48/69 arm4 answer.ts files literally did `await (df.lib as any).familyFanout({...})` → runtime "not a function" → arm4 phase-1 failed (~9%), built nothing, phase-2 had nothing to reuse.

**Fix (commit pending):** made the arm4 binding PHASE-AWARE (`src/eval/sacArms.ts` + `renderSharedParityPrompt`): phase-1 = BUILD via the real `df.lib.per_entity` seed (no call to a non-existent name); phase-2 = call the ACTUALLY-hydrated learned helper (the non-seed entry in `availableLibFunctions`, e.g. `toolFanout`), fallback to `per_entity`; both bindings add "Never call a `df.lib.*` name not listed in df.d.ts." Threaded `phase` into `renderSacPromptForArm`/`renderSharedParityPrompt`. Binding is masked in the parity hash, so this does not change the parity-hash contract. `pnpm typecheck` exit 0; `pnpm test:unit` 405/405.

**Verification smoke (arm1+arm4 × cat-facts-collector × 1 seed):**
- `df.lib.familyFanout` calls = **0** (was 48). arm4 routes through `per_entity` (11 calls).
- arm4 phase-1 pass = **5/5 (100%)** (was ~9%); every level callable, lic=1.
- Crystallisation FIRED + froze a REAL helper: `phase1-frozen/cat-facts-collector/toolFanout.ts` + `__intent__/toolFanout.ts` (was empty).
- arm4 phase-2/h1 hydrated + **called `df.lib.toolFanout`** (callable=1, lic=1) — the cross-session warm path mechanically fires. (It failed the h1 ANSWER, pass=0; single-seed correctness/noise, not the mechanism. arm1 also 0/6 on this single seed — noise; arm1 was 32% at k=5.)

**Blocker A: RESOLVED.** The arm4 two-phase correctness collapse is fixed and the warm path reuses the crystallised helper.

**NEW Blocker C surfaced (predicted, now dominant):** all 4 invariant violations are `arm1.promptParityHash !== arm4.promptParityHash` at e3/m1/m2/h1 — i.e. exactly the levels AFTER arm4 crystallised toolFanout (e1/e2 held). The parity-prompt BODY embeds `df.d.ts` (`compactBriefDfDts`), which now lists arm4's learned `df.lib.toolFanout`, diverging from arm1's (no learned helper). Fixing Blocker A (arm4 now reliably crystallises) is what surfaced it on every post-crystallisation level. FIX: mask/normalise the learned `df.lib.*` section of `df.d.ts` in the parity body so arm1/arm4 bodies stay byte-identical regardless of hydration (the comment at renderSharedParityPrompt already CLAIMS body-independence from hydrated state; it just isn't enforced for the df.d.ts surface).

**Remaining for a valid confirmatory run:** Blocker C (parity-body, contained runner fix) + Blocker B (held-out h1 not new-argument → arm5a memoization cache-hits; experiment-design). Then re-run k≥5.

---

## 2026-06-03 — Attempt 8: Blocker C FIXED + verified (parity holds with hydration; warm path works end-to-end)

**Fix (commit pending):** `maskLearnedLibForParity()` in the runner replaces the whole `lib: { ... }` block of the embedded df.d.ts with a fixed canonical view in the PARITY body only (renderSharedParityPrompt line ~3043; `compactBriefDfDts` itself unchanged so the non-parity renderers at :4122/:4196 are unaffected). The agent still reads the REAL workspace df.d.ts + the binding names the helper. `renderInitialWorkspaceContext` confirmed parity-safe (root .json only, not lib/). `pnpm typecheck` 0; `pnpm test:unit` green.

**Verification smoke (arm1+arm4 × cat-facts-collector × 1 seed):**
- `invariants: ALL HELD` — **0 violations, 0 parity-hash mismatches** (was 4/6 parity breaks). And arm4 STILL crystallised `toolFanout` (frozen `phase1-frozen/cat-facts-collector/toolFanout.ts`), so parity held WITH hydration — the meaningful case.
- **arm4 pass = 6/6 (100%)**, including **phase2-reuse/h1: passed + reused** (callable=1, lic=1, called `df.lib.toolFanout`). The cross-session warm path fired correctly end-to-end on this seed (prior smoke's phase-2 h1 had failed the answer — single-seed variance, but it CAN succeed now).

**Blockers A + C: RESOLVED + verified.** The arm4 two-phase warm path now: builds (phase-1 100%), crystallises + freezes a real helper, hydrates it in a fresh phase-2 process, reuses it, and keeps arm1↔arm4 parity intact.

**Only Blocker B remains** before a valid k≥5 confirmatory run: held-out h1 is not new-argument for these families → the arm5a memoization floor cache-hits it (R4). Investigating the SkillCraft level/entity structure next to find families/splits where h1 entities are disjoint from e1..m2.
