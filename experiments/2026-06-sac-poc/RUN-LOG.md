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
