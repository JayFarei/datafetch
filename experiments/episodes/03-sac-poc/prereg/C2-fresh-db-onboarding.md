# PRE-REGISTRATION — Track B / Claim C2: Zero-src onboarding sufficiency on a FRESH DB-shaped corpus

> Instantiated from the §B verifier-predicate template (P1–P7 + branch-coverage gate). Single-phase track (no freeze machinery). Comparator = **Arm 1** (br19 adversarial inline-rewrite bar), NOT an invented hand-tuned prompt. Floor = **Arm 0**. Endpoint = paired NI on answerEquals exact-match. **No pre-commit to NI.** Frozen before any live run; committed; manifest.prereg_sha must equal `git hash-object` of this file.

## 0. Claim (frozen, no outcome direction)
On a FRESH DB-shaped corpus the substrate has never seen, selected because onboarding generality is the point, **we will MEASURE AND REPORT** the paired per-question pass-rate of an `onboarded-no-learning` (`armOnb`) agent vs **Arm 1** (tool-matched inline-rewrite, `wipeLibBetweenQuestions:true`) and **Arm 0** (tools withheld, the non-triviality floor), the McNemar b/c/b+c, and the clustered-by-question 95% CI on the difference. Positioning is vs the ephemeral re-derivation regime, never a literal Search-as-Code head-to-head. The single-session correctness null (C9) is conceded; C2 asserts the zero-src interface *suffices*, not that it *beats* inline.

## 1. Endpoint sentence (frozen verbatim, RESEARCH-STRATEGY §4.1)
"We will report the paired per-question majority-vote pass-rate of the onboarded-no-learning arm and Arm 1, the McNemar b/c/b+c, and the clustered-by-question 95% CI on the difference. NI is claimed iff the CI lower bound > −5pp; otherwise we report 'observed delta X pp, NI not established.' We do not pre-commit to NI." NI is meaningful ONLY on a corpus that passes the r>0 hardness screen (Arm 1 pass-rate materially below ceiling, e.g. <85%).

## 2. Arms
| Arm | Role | interfaceMode | learning | df.db | Notes |
|---|---|---|---|---|---|
| **armOnb** (AUTHOR) | onboarded-no-learning (claim) | `legacy` (full generated df.d.ts) | false | yes | NEW arm; does NOT exist in sacArms.ts today (confirmed: union/array/switch = arm0..arm5b only; arm2 is learningEnabled:true/governanceGate:true = online crystallisation, NOT onboarding) |
| **arm1** | adversarial comparator | `hooks-candidate-only` | false | yes | `wipeLibBetweenQuestions:true`; exists |
| **arm0** | non-triviality floor | `legacy` | false | tools withheld | exists |

R2 prompt-parity is **N/A for the armOnb↔arm1 pair** (declared in P4): armOnb shows the full generated df.d.ts surface, arm1 shows the inline-rewrite candidate-only surface — the prompt bodies differ by design; parity was an arm1↔arm4 construct only.

## 3. Hardness screen (r>0; gates B0→B1)
A live NI tie is only interpretable if Arm 1 is NOT saturated. **Screen:** on the chosen corpus, Arm 1 pass-rate must be materially below ceiling (pre-registered threshold <85%). If Arm 1 ≥ 85% → the corpus is saturated, an NI tie is a saturation artifact → corpus rejected for C2 (re-select identity, USER-GATED) — this is NOT a C2 negative, it is a corpus-screen failure (terminal: re-enter PAUSED-USER-GATED on identity). FinChain is disqualified up front (saturated). This is added to B0's gate.

## 4. B0 — honest floor probe (NOT a biased hand-solve)
**Form (a), preferred — real end-to-end mount smoke:** acquire the row data for the chosen corpus, build the `src/eval/<corpus>/` MountAdapter + identMap + `regenerateManifest`, run **real `df.db` queries against real rows** for 3–4 hard golds, grade with **answerEquals** (confirmed signature: numeric FAC relTol 1e-2 / boolean strict / string normalised / structured canonical deep-eq). This closes the exact gap the synthetic `tests/sac-zero-src-onboarding.test.ts` leaves open (that test mounts a synthetic in-memory `widely-2026` fixture with NO real rows, NO df.db execution, NO answerEquals grading).
**Reachable fail condition (pre-registered):** if the onboarded agent cannot mechanically reach the surface — i.e. ≥1 of the 3–4 golds is unanswerable because (i) onboarding required a src/ edit outside src/eval (`git diff --stat src/ ':!src/eval'` non-empty), OR (ii) the generated df.d.ts is missing the queried collection, OR (iii) a real df.db query throws/returns shape answerEquals cannot grade — then **B0 FAILS → C2 DONE-HONEST-NEGATIVE for $0** (the surface is insufficient, killed for free). A B0 clear is **necessary-not-sufficient**; it never alone licenses spend. **Explicitly forbidden:** a no-model human hand-solve by the gold author (structurally biased to clear; cannot honestly kill a claim about MODEL behaviour).

## 5. B1 PILOT (k=5, ~12Q, single-phase) — NO NI verdict
Only pre-registered output = realised p_d / b / c / b+c + same-arm noise floor, used to size B2 (n = 7.849·p_d/δ²). **Forbidden from emitting an NI verdict** (n≈12 cannot establish NI on a predicted ~0 effect; b+c likely <6, exact test structurally cannot conclude). Always report realised b, c, b+c regardless.

## 6. B2 powered run (only if decision-relevant) — paired NI
Sized from B1's p_d. Primary = rule-based answerEquals exact-match lower bound; judge-augmented upper bound (two judges, different families, Cohen weighted κ≥0.80); BH-FDR q=0.05 across slices; upweight hard cells (multi-hop, set/aggregation). McNemar mid-p when b+c<25, clustered by question across seeds. **NI iff CI lower > −5pp. No pre-commit.**

## 7. P1–P7 verifier checklist (must be checkable from committed artifacts BEFORE the live run)
- **P1 PRE-REG-FROZEN:** this file committed; manifest.prereg_sha == git hash-object(this file); commit-timestamp precedes earliest artifact mtime; manifest.dirty_tree == false (wrapper exit-3 on dirty tree guarantees it — CONFIRMED the tree is dirty today: untracked `runs/`, `experiments/reports/`, `kb/br/18`, `kb/br/19`, `wf-claim-tracks.mjs` → a `--live` launch is correctly refused until committed/stashed).
- **P2 RUN-CANONICAL:** `${OUT_ROOT}/run-manifest.json` written by the wrapper BEFORE the seed loop; carries seed_list (|seeds|≥k≥5), model_id, config_hash, scorer_sha, normalizer_sha, runner_sha, arms_module_sha, drop_reasons[]; every sealed (arm,seed,phase=single) has results.json; NO extra artifact dirs; every run-info.json .configHash == manifest.config_hash and .model == manifest.model_id; every actual drop pre-registered in drop_reasons. (The emitter is the §A deliverable — MISSING today → typed BLOCKED-DOABLE, see buildSpec.)
- **P3 ENDPOINT-RECOMPUTED:** verifier re-runs `score-cross-arm.ts` from raw artifacts and reproduces every headline number (pass-rates, b/c/b+c, CI, NI delta); manifest pins scorer_sha + normalizer_sha; SAMPLED subset re-derives officialPassed from raw answer.ts + gold via answerEquals (NOT trusting episode.officialPassed) and re-derives the token ledger from SDK raw usage (NOT episode self-report); every headline number resolves to a file:line / JSON-pointer.
- **P4 INVARIANTS-CLASSIFIED:** claim→invariant map committed pre-run. **R4 (new-argument-held-out) = N/A** (single-phase, no held-out phase-2). **R2 (prompt-parity) = N/A for armOnb↔arm1** (bodies differ by design — declared, not assumed). No void-on-violation invariant gates the headline's sign (none needed here; there is no orthogonal attribution sub-claim).
- **P5 VERDICT-DETERMINISTIC:** claimUpheld := endpoint_pass AND NI_pass AND all_primary_invariants_hold AND gates_green; the report's stated claimUpheld must EQUAL the computed value; claimUpheld=false is recorded as DONE-HONEST-NEGATIVE = PASS.
- **P6 GATES-GREEN:** pnpm typecheck 0; pnpm test 0 (incl. the existing C1 mechanism test + the new B0 end-to-end smoke); governance probes pass; scorer-determinism probe (same artifacts → same score twice).
- **P7 REGIME-GUARD:** C2's endpoint is exact-match correctness SUFFICIENCY (NI), NOT any dead lever — it does NOT reduce to {cheap-fan-out cost; shallow-helper cost; single-session-correctness-as-PRIMARY-value (conceded null, not the value claim); literal-SaC head-to-head; tier-collapse-as-proof}. The +66k turn-tax cannot recur because there is NO token-amortisation claim. Adversarial-agent read confirms no dead lever via prose.

## 8. Branch coverage — EVERY result branch maps to a terminal state
1. B0 fails (surface insufficient: src/ edit needed OR missing collection OR ungradeable df.db query) → **C2 DONE-HONEST-NEGATIVE** ($0).
2. B0 clears AND hardness screen fails (Arm 1 ≥ 85%, saturated) → corpus rejected; **PAUSED-USER-GATED** on corpus identity (re-select; NOT a C2 negative).
3. B0 clears AND hardness screen passes → B1 PILOT runs → realised p_d sizes B2 (decision-relevant iff observed delta inconclusive within [−5pp, +∞]). B1 itself emits **no verdict** (forbidden); its terminal handoff is "B2 sized" or **DONE-INVALIDATED** if a B1 PRIMARY invariant fails.
4. B2 runs, NI CI lower > −5pp → **DONE-POSITIVE**.
5. B2 runs, NI CI lower ≤ −5pp → **DONE-HONEST-NEGATIVE** ("observed delta X pp, NI not established").
6. B2 runs, a PRIMARY invariant fails → **DONE-INVALIDATED**.
7. armOnb authoring / manifest emitter not yet built → **IN-PROGRESS** (named action: author armOnb + the §A emitter; see buildSpec) — the ONLY re-firing state.
8. Row data for the chosen corpus not acquirable in-env (BIRD/Spider 33.4GB GitHub release not fetched, no row-native HF substitute) → **BLOCKED-ENVIRONMENTAL** (record failing dependency; does NOT stall Track A).
9. Corpus identity unspecified → **PAUSED-USER-GATED** (one question, idle).

**Progression is NOT conditioned on outcome direction anywhere (incl. prose):** B2 runs iff B1 reached a terminal handoff AND B2 is decision-relevant under the pre-registered outcome-blind predicate ("B1's observed delta is inconclusive within [−5pp, +∞]") — NEVER "iff the claim was upheld." A DONE-HONEST-NEGATIVE at B0 or B2 terminates the C2 ladder; the program does not owe a next rung.

## 9. Honesty guardrails carried in
Concede C9 single-session null up front. Disclose any easier-corpus choice as legitimate for an existence/sufficiency proof and disqualifying only for a generality claim (not made). Any seed/family drop pre-registered + manifest-recorded before the run. Recompute every headline number from raw; trust boundary upstream of the scorer (normalizer + episode emitter). Report realised b, c, b+c, CIs, same-arm noise floor.
