# PRE-REGISTRATION — Track C8: persistence-as-abstraction beats persistence-as-transcript (SkillCraft)

## 0. Status of the contrast arm (confirmed by reading sacArms.ts)

- **Arm 2 EXISTS** (`src/eval/sacArms.ts:113-125`): `interfaceMode:"hooks-draft"`, `learningEnabled:true`, `governanceGate:true`, `resultsCache:false`, `recipeHint:false`, `phases:1`, `wipeLibBetweenQuestions:false`. It is the online-crystallisation arm: across the single-phase build levels it observes -> gates -> crystallises a `df.lib.*` helper, then answers the held-out REUSE_LEVEL question by CALLING that persisted abstraction.
- **Arm T DOES NOT EXIST.** Grep of `src/eval/` + `eval/skillcraft/scripts/` for `armT|arm_t|history-injection|priorTrajectory|transcript-inject` returns nothing. The `SacArm` union (`sacArms.ts:26-33`) and `SAC_ARMS` (35-43) are exactly `{arm0,arm1,arm2,arm3,arm4,arm5a,arm5b}`. **Arm T must be AUTHORED.** This pre-reg's live run is BLOCKED-DOABLE until it is.
- br19 corroborates the gap: it names the SkillFlow "history-injection" control (51.04% raw-context vs 71.08% skills-evolve, Opus 4.6) as "the cleanest published evidence that persistence-as-abstraction beats persistence-as-transcript" and notes (line 9 of RESEARCH-STRATEGY, br19) that **the prior 7-arm ladder never included it.** C8 ports that control to datafetch.

## 1. Claim, regime, endpoint (NO outcome direction)

- **Claim:** persistence-as-abstraction (Arm 2 df.lib) beats persistence-as-transcript (Arm T raw injection) at EQUAL context budget.
- **Regime:** cross-question reuse within a single SkillCraft process; high reuse density; frontier model; SkillCraft fan-out families.
- **Primary endpoint (frozen, outcome-blind):** "We will measure and report, on the held-out REUSE_LEVEL question, (i) the paired per-question pass-rate of Arm 2 and Arm T and the McNemar b/c/b+c with the clustered-by-question 95% CI on the difference; and (ii) the paired model-context cost (`effectiveModelContextTokens`, full-weight cached, `sacArms.ts:376`) with the Wilcoxon signed-rank test on the per-question cost difference and the dollar-equivalent sensitivity row (`modelContextCostAtCachedWeight`, cachedWeight~=0.1). We do not pre-commit to a direction."
- **Co-primary stats:** McNemar (mid-p when b+c<25, clustered by question across seeds) on correctness; Wilcoxon signed-rank on cost. k>=5; report realised b, c, b+c, CIs, and the same-arm noise floor in every table.

## 2. The equal-context-budget mechanics (the design deliverable)

The whole claim is meaningless unless the two arms are matched on injected context BYTES, because otherwise an Arm-2 win could be "the abstraction is smaller, so the model had more room" and an Arm-T win could be "raw transcript carried more signal." We isolate ABSTRACTION from MERE CONTEXT by holding the injected-context model-token budget equal at the held-out question.

### 2.1 What each arm injects at the held-out REUSE_LEVEL question

- **Arm 2:** the held-out prompt carries the learned `df.lib.<helper>` listed in `df.d.ts` (the compact callable signature, ~tens of tokens) PLUS the standard task body. The prior fan-out work is carried as a COMPRESSED, GOVERNED abstraction — a callable name + signature.
- **Arm T:** the held-out prompt carries the SAME standard task body PLUS the RAW prior-question trajectories (the `TrajectoryRecord`s the runner already captures, `skillcraftFullDatafetch.ts:1071,1137-1154`) injected verbatim as text. NO callable helper; NO `df.lib` entry. The prior fan-out work is carried as a TRANSCRIPT.

### 2.2 The budget-match knob (where it lives, exactly)

The shared parity renderer (`renderSharedParityPrompt`, `skillcraftFullDatafetch.ts:2990`) assembles the prompt via `assemble(bindingLine)` (line 3009), with the binding region masked to a sentinel for `parityFloorTokens = approxTokenCount(masked body)` (`sacArms.ts:435`). Arm T is authored to render through the SAME assembler with a new injection slot ("## prior trajectories (raw)") placed adjacent to the binding region. **The budget-match operates as follows:**

1. Define `B = injected_context_token_budget` = the model-context tokens of Arm 2's held-out prompt MINUS the arm-invariant parity-masked body (i.e. exactly Arm 2's abstraction-carrying delta over the shared body). This is computed per `(seed, question)` from Arm 2's realised prompt using the SAME `approxTokenCount` counter both arms use (consistent-not-exact is sufficient because it cancels in the paired diff; `sacArms.ts:430-434`).
2. **Arm T fills its raw-trajectory slot to MATCH B**, by selecting/truncating the prior trajectory text to `approxTokenCount(injected) ~= B` within a pre-registered tolerance band (|delta| <= 5% of B, recorded per question). Truncation rule (frozen): include whole prior-question trajectories most-recent-first until adding the next would exceed B; then truncate the final included trajectory at a token boundary. NO cherry-picking by relevance (that would re-import a confound) — strictly recency order.
3. Both arms therefore present an IDENTICAL parity-masked body (the R2 floor) and an EQUAL injected-context budget B; the ONLY difference is FORM: governed-callable-abstraction vs raw-transcript. That is the abstraction-vs-context isolation.

### 2.3 Budget-match audit (recorded per question, recomputed by the verifier)

Each held-out episode emits: `injectedContextTokensArm2 = B`, `injectedContextTokensArmT`, `budgetMatchDelta = |ArmT - B| / B`, and the parity-masked body hash (must equal across the pair). The verifier (P3) recomputes B from the raw prompts and asserts `budgetMatchDelta <= 0.05` for every paired question. **A pair exceeding the band is a void-on-violation cell (DONE-INVALIDATED-eligible) ONLY because budget-mismatch is ORTHOGONAL to the headline direction** — a mismatch makes the pair uninterpretable in EITHER direction, so it cannot launder a refutation (satisfies P4).

### 2.4 Two budget-direction variants (both pre-registered, both terminal)

Because B is defined FROM Arm 2's abstraction size, the natural match has Arm T padded UP to B with raw transcript. We ALSO pre-register the inverse sanity variant where the budget is set to Arm T's natural full-transcript size and Arm 2 is padded with inert filler to match — to confirm an Arm-2 win is not an artifact of which arm sets B. Both variants map to terminal states (Section 7); the primary headline is the from-Arm-2 budget; the inverse is a robustness row.

## 3. Confound battery (br19 six)

- **Tool-matching:** both arms see the identical tool surface (neither withholds; `withholdTools:false`).
- **Prompt-parity (R2, PRIMARY):** the parity-masked body is byte-identical across Arm 2 and Arm T (both route through `renderSharedParityPrompt`'s assembler; the injected-context slot + binding line are the ONLY varying regions and are masked to the sentinel for the parity hash). Blind-diff certified; NEVER embed a diverging `df.d.ts` in the parity body (`maskLearnedLibForParity`, line 3043, already masks the learned block). **R2 IS assertable for the Arm2<->ArmT pair** because both carry an injected-context region of equal budget over a shared body — UNLIKE the arm1<->armOnb C2 pair where bodies differ by design.
- **Online-learning leakage:** single-process; Arm 2's crystallisation and Arm T's trajectory capture happen on the SAME build levels, so neither sees future test data. Interleaved seeds (seed-outer loop).
- **Model/version drift:** pinned dated snapshot; `model_id` in the sealed manifest; verifier cross-checks `manifest.model_id == every run-info.json .model`.
- **Train/test contamination:** the held-out REUSE_LEVEL is the new-argument h1 sibling; n-gram audit of held-out vs build levels.
- **Budget-match (the C8-specific confound, PRIMARY here):** Section 2.2 — equal injected-context budget B; `budgetMatchDelta <= 0.05` enforced and recomputed.

## 4. Claim -> invariant dependency map (P4, committed pre-run)

| Invariant | Classification | Gates the headline sign? |
|---|---|---|
| R2 prompt-parity (parity-masked body byte-identical Arm2<->ArmT) | PRIMARY (void-on-violation forbidden) | YES — if violated the contrast is uninterpretable, so it CANNOT be void-on-violation; a violation => DONE-INVALIDATED for the whole run |
| Budget-match band (`budgetMatchDelta<=0.05`) | PRIMARY for interpretability, per-CELL void-on-violation allowed | a single off-band cell is orthogonal (uninterpretable in either direction) -> that cell DONE-INVALIDATED; if >X% of cells off-band, whole run DONE-INVALIDATED |
| Crystallise->reuse fired for Arm 2 (`learnedInterfaceCalls>0`, helper callable) | PRIMARY | YES — if Arm 2 never reused its abstraction, there is no abstraction to test; failure => DONE-INVALIDATED (not honest-negative) |
| Arm T actually injected raw trajectory (non-empty slot, no df.lib entry) | PRIMARY | YES — if Arm T silently got a callable helper, the contrast collapses; failure => DONE-INVALIDATED |

R4 (new-argument-held-out): the REUSE_LEVEL is the held-out h1 sibling, so R4 applies and is PRIMARY for the held-out question's novelty. Adversarial-agent confirms none of the void-on-violation cells (off-band budget cells) can flip the headline's sign — they only remove pairs.

## 5. Verifier predicate (P1-P7) instantiation

- **P1 PRE-REG-FROZEN:** this file committed; `manifest.prereg_sha == git hash-object <this file>`; git-timestamp precedes earliest artifact; `manifest.dirty_tree == false`.
- **P2 RUN-CANONICAL:** `${OUT_ROOT}/run-manifest.json` sealed BEFORE the seed loop; `seed_list` with `|seed_list| >= k >= 5`; `arms == {arm2, armT}` (plus optional arm1 floor); `config_hash`, `scorer_sha`, `normalizer_sha`, `runner_sha`, `arms_module_sha`, `drop_reasons[]` present; an artifact for EVERY sealed `(arm,seed,phase)`; no extra dirs folded in; every `run-info.json .configHash == manifest.config_hash`.
- **P3 ENDPOINT-RECOMPUTED:** verifier RE-RUNS `score-cross-arm.ts` from raw and reproduces the paired pass-rate, b/c/b+c, CI, Wilcoxon cost stat, AND recomputes B + `budgetMatchDelta` per question from the raw prompts. SAMPLED subset: re-derive `officialPassed` from raw `answer.ts` + gold, and the token ledger from raw SDK usage logs (not `episode.effectiveModelContextTokens`). Every headline number resolves to file:line / JSON-pointer.
- **P4 INVARIANTS-CLASSIFIED:** Section 4 map committed; void-on-violation cells (off-band budget) are orthogonal to the headline sign; adversarial-agent confirms.
- **P5 VERDICT-DETERMINISTIC:** `claimUpheld := (abstraction_advantage_pass) AND R2_holds AND budget_band_holds AND crystallise_fired AND armT_injected AND gates_green`, where `abstraction_advantage_pass` is the pre-registered directional read (Arm 2 pass-rate CI-lower > Arm T OR Arm 2 cost Wilcoxon-significantly lower at matched correctness). Report's `claimUpheld` must EQUAL the computed value; `false` is DONE-HONEST-NEGATIVE = PASS.
- **P6 GATES-GREEN:** `pnpm typecheck`==0; `pnpm test`==0; governance probes pass; scorer-determinism probe (same artifacts -> same score twice).
- **P7 REGIME-GUARD:** C8's endpoint is persistence-as-ABSTRACTION-vs-TRANSCRIPT at equal budget, NOT cheap-fan-out cost, NOT shallow-helper cost, NOT single-session-correctness-as-PRIMARY, NOT literal-SaC head-to-head, NOT tier-collapse-as-proof. The cost component is a SECONDARY co-primary at MATCHED correctness and at EQUAL budget — it does not reduce to the dead cheap-fan-out cost lever because the comparator is a transcript-carrying persistent arm, not inline re-derivation, and the budget is held equal (the +66k turn-tax does not apply: both arms answer the SAME single held-out question with the SAME turn structure). Adversarial-agent read confirms no dead lever via prose.

## 6. Decoupled progression (no outcome direction anywhere)

Progression to any powered C8 run is gated on (the pilot reached a terminal state) AND (the powered run is decision-relevant under the outcome-blind predicate "observed paired delta inconclusive within the pre-registered band"), NEVER "iff Arm 2 won." A DONE-HONEST-NEGATIVE (Arm T matches/beats Arm 2 at equal budget) terminates the C8 ladder; the program does not owe a next rung. The $0 falsifier (Section 8, design-level here) precedes the live run.

## 7. Branch coverage (every result branch -> terminal state)

- Arm 2 advantage holds (pass-rate CI-lower > Arm T, or cost Wilcoxon-lower at matched correctness) AND all PRIMARY invariants hold -> **DONE-POSITIVE**.
- Arm T matches/beats Arm 2 at equal budget AND invariants hold -> **DONE-HONEST-NEGATIVE** (= PASS; the gain was context, not governed abstraction — the reachable falsifier fired honestly).
- R2 violated, OR crystallise-never-fired (Arm 2), OR Arm T got a callable helper, OR >X% budget cells off-band -> **DONE-INVALIDATED** (valid run, no interpretable evidence).
- Arm T not yet authored / parity not re-passed / typecheck-test red / manifest emitter absent -> **IN-PROGRESS** (named action: author Arm T per buildSpec; re-pass parity+gates; build the sealed manifest emitter).
- Pinned model or SkillCraft data not in-env -> **BLOCKED-ENVIRONMENTAL** (record dependency; sibling tracks continue).
- A required input would need fabrication AND a recomputable impossibility proof AND a 2nd-agent confirm -> **BLOCKED-IMPOSSIBLE** (escalate once, stop).
- C8 has NO enumerated reserved-decision ID (corpus identity is settled = SkillCraft), so **PAUSED-USER-GATED is unavailable** for this track.

## 8. The $0 falsifier precedes the live run

C8's $0 gate is a hand-built budget-match feasibility + design probe (Section 9 zeroDollarFalsifier; executedNow=false because the equal-budget RESULT needs a live model run). It checks the mechanics are sound (B computable from Arm 2's realised prompt; Arm T's truncation rule lands within the band; both share a parity-masked body) BEFORE any spend. A clear is necessary-not-sufficient.
