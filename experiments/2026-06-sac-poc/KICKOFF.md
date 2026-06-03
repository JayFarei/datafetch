# RESEARCH-PROGRAM KICKOFF — Datafetch Thesis (corpus-per-claim, verifier-gated)

Generated from the four per-claim tracks (C5, C8, C4, C2) and their gate verdicts. Every gate `mustFix` is folded into the recommendations below. Governing inversion carried in verbatim: **the cheapest experiment that can say NO comes first, and saying NO (`claimUpheld=false`) is a terminal PASS.** Positioning is always vs the ephemeral re-derivation regime, never a literal Search-as-Code head-to-head; the single-session correctness null (C9) is conceded up front.

HEAD `72b32b1bf` · working tree **DIRTY** (untracked `runs/`, `experiments/reports/`, `experiments/2026-06-sac-poc/wf-claim-tracks.mjs`, `kb/br/18`, `kb/br/19`) · every `--live` launch is **correctly refused** by the (unbuilt) dirty-tree gate until the emitter exists and the tree is committed/stashed. This is intended P1 behaviour, not a blocker on authoring.

---

## 1. Status board (one screen)

| Claim · goal | Corpus | $0 falsifier — result | Gate verdict | Terminal-branch coverage |
|---|---|---|---|---|
| **C5** — deep+invocable helper lowers **agent TURNS** (`llmCalls`) on serial-dep pokedex DAG vs Arm 1 inline, NI correctness | SkillCraft `pokeapi-pokedex` h1x (5 NEW-ARG entities × 5 endpoints, R4-disjoint) | **PROJECTED-TURNS, EXECUTED NOW** against realised `confirm-k5-pokeapi-h1x`. Anchors: arm1 inline `llmCalls`=4.6 / `toolCalls`=17.2 / 4-of-5; shallow-warm `llmCalls`=6.4 / `toolCalls`=2.2 / 2-of-5. Deep-helper projection → ~2-3 turns, **DOABLE-PROMISING, NOT proven** (deep helper exists in no realised run). **needs-live.** Shallow-warm already realised the fail branch (6.4 > 4.6). | **APPROVE** — no outcome-direction leak, no dead-lever leak (`toolCalls` demoted to secondary) | 7/7 mapped. Re-fires only BRANCH 4 (preseed helper + build emitter + scorer `llmCalls` path + commit tree). |
| **C8** — persistence-as-**abstraction** (Arm 2 `df.lib`) beats persistence-as-**transcript** (Arm T raw-trajectory) at **equal context budget B** | SkillCraft (home corpus is an asset here — reuse density wanted) | **Static design audit, EXECUTED via reading. CLEARED (design-level).** 5/5 checks pass: Arm 2 exists single-phase; **Arm T ABSENT (must author)**; budget knob has a real home (`renderSharedParityPrompt` assemble + mask + `approxTokenCount`); `TrajectoryRecord`s captured/re-readable; `effectiveModelContextTokens` emitted. Equal-budget RESULT **needs-live**. | **APPROVE** — symmetric falsifier real; cost co-primary does NOT reduce to dead fan-out lever (transcript comparator, equal B, same single-Q turn structure) | 10/10 mapped. PAUSED-USER-GATED explicitly UNAVAILABLE (corpus settled, no reserved-decision ID). Re-fires only IN-PROGRESS (author Arm T). |
| **C4** — governance-under-staleness: governed Arm 2 **Truthfulness** (Acc − HallucRate on −1 cells) vs ungoverned-persistent Arm 3, NI valid-reuse | CRAG (tri-state +1/0/−1; binary SkillCraft cannot represent the hallucination penalty) | **A0 drift-injector probe — DESIGN/PROJECTED, NOT executed** (injector fn not built; it IS the A0 build item). Strong projection from the live static `sourceDriftFixture` (PASSing in 4/4): supra-1%-FAC drift → gate DECLINES + emits stale value; sub-tolerance → PROMOTES. **needs-build-then-execute ($0, in-env).** | **APPROVE** — endpoint is Truthfulness not cost ("governance is cheaper" forbidden); CRAG correctly required | 10/10 mapped. A0 can **KILL C4 for $0** if the gate is drift-insensitive or false-accepts a supra-tolerance clone. |
| **C2** — zero-src onboarding **sufficiency**: fresh DB corpus, zero src/ edits outside `src/eval`, onboarded-no-learning arm NI vs Arm 1 | Fresh DB-shaped (row-native); **NOT** SkillCraft (home corpus proves no generality) | **B0 floor probe — partly EXECUTED NOW.** Mechanism PROVEN (C1 test, public APIs); `answerEquals` REAL/dataset-neutral; **HF Viewer reachable (HTTP 200)** → row-native HF DOABLE; **BIRD mirror ships supervision-pairs not executable rows** + Spider/wikisql 404 → BIRD/Spider rows BLOCKED-ENVIRONMENTAL; CRAG-finance SQLite on-disk but saturated. Model B0 trace **needs-live.** | **APPROVE** — endpoint is exact-match SUFFICIENCY not cost/turns; armOnb genuinely net-new (arm2 = crystallisation) | 10/10 mapped. B0 can **KILL C2 for $0** (src/ edit / missing collection / ungradeable df.db query). |

**Shared status:** the **sealed run-manifest emitter does not exist** (grep-clean across `run-sac-poc.sh` + `skillcraftFullDatafetch.ts`). Until built, P1/P2/P3-clean-tree are correctly typed BLOCKED-DOABLE for **all four** live rungs — none is asserted-checkable today.

---

## 2. Execution order — cheapest-decisive-first across all four goals

Ordered by `(can-it-say-NO-for-$0) → (does-it-unblock-the-most) → (wall-clock)`. $0 reasoning/probe work runs in parallel across tracks; live runs are serial within a track and gated.

**STEP 0 — `M0` SHARED, $0, BLOCKING ALL LIVE RUNS: build the sealed run-manifest emitter.**
The single substrate prerequisite shared by all four claims (C5 BRANCH 4, C8 IN-PROGRESS, C4 M0, C2 §A). `run-sac-poc.sh` emits the manifest BEFORE the seed loop with `prereg_sha + config_hash + runner_sha + scorer_sha + normalizer_sha + arms_module_sha + seed_list + dirty_tree=false`, and **REFUSES to launch (exit 3) on non-empty `git status --porcelain`.** `config_hash` single-sourced through `armConfig`+`stableStringify` via a `seal-manifest.ts` helper. **Why first:** no live rung is verifiable without it, and it is $0. Commit/stash the dirty tree as part of this step so the gate stops refusing.

**STEP 1 — `C5` projected-turns: ALREADY EXECUTED. Read the signal NOW (no live spend).**
The C5 $0 PROJECTED-TURNS falsifier has been run against realised `confirm-k5-pokeapi-h1x`. **It does NOT give a clean clear OR a clean kill — it gives a DOABLE-PROMISING-but-unproven projection with a concretely-reachable fail condition.** The honest read:
- The deep+invocable helper **does not exist in any realised run** (observer hardwires SHALLOW `lib.toolFanout` at `author.ts:1121/1169/1210`), so the projected ~2-3-turn warm path is a **design projection, not a measurement.**
- The **shallow-warm arm already realised the C5 fail branch** (`llmCalls` 6.4 > arm1 4.6): absorbing API calls into `df.lib` did NOT reduce agent turns, and the frontier agent already batches the 5 entities in one inline `Promise.all` (the DAG is ~2-level-deep and fan-out-wide, not serial-deep).
- **Therefore C5's $0 probe neither clears nor kills — it sizes the gap and names the reachable fail.** The cheapest next thing C5 can do is NOT another $0 probe; it is the deep-helper preseed build (BRANCH 4). Because the projected turn win is small (~1-2 turns) and rides entirely on eliminating inline authoring turns, **C5 is the weakest-but-cheapest live falsifier and is correctly sequenced AFTER the two $0 build-and-execute kill-gates below.**

**STEP 2 — `C4 A0` drift-injector probe: build it ($0, in-env), then EXECUTE it. Highest-value kill-gate.**
A0 is a pure additive transformation over the existing frozen gate — no LLM, no Mongo, no corpus acquisition, buildable and testable today. It can **kill C4 for $0** (gate drift-insensitive, or false-accepts a supra-tolerance stale clone). C4 is the highest-value-if-true lever and the one with a genuinely-not-yet-run $0 falsifier, so it earns the first build slot.

**STEP 3 — `C2 B0` model-trace floor probe: run it ($0* model spend) on a chosen row-native corpus. Second kill-gate.**
B0 can **kill C2 for $0** (any of: src/ edit outside `src/eval`, missing collection, ungradeable `df.db` query on 3-4 hard golds). Gated on the corpus-identity decision (PAUSED-USER-GATED) and on a row-native corpus that returns real Viewer rows. Runs in parallel with C4 A0 (orthogonal tracks; an environmental block on one does not stall the other).

**STEP 4 — author the net-new arms in parallel ($0 build): Arm T (C8), armOnb (C2).** Both forced by the `never` exhaustiveness check (4 edits each) + the divergence-trap copy in `score-cross-arm.ts`. C8's Arm 2/Arm 3 already exist; C4's Arm 3 confirmed present (`sacArms.ts:126-140`, `governanceGate:false`).

**STEP 5 — live rungs, serial within each track, each behind its $0 clear + materialised preconditions + sealed manifest:** C4 A1 pilot → A2 powered; C2 B1 pilot → B2 powered; C8 pilot → powered; **C5 deep-warm live last** (preseed materialised + emitter built + scorer `llmCalls` path added + tree clean).

> Why C5's probe does NOT trigger a live run by itself: its projected delta is unproven and small, and the deep helper must be preseeded first. C5 stays IN-PROGRESS (BRANCH 4) until the four named actions land; it does not skip the queue ahead of the two $0 kill-gates (A0, B0) that can terminate their claims for free.

---

## 3. Consolidated BUILD-SPEC backlog (all marked DOABLE)

| # | Build task | Effort | Unblocks | Status |
|---|---|---|---|---|
| **B-1** | **Sealed run-manifest emitter** in `run-sac-poc.sh` — write `run-manifest.json` atomically before the seed loop (`prereg_sha/config_hash/runner_sha/scorer_sha/normalizer_sha/arms_module_sha/seed_list/dirty_tree=false/git_head`); **exit 3 on dirty tree**. Single-source `config_hash` via `seal-manifest.ts` (`pnpm tsx`, imports `armConfig`+`stableStringify`). Stamp `configHash`+`runnerSha` (self-hash)+`manifestPath` into each `run-info.json` (`skillcraftFullDatafetch.ts` ~L446/477). | Short-Medium | **ALL FOUR** (shared M0) | **DOABLE** |
| **B-2** | **Drift injector** `eval/skillcraft/probes/driftInjector.ts`: pure `injectDrift({originating, helperSource, driftMode, magnitude})` + `runDriftSweep(base, magnitudes[])` over the EXISTING frozen gate (read-only, no substrate change). Refactor `sourceDriftFixture` to delegate to `injectDrift(...,'multiplier',1.75)` (regression-lock). Fold a `drift` section into `run-governance-probes.ts` → 5/5. Add `tests/sac-drift-injector.test.ts` (staleGold=1000/driftedGold=1750 decline; sub-tolerance promote; determinism). | Short ($0, in-env) | **C4 A0** (the kill-gate) | **DOABLE** |
| **B-3** | **Onboarded-no-learning arm `armOnb`** in `sacArms.ts` (union/`SAC_ARMS`/`SacArmId`/`armConfig` — `never` check forces all 4): `interfaceMode:"legacy"`, `learningEnabled:false`, `governanceGate:null`, `phases:1`, `withholdTools:false`, `wipeLibBetweenQuestions:false`. Add to `score-cross-arm.ts:75-76` copy (else rows drop at `if(!arm) continue`). Add `armOnb`↔arm1 paired NI scorer path (McNemar b/c/b+c + clustered CI) — net-new. Add to `run-sac-poc.sh:122` single-phase branch. | Short-Medium | **C2** | **DOABLE** |
| **B-4** | **Arm T (raw-transcript) + equal-budget machinery** in `sacArms.ts` (`armT`: `interfaceMode:"hooks-candidate-only"`, `learningEnabled:false`, `governanceGate:null`, `phases:1` — NO callable `df.lib`) + `truncateTrajectoriesToBudget` (recency-order whole-trajectory fill then token-boundary truncate) + `renderArmTPrompt` reusing `renderSharedParityPrompt` assemble with a masked `## prior trajectories (raw)` slot. Thread captured `TrajectoryRecord`s in. Emit `injectedContextTokensArm2(=B)`, `injectedContextTokensArmT`, `budgetMatchDelta`, `parityMaskedBodyHash`, `armTInjectedNonEmpty`, `arm2LearnedInterfaceCalls`. Add `arm2`↔`armT` paired scorer (McNemar + Wilcoxon-cost-at-matched-correctness + `budgetMatchDelta` recompute). **Prefer deterministic-from-signature B** (avoids arm-ordering dependency). | Medium | **C8** | **DOABLE** |
| **B-5** | **Deep-helper preseed for C5**: pre-place the ceiling-probe `lib_pokedexEntries.ts` (typed `{ids}→PokedexEntry[]`) into phase-2 `lib/` (`resolveSacLibCacheDir`) BEFORE phase-2 launch — **PRESEED, not crystallise** (observer only emits shallow `toolFanout`). Additive runner hook in `skillcraftFullDatafetch.ts`. Testable: phase-2 emits `libFunctionsAvailable>=1`, `helperCallable=true`, name resolves to `pokedexEntries`. | Short-Medium (additive) | **C5** | **DOABLE** |
| **B-6** | **C5 scorer TURNS path** in `score-cross-arm.ts`: add clustered-by-question paired `mean(arm4_warm.llmCalls − arm1.llmCalls)` + bootstrap CI, distinct from the existing `toolCalls` path (scorer currently has **zero `llmCalls` references**). Assert `llmCalls` non-null on every C5 row at emit time (`skillcraftFullDatafetch.ts:446-477`). **P3 trust boundary (gate mustFix): re-derive `llmCalls` from raw SDK usage on a sampled subset — do NOT trust `episode.llmCalls`.** Testable: re-score reproduces arm1 4.6 / shallow-warm 6.4 before any new run. | Short | **C5** | **DOABLE** |

---

## 4. Typed blockers needing the user / environment

### PAUSED-USER-GATED (surface ONE question each; then idle, do NOT re-fire)

| Blocker | Track | Question | Notes |
|---|---|---|---|
| **CRAG corpus IDENTITY** | C4 | CRAG-db-slice (in the `crag-harness` worktree) **vs** acquire a BIRD/Spider-shaped alternative? | The **only** legitimately user-gated C4 input. Everything downstream (acquisition, df.db remap, gold authoring) is DOABLE/ENVIRONMENTAL, not a one-question design choice. |
| **Fresh-DB corpus IDENTITY** | C2 | Which row-native dataset returns real table rows via the HF Viewer? (CRAG-finance is on-disk but **saturated** → fails the r>0 screen; BIRD/Spider rows are not in-env.) | The **single** PAUSED-USER-GATED C2 input. SkillCraft is disqualified (home corpus, proves no generality). |

These two are the **only** PAUSED-USER-GATED items in the whole program. C5 and C8 have **no** enumerated reserved-decision ID (corpora settled = SkillCraft) — PAUSED-USER-GATED is explicitly UNAVAILABLE for them, recorded so the branch is not silently unmapped.

### BLOCKED-ENVIRONMENTAL (record the failing dependency; stop firing that rung; siblings continue)

| Blocker | Track | Detail |
|---|---|---|
| **CRAG tri-state data not in run tree** | C4 | CRAG-db-slice lives in the `crag-harness` worktree; BIRD/Spider not in-env. Acquisition (port data, eval module, MountAdapter, `answerEquals`-gradeable tri-state gold) is a typed acquisition milestone, not a design choice. |
| **BIRD/Spider ROW data not in-env** | C2 | BIRD mirror (`xu3kev/BIRD-SQL-data-train`) ships only supervision pairs `{db_id,question,evidence,SQL,schema}` — NOT executable table rows; row-level SQLite is BIRD's separate **33.4GB GitHub release** (needs fetch+ETL). Spider/wikisql Viewer mirrors 404. A row-native HF substitute is DOABLE; BIRD/Spider rows specifically are BLOCKED-ENVIRONMENTAL. |
| **br17 `df.tool.*` blockers (re-probe required before any tool-only CRAG run)** | C4 | Signature-collapse (every chained shape hashes to `FANOUT(tool)`), one-helper-per-tenant clone fallback, silent name-collision, db-rooted sub-graph extractor returning 0 for tool-only trajectories. br17's own db-probe shows the `df.db.*` remap **REDUCES but does NOT ELIMINATE** this — comparison/multi-hop still collapse to `FANOUT(db)` and need a render-path fix. **Honestly dual-typed: BLOCKED-ENVIRONMENTAL on data + BLOCKED-DOABLE on the remap/render-path substrate work** — NOT cleared by the remap alone. C2 sidesteps this by using `df.db` row-access + `answerEquals` (the blockers bite only tool-only mounts). |

### BLOCKED-DOABLE (substrate, gated behind the relevant $0 clear — listed for completeness, all in the BUILD-SPEC above)
Sealed manifest emitter (B-1, all tracks); Arm T + equal-budget machinery (B-4, C8); deep-helper preseed + scorer TURNS path (B-5/B-6, C5); CRAG `df.db.*` remap + `FANOUT(db)` render-path fix (C4, behind A0 clear + corpus identity). None is BLOCKED-IMPOSSIBLE — no fabrication or hard-constraint break is required by any path.

---

## 5. Honesty check (explicit)

**(a) No goal's completion is conditioned on a positive outcome — confirmed across all four.**
- All four endpoints are frozen as *"we will MEASURE AND REPORT"* with explicit *"we do NOT pre-commit to the direction/sign/NI."*
- All four gate verdicts return **`outcomeDirectionLeak: none`** after an adversarial prose read of progression conditioning.
- Every claim's `claimUpheld=false` maps to **DONE-HONEST-NEGATIVE = terminal PASS** (P5 computed, not read). C5 BRANCH 2 explicitly names the realised shallow-warm result (6.4 > 4.6) as *"a WIN under the verifier."* C8's named falsifier (Arm T matches/beats Arm 2) is itself a PASS. C4 `claimUpheld=false` is a PASS. C2 `NI not established` is a PASS.
- Progression is decoupled and outcome-blind everywhere: C5 powered run gated on *"CI inconclusive within a pre-registered outcome-blind band — NEVER iff turns came out below 4.6"*; C4 A0→A1 on *mechanism-liveness regardless of whether it helps Arm 2*; C8/C2 next rungs on *"observed delta inconclusive within band,"* never *"iff upheld."*
- **Two gate mustFix items are unpinned-constant defects that MUST be frozen before sealing any prereg_sha** (a pre-registration cannot ship an adjudication knob unpinned): **C8 §4/§7 `>X% off-band cells → DONE-INVALIDATED`** must pin X to a concrete number (band tolerance confirmed `|delta|<=0.05`); **C4 A1→A2 b+c inconclusiveness band** must pin a concrete numeric interval. Both are frozen-constant fixes — they do not unmap any branch or leak direction.

**(b) The dead cheap-fan-out lever is NOT re-opened anywhere — confirmed.**
- **C5** headlines `llmCalls` (agent TURNS) and **explicitly DEMOTES `toolCalls` to a secondary descriptor** in §0 and P7, precisely because the realised data shows `toolCalls` is the dead lever (17.2→2.2 collapse while `llmCalls` rose 4.6→6.4). Headlining the `toolCalls` collapse would be the P7 violation; demoting it is the correct fence. C9 conceded; no literal SaC head-to-head; no tier-collapse-as-proof.
- **C8** cost is a SECONDARY co-primary **at matched correctness and equal budget B**, with a **transcript-carrying persistent comparator (Arm T)** — NOT inline re-derivation. Both arms answer the SAME single held-out question with the SAME turn structure, so the **+66k turn-count tax cannot recur**. Gate confirms it does not reduce to the dead lever.
- **C4** endpoint is Truthfulness (avoided hallucinations on −1 cells), NOT cost — P7 prose **explicitly forbids** the *"governance is cheaper"* framing. CRAG is required because binary SkillCraft scoring structurally cannot show the hallucination penalty.
- **C2** has **no token-amortisation claim** (endpoint is exact-match SUFFICIENCY/NI), so the +66k turn-tax cannot recur; single-session-correctness is the conceded NULL, not the value claim.
- All four gate verdicts return **`deadLeverLeak: none`** after adversarial read. The dead lever is fenced as verifier predicate P7, mechanically rejecting any future plan that re-opens it.

**Relevant files (absolute):**
- `/Users/jayfarei/src/tries/2026-05-01-hackathon/experiments/2026-06-sac-poc/RESEARCH-STRATEGY.md` — verifier P1-P7, seven terminal states, the ladder
- `/Users/jayfarei/src/tries/2026-05-01-hackathon/eval/skillcraft/scripts/run-sac-poc.sh` — gains the sealed manifest emitter (B-1)
- `/Users/jayfarei/src/tries/2026-05-01-hackathon/eval/skillcraft/scripts/score-cross-arm.ts` — gains the C5 `llmCalls` TURNS path (B-6) + `armOnb`/`armT` paired scorers (B-3/B-4)
- `/Users/jayfarei/src/tries/2026-05-01-hackathon/src/eval/sacArms.ts` — author `armOnb` (B-3) + `armT` (B-4); Arm 2/Arm 3 confirmed present
- `/Users/jayfarei/src/tries/2026-05-01-hackathon/src/eval/skillcraftFullDatafetch.ts` — manifest stamping (B-1), deep-helper preseed (B-5), Arm T trajectory threading (B-4)
- `/Users/jayfarei/src/tries/2026-05-01-hackathon/src/observer/author.ts` — hardwires SHALLOW `lib.toolFanout` (1121/1169/1210); the C5 deep helper must be PRESEEDED, not crystallised
- `/Users/jayfarei/src/tries/2026-05-01-hackathon/eval/skillcraft/probes/driftInjector.ts` — NEW, the C4 A0 kill-gate (B-2)
- `/Users/jayfarei/src/tries/2026-05-01-hackathon/experiments/2026-06-sac-poc/ceiling-probe/` — the done C5 $0 ceiling probe (Attempt 13)
- `/Users/jayfarei/src/tries/2026-05-01-hackathon/eval/skillcraft/results/sac-poc/confirm-k5-pokeapi-h1x/` — the VALID negative run the C5 projection reads (arm1 4.6 / shallow-warm 6.4)
