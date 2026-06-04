# SaC PoC — Program Assessment (2026-06-04)

HEAD `85315d061` · branch `sac-poc-build` · synthesized from 5 verified dimension assessments (thesis/claims, substrate, eval-harness, methodology, roadmap), each independently adversarially verified at high confidence. Where a verifier's `honestRestatement` corrected the original assessment, the verifier is trusted here.

---

## 1. Executive summary

The program is methodologically sound and intellectually honest, the substrate is a mature prototype, and the headline thesis is empirically **unproven**. The Phase-1 cross-session cost-amortisation claim was run to completion on a valid harness and **falsified** — recompute-reproducible from `confirm-k5-pokeapi-h1x/score.json` (primary break-even M\*=+Infinity, arm4 warm costs more than arm1 inline in every token unit, and arm4 is *less* correct). That negative is correctly treated as a terminal PASS, not a defeat. Since then, substantial `$0` plumbing has landed and is green (typecheck 0, full suite passes, governance probes 4/4 + drift sweep + blind 20/20 clean), and the program pivoted to four corpus-per-claim value tracks (C4 governance-under-staleness, C2 zero-src onboarding, C5 deep-helper TURNS, C8 persistence-as-abstraction). But **no live paired run has produced a verdict for any of the four surviving value claims** — every track is mechanism-proven / endpoint-untested, blocked on the *same* unbuilt seam (a runner that dispatches the new arms/corpora plus a scorer widened past binary pass/fail), and three of four additionally await a user-reserved corpus choice. The honest state: the substrate and the verifier discipline are real assets; the value headline remains entirely to be demonstrated, with a genuine and asymmetric risk of further honest negatives.

---

## 2. What is DONE (housekeeping + build)

### 2.0 Repo reorganization (2026-06-04) — completed housekeeping

The `85315d061` "consolidate all eval under eval/" refactor is committed; working tree is clean except untracked `web/`.

| Boundary | After reorg | Evidence |
|---|---|---|
| `src/` = substrate (shippable client/server/SDK) | `src/eval` no longer exists | `ls -d src/eval` → No such file |
| `eval/` = ALL eval work (harness, tests, seeds, scripts, probes) | `src/eval/*.ts` moved to `eval/harness/*.ts` | `git rev-parse 85315d061`; tree clean but for `?? web/` |
| Experiments organized by episode | this assessment lives under `experiments/episodes/03-sac-poc/` | dir listing |

Caveat (carried as a P0/P1 risk below): the reorg left **stale `src/eval/*` file:line pointers** in several docs and preregs, and a **stale-but-true** evidence string (`grep -v src/eval/` now excludes a deleted directory).

### 2.1 Substrate + harness build (green gates)

| Item | Evidence |
|---|---|
| Full vitest suite green | fresh run: 59 files / **461 tests** pass (see drift note §6) |
| typecheck clean across `src/` + `eval/{harness,tests,seeds}` | `npx tsc --noEmit` exit 0 |
| Phase-2 #3 de-hardcoding **DONE, not blocked** | `src/observer/specializationRegistry.ts`; `grep -rn -E 'finqacases\|rangeTableMetric' src/` empty (exit 1); byte-golden `eval/tests/sac-rangetable-codegen.test.ts`; RUN-LOG Attempt 25 (commits `dd725a1f7`, `20f2b4fe6`). MEMORY note file already RESOLVED-2026-06-03; only the one-line index lags. |
| Phase-2 #4 substrate `df.tool.*` manifest rendering (additive, dataset-neutral) | `src/server/manifest.ts`; `eval/tests/sac-manifest-tool-block.test.ts` (commit `5927bf1eb`) |
| Zero-src onboarding **mechanism** | `eval/tests/sac-zero-src-onboarding.test.ts` (synthetic dataset → full `df.d.ts` via public APIs only) |
| B-1 sealed run-manifest emitter + dirty-tree exit-3 gate | `eval/skillcraft/scripts/seal-manifest.ts`; `run-sac-poc.sh:93-102` (commit `c54a1d7c9`) |
| B-2 drift injector (C4 `$0` kill-gate) **PASSES** | `eval/skillcraft/probes/driftInjector.ts`; `sac-drift-injector.test.ts` 5/5; `run-governance-probes.ts` prints "C4-A0 PASS (gate is drift-sensitive)" — PROMOTE at 0.5%, DECLINE at 4.76%/42.86% (commit `3e89be8dd`) |
| CRAG (C4) **library** pieces: corpus+ETL, tri-state grader, df.db mount, sibling stream | `eval/harness/{cragCorpus,cragGrader,cragMount,cragSiblings}.ts`; `sac-crag-{corpus,mount,siblings}.test.ts` — 3 files / **15 tests** pass (commits `f69d2a0ae`/`2d602b662`/`5bda34983`) |
| Real 5.16GB CRAG `dev_v4` data present in-env | `.claude/worktrees/crag-harness/eval/crag/vendor/raw/crag_task_1_and_2_dev_v4.jsonl` (5,164,388,176 bytes, 2706 rows) |
| 7-arm ladder (arm0..arm5b) wired in SkillCraft runner | `eval/harness/skillcraftFullDatafetch.ts:310/370/416/999/1026` |
| Governance gate runner-integration | `eval/harness/sacArmGovernance.ts`; runner dynamic-imports at promote site (carries not-present-yet fail-safe fallbacks) |
| Phase-1 honest deliverables (no fabrication of the falsified positive) | `PHASE-1-FINDINGS.md`; `figures/cost-frontier.svg`; `DEMO.md` |

### 2.2 The learning loop — what is genuinely end-to-end vs. mode-gated

The observe → gate → crystallise → discover half runs end-to-end (CLI demo learns `rangeTableMetric`; `tests/demo-e2e.test.ts` green). **But** the verifier corrected the original "end-to-end reuse via the shipped CLI" claim:

- Under the **shipped default** (`hooks-candidate-only`, `src/hooks/mode.ts:35`) the **reuse half throws** — `df.lib.rangeTableMetric: hook is observed only (no callable implementation)` — and the gold assertion fails.
- The loop only completes under `DATAFETCH_INTERFACE_MODE=legacy` **and** `DATAFETCH_SKIP_ENV_FILE=1` (a committed `.env` re-injects `ATLAS_URI`). `tests/demo-e2e.test.ts:33` silently hard-sets legacy mode.

So: **learning + crystallisation + discovery is proven end-to-end; reuse-as-callable is proven only in a non-default legacy mode.** There is no green test exercising crystallise→reuse under the shipped default.

---

## 3. What is PROVEN (claim → evidence)

| # | Proven claim | Evidence |
|---|---|---|
| P-1 | **Honesty discipline is genuine, not aspirational.** Negative is a terminal PASS; falsified numbers match prose exactly. | `PHASE-1-FINDINGS.md` reports the pre-registered positive as falsified; `RESEARCH-STRATEGY.md` fences the dead lever; `score.json` M\*=+Inf / -66,520.8 tokens matches the prose |
| P-2 | **Harness is methodologically sound.** 7-arm paired-differencing, prompt-parity gate, two-phase fresh-process freeze, clustered bootstrap CI, McNemar NI, full-weight + dollar ledger. Verifier outcome-neutral: `process.exit(2)` fires ONLY on invariant violations, never on outcome sign. | `score-cross-arm.ts:711-716`, `:865-866`, `:921`; `sacArms.ts:284-323` |
| P-3 | **The headline negative is recompute-reproducible from raw artifacts** (not trusted from a report). Independent re-run of `score-cross-arm.ts` reproduced M\*=Infinity, denom -66,520.8, fresh+output -97.4, dollar -6,739.7, 15 invariant violations, byte-for-byte. | re-ran scorer over `confirm-k5-pokeapi-h1x/normalized.jsonl` |
| P-4 | **C1 interface-not-dataset mechanism** (zero-src onboarding compiles a NEW dataset to full `df.d.ts` via public APIs). | `sac-zero-src-onboarding.test.ts` passes |
| P-5 | **Governance gate is drift-sensitive on crafted probes** (declines stale/non-generic, promotes generic; 0 false-accept / 0 false-reject blind 20+20). | `run-governance-probes.ts` 4/4 + blind sweep |
| P-6 | **Phase-2 dataset-neutrality** (both verification criteria met): `src/` grep-clean of dataset-specific codegen names; dependency-inversion clean at the `author.ts` layer. | grep exit 1; `specializationRegistry.ts`; `finchainSpecialization.ts` needs no `author.ts` internals |
| P-7 | **C4 `$0` kill-gate did NOT kill the claim**, and arm2-governed vs arm3-ungoverned contrast is live on the probe (arm2 declines a stale clone, arm3 emits the stale value). | `run-governance-probes.ts`: source-drift arm2 DECLINES \| arm3 EMITS 1000 (gold 1750) |
| P-8 | **CRAG data dependency is SATISFIED in-env** (KICKOFF typed it BLOCKED-ENVIRONMENTAL). | 5.16GB file resolves; real-row tests run (not skip) when `CRAG_PATH` set |
| P-9 | **C9 single-session correctness is null/negative as conceded** — directionally confirmed, designed out of the headline. | `arm2_vs_arm1` delta 0pp; arm1 27/30 vs arm2 26/30 vs arm4 21/30 |

---

## 4. What is CLAIMED BUT NOT PROVEN (claim → what's missing)

All four surviving VALUE claims are at **mechanism-proven / endpoint-untested**. The common blocker is one structural seam: the runner does not dispatch the new arms/corpora, and `score-cross-arm.ts` is frozen to `arm0..arm5b` with a binary `officialPassed` metric.

| Claim | What's missing |
|---|---|
| **C4 — governance-under-staleness** (governed arm2 Truthfulness > ungoverned-persistent arm3 on CRAG −1 cells under injected drift). Highest value-if-true; `$0` A0 gate already cleared. | No live CRAG runner (`skillcraftFullDatafetch.ts` has 0 CRAG refs; no `cragFullDatafetch.ts`). Scorer has no tri-state/truthfulness/abstention path; `cragGrader` is not imported by any scorer. No runtime between-phase drift application. No abstention / "invalid question" answer protocol in the agent. No `r>0` hardness screen on the exact 2,706-Q text slice (PROJECTED from CRAG-MM, not the identical corpus). **Zero CRAG run artifacts.** |
| **C2 — zero-src onboarding sufficiency** (onboarded-no-learning non-inferior to arm1 inline on a fresh DB corpus). | `armOnb` is a config row + type-plumbing + a shell case label only — **no runner dispatch, no normalizer emit, no scorer membership** (`SAC_ARMS` excludes it). Its `interfaceMode` is **`legacy`**, NOT the generated-`df.d.ts` surface the C2 spec requires — so it does not yet exercise the path the claim depends on. Corpus (ROBuT/WTQ) not in-env; adapter unbuilt. No B0 floor probe, no pilot, no NI verdict. |
| **C5 — deep-invocable helper lowers TURNS** on serial-depth DAG at NI correctness. | The deep+invocable helper exists in NO realised run (observer hardwires **shallow** `toolFanout` at `author.ts`). No `deepHelper`/preseed arm in code at all. Scorer has **zero `llmCalls` references**. The shallow-warm arm already realised the FAIL branch (llmCalls ~6.4 > arm1 4.6 — note: prose-derived, not a scorer artifact). |
| **C8 — persistence-as-abstraction beats persistence-as-transcript** at equal context budget. | `armT` config + `truncateTrajectoriesToBudget` are unit-tested but **dead code in the runner** (`rawTranscriptInjection` consumed nowhere; trajectories not threaded into the prompt). Scorer omits `armT`; `seal-manifest.ts` default arms list also excludes it. No arm2↔armT McNemar+Wilcoxon path. No pilot. |
| **The five-arm headline** (datafetch beats arm1 inline-rewrite-no-persistence on amortised cost / persistence / governance). | The ONLY live paired run vs arm1 falsified the cost endpoint and tied/lost on correctness. **No surviving value endpoint has been demonstrated to beat arm1 in any live artifact.** |

Two further upstream-rigor gaps (methodology dimension):

- **mid-p McNemar** is pre-registered in all four claim tracks + the stats report but **unimplemented** (both TS scorer and Python analysis use exact-binomial only). Pilots land in `b+c<6` where the exact test cannot conclude. Direction is conservative (build-gap, not laundering).
- **Manifest-binding predicates** (P1 `prereg_sha`, P2 `config_hash`/scorer-sha/seed-coverage) are *written* by `seal-manifest.ts` but **consumed/verified by nothing** — they are agent-executed prose. The P3 upstream re-derivation (officialPassed from raw `answer.ts`+gold; token ledger from raw SDK usage) is also not yet code; it remains a manual sampled audit. `confirm-k5` has **no `run-manifest.json`**, so the strategy's §2.6 "P1/P2 hold for confirm-k5" claim is overstated and self-contradicts the strategy's own line-270 inventory.

---

## 5. What is FALSIFIED (and why that is fine)

| Falsified | Detail / why it's fine |
|---|---|
| **Cross-session cost-amortisation (the Phase-1 headline)** | arm4 frozen warm reuse does NOT beat arm1 inline re-derivation. Primary break-even **M\* = +Infinity** (denominator −66,520.8 full-weight tokens; fresh+output −97.4; dollar −6,739.7), AND arm4 less correct (h1x 2/5 vs arm1 4/5; also m1 2/5 vs 5/5, m2 3/5 vs 5/5). **This is a clean, conceded terminal PASS, fenced as verifier predicate P7 (REGIME-GUARD).** A sound harness produced an unambiguous negative — exactly the discipline the program claims. |
| **Shallow crystallised helpers as cost savers** | warm output ≈ inline output (~2,998 vs ~2,902); arm4's `answer.ts` was longer. The helper saved no writing. |
| **The +66k gap as hydration/fan-out-width bloat** | refuted by 33-agent regeneration: it is a TURN-COUNT tax (~+1.8 turns × ~36k arm-invariant cached/turn), not hydration or width. Implies: cost wins, if any, must come from cutting TURNS, not bytes — directly shaping the C5 design. |
| **C9 single-session frontier correctness lift as PRIMARY value** | conceded null up front (arm2 26/30 vs arm1 27/30, 0pp), consistent with SkillsBench −1.8pp and SkillFlow Sonnet-4.6 0.00pp. Explicitly designed out of the headline — not a defect. |
| **Three thesis-regeneration levers** (hydration-bytes, fan-out width / reuse-density, governance-as-correctness on PokeAPI) | refuted with data; governance INVERTED on PokeAPI (arm3 ungoverned 5/5 best, arm4 governed 2/5 worst, numeric FAC gate never organically fired). Implies CRAG's tri-state (penalises confident-wrong) is the *right* regime for governance — but whether the gate fires on real CRAG text reuse is still unproven. |
| **Task premise: Phase-2 #3 "BLOCKED"** | superseded — it is DONE (RUN-LOG Attempt 25). |
| **README boundary "eval/ depends on src/, never the reverse"** | violated on the CLI-reachable demo path: `src/demo/runDemo.ts:39` side-effect-imports `eval/harness/finchainSpecialization.js`, reachable via `datafetch demo`. |

---

## 6. Risks (severity-ranked)

| Sev | Risk |
|---|---|
| **HIGH** | **Zero live paired-run verdict exists for ANY of the four surviving value claims.** The one expensive live run was spent on the lever it then falsified; all progress since is `$0` scaffold + unit tests. The value headline (governed persistence beats inline rewrite somewhere) is empirically unproven. |
| **HIGH** | **C4 negative risk is concrete, two ways.** (a) Governance abstain-advantage on −1 cells could wash out (it INVERTED on PokeAPI). (b) **Reuse density**: the only in-env CRAG slice gave `df.lib` reuse 0/16 — if a crystallised helper is not reused across siblings there is *no abstraction to test* → C4 is DONE-INVALIDATED, not even a clean negative. |
| **HIGH** | **C5 rides on an unbuilt deep+invocable crystallisation the observer cannot produce** (shallow `toolFanout` only); projected TURNS win is small (~1-2), and the shallow-warm arm already moved the WRONG way. High chance of DONE-HONEST-NEGATIVE. |
| **HIGH** | **Corpus dependency for the two highest-value tracks is unresolved/environmental.** C4 needs the CRAG corpus identity decision (USER-GATED, CC-BY-NC, `r>0` only projected); C2/C5 need HF-Viewer corpora (ROBuT, MuSiQue) NOT in-env on low-traffic mirrors that showed transient 504s. A live run can still be blocked or return a saturation artifact. |
| **MED** | **Live governance gate passed 0/22 in the only live run** (`governanceGateApplied=22, governanceGatePassed=0`). "Governance works" rests entirely on the hand-fixture probe suite, not end-to-end behavior — a real wrinkle in the governance story. |
| **MED** | **Scorer endpoint paths for armOnb (NI), armT (McNemar+Wilcoxon), and tri-state truthfulness are NOT wired.** Even a successful live run has no scorer to verify it until this closes. armOnb/armT also lack runner-dispatch and normalizer-emit (type stubs). |
| **MED** | **mid-p McNemar unimplemented** despite four preregs + stats report committing it; manifest-binding + upstream re-derivation are agent-prose, not code — the one layer where input-poisoning could slip past the scorer recompute. |
| **MED** | **Substrate→eval coupling on the shipped CLI surface** (`runDemo.ts:39`). A clean `src/`-only extract would break; contradicts the substrate-neutrality thesis. |
| **MED** | **Cross-session-persistence headline evidence is gitignored, not committed/CI-gated.** `confirm-k5` lives only on this disk; a fresh clone cannot reproduce Panel 1. Strongest persistence demonstration is not regression-protected. |
| **MED** | **Stale `src/eval/*` file:line pointers** in KICKOFF + C2/C8 preregs + RESEARCH-STRATEGY (CONTRACT.md, C4, C5 are clean). A run sealing `prereg_sha` or a verifier resolving pointers will mismatch. (Note: the SHA seal reads files at runtime, so the seal itself is not corrupted — exposure is to human/P-verifier pointer resolution.) |
| **LOW** | **Test-count drift**: fresh run = 461, but no committed doc carries it (PHASE-1-FINDINGS says 424/424; RESEARCH-STRATEGY says 432). The green-gate evidence comes only from a fresh run, not any doc. |
| **LOW** | **C8 budget-direction artifact**: budget B is set FROM arm2's small abstraction size, structurally advantaging arm2; the pre-registered inverse variant is unbuilt. |
| **LOW** | **Phase-2 #2 crystallisation-half deferred** (string/boolean-INPUT helpers do not crystallise; `authorFromSource` returns null unless numeric inline-computation). Structurally entangled with the same numeric-FAC gate that drives the C4 probes — a fix could perturb the currently-passing C4 `$0` gate. |
| **LOW** | **No terminal-state classifier in code** — DONE-POSITIVE/HONEST-NEGATIVE/INVALIDATED is agent-mapped from the scorecard, not mechanized. |

---

## 7. What is LEFT — prioritized roadmap

The critical path for ALL four tracks is the **same unbuilt seam**: a runner that dispatches the new arms/corpora + a scorer widened past binary pass/fail. C4 leads because its `$0` kill-gate has already cleared and its corpus is in-env.

### P0 — C4 CRAG track (build → `$0` reuse/staleness screen gate → live headline)

| Task | Blocker | Honest-negative risk |
|---|---|---|
| **Build the live CRAG runner.** New `cragFullDatafetch.ts` (mirroring `finchainFullDatafetch.ts`) mounting `cragMount.ts` as `df.db`; drive arm2(governed)/arm3(ungoverned)/arm1(inline floor) over `groupCragSiblings` build→held-out with B-2 drift injected **between phases**; capture predicted answers incl. abstention. Add CRAG entrypoint (or `run-crag.sh`) sealing via `seal-manifest.ts`. | `skillcraftFullDatafetch.ts` has no CRAG path; `run-sac-poc.sh` is SkillCraft-family-only. NOT blocked on data (in-env) or A0 (PASSES). | If reuse doesn't fire (0/16 precedent) → DONE-INVALIDATED. |
| **Wire the tri-state/truthfulness + abstention scorer** (`truthfulnessPct = accuracyPct − hallucinationPct`), McNemar on −1 discordant cells, arm2-vs-arm3 paired path. `cragGrader.scoreCragRows` exists but is invoked by no scorer. | `score-cross-arm.ts` `SAC_ARMS` hardcoded arm0..arm5b, no answer_type branch; runner answer-extraction is SkillCraft-shaped numeric FAC with no abstain channel. | — |
| **`$0` reuse/staleness screen gate** (the go/no-go before live spend): run the `r>0` hardness screen on the chosen CRAG text slice AND confirm a crystallised helper is reused across ≥2 (domain, question_type) siblings. | hardness screen on the exact 2,706-Q slice unrun (PROJECTED only). | Arm-1 saturation OR 0-reuse kills C4 cheaply, before any live budget. |
| **Resolve the CRAG corpus-identity USER-GATE** and port data into the run tree (currently only in the `crag-harness` sibling worktree; `DATAFETCH_CRAG_JSONL` unset; loader returns `[]` / skips when absent). | user strategic decision. | — |
| Then: A1 pilot (realised b/c/b+c, no verdict) → **A2 powered arm2-vs-arm3 Truthfulness run** (k≥5); claimUpheld computed, not read. | upstream tasks. | governance abstain-advantage may wash out (inverted on PokeAPI). |

> Note on the stale `crag-shape-probe.ts`: it is broken-after-reorg dead code with fictional trajectories — it is NOT a live runner and should be ignored/removed, not mistaken for an entrypoint.

### P1

| Task | Blocker | Honest-negative risk |
|---|---|---|
| **Wire armOnb + armT into runner AND normalizer AND scorer** — not just config: add armOnb onboarding-no-learning **with generated-`df.d.ts` interfaceMode** (currently `legacy`, wrong for C2); consume `rawTranscriptInjection` + call `truncateTrajectoriesToBudget` and thread trajectories into the armT prompt; add both to `SAC_ARMS`; add arm1↔armOnb NI and arm2↔armT McNemar+Wilcoxon paths. | both arms are type/config stubs; armOnb interfaceMode mismatch; armT mechanic is dead code; armOnb may hit residual Phase-2 plumbing. | C8: an arm-2 win could be a which-arm-sets-B artifact. |
| **Implement mid-p McNemar** in `score-cross-arm.ts` and `p1-paired-analysis.py` for 6≤b+c<25, **before any pilot is scored**. | none. | under-powered NI verdict if skipped (conservative). |
| **Mechanize manifest-binding + P3 upstream re-derivation** (prereg_sha == git hash-object; config/scorer/normalizer/runner sha match + seed coverage; re-derive officialPassed from raw answer.ts+gold and token ledger from raw SDK usage on a sampled subset). | scorer reads none of these today. | closes the input-poisoning hole the strategy itself names. |
| **C2 live ladder**: build the ROBuT/WTQ HF MountAdapter (retry/backoff + `perturbation_type=='original'` filter + local snapshot), B0 `$0` floor probe, hardness screen → B1 pilot → B2 powered NI run vs arm1. | corpus not in-env; identity USER-GATED. | — |
| **Break the substrate→eval coupling** (`runDemo.ts:39`) and **promote the cross-session persistence evidence into a committed CI-gated fixture**. | none. | — |
| **Refresh stale `src/eval/` pointers** (KICKOFF, C2/C8 preregs, RESEARCH-STRATEGY incl. §2.6 P1/P2 wording and line 320) and re-freeze/re-commit before sealing any `prereg_sha`. | the reorg moved every referenced file. | — |
| **Confirm the program reframe**: with Phase-1 conceded and dataset-neutrality proven, lead the narrative with SDK zero-src-onboarding + governance-under-staleness (not cost-amortisation), and pick which track(s) get live budget. | user strategic decision (idling since RUN-LOG Attempt 11). | — |

### P2

| Task | Blocker | Honest-negative risk |
|---|---|---|
| **C5 deep-helper track**: define/preseed the deep+invocable helper (B-5; observer crystallises shallow only) + B-6 scorer `llmCalls`/TURNS path with raw-SDK re-derive; run serial-depth TURNS comparison (SkillCraft pokedex DAG or MuSiQue). Measure TURNS, never tokens. | deep helper in no realised run; scorer has 0 `llmCalls` refs; C5 corpus USER-GATED. | weakest + cheapest live falsifier; shallow arm already realised the fail branch. |
| **Add a terminal-state classifier** to the scorer/verify step (emit DONE-POSITIVE/HONEST-NEGATIVE/INVALIDATED from claimUpheld + invariant partition). | none. | — |
| **C8 inverse budget-direction variant** end-to-end (arm2 padded with inert filler to armT's natural size). | armT runner half must land first. | — |
| **Finish Phase-2 #2 crystallisation-half** (string/boolean-INPUT helpers) + SkillCraft `df.tool.*` migration onto `regenerateManifest`. | no FinChain test path in-env; entangled with the numeric-FAC gate driving C4 probes — may perturb the passing C4 `$0` gate. | — |

---

## Completeness critique (2026-06-04)

A completeness pass against the actual artifacts (`confirm-k5-pokeapi-h1x/score.json`, `eval/skillcraft/scripts/score-cross-arm.ts`, `ceiling-probe/CEILING-PROBE.md`, `run-governance-probes.ts`, `tests/demo-e2e.test.ts`, `src/hooks/mode.ts`). Most of the assessment holds up under direct verification — the mechanism claims in §4/§5/§6 are accurate to the code (scorer hardcodes `SAC_ARMS = arm0..arm5b` at line 76; 0 `llmCalls` / `cragGrader` / `mid-p` references; `process.exit(2)` at line 715 fires on invariant violations only; no `cragFullDatafetch.ts`; demo-e2e forces `legacy` mode + `SKIP_ENV_FILE=1`; `confirm-k5-pokeapi-h1x` genuinely has no `run-manifest.json`). The gaps below are about what the assessment does NOT say.

### G1 — The headline negative's statistical power is never disclosed (biggest softness)

This is the load-bearing omission. §1, §3 (P-3), and §5 present the Phase-1 falsification (M\*=+Infinity, denom −66,520.8 tokens, arm4 less correct) as a "clean," "unambiguous," "terminal PASS" produced by a "valid harness," and the only quantified caveat about power anywhere in the document (§4, §7-P1) is *prospective* — for future pilots if mid-p is skipped. But the completed run itself is thin: `rowCount=210` decomposes to **6 questions × 7 arms × 5 seeds**, so every paired endpoint is **n=6 matched questions**. Worse, the secondary marginal-cost endpoint the −66,520.8 figure comes from is **`nMatched=1`, `nClusters=1`** — a single matched cluster, which is why its CI is degenerate (`lower==upper==66520.8`, a point, not an interval). The correctness side is non-significant: `arm4_vs_arm1` McNemar `b=0, c=2, p=0.5`; `arm2_vs_arm1` is `b=0, c=0` (no discordant pairs at all). So the "arm4 is *less* correct" sub-claim rests on 2 discordant cells over 6 questions and does not reach significance. The negative may well be real and the regime-guard framing is defensible, but the assessment overstates its evidential weight: a one-cluster point estimate and a p=0.5 McNemar are not an "unambiguous" falsification, they are a strong directional signal at very low power. The under-coverage is the absence of any n / cluster-count / noise-floor disclosure attached to the headline result.

### G2 — The committed `$0` ceiling probe that REOPENS C5 is omitted, making the C5 pessimism one-sided

`experiments/episodes/03-sac-poc/ceiling-probe/CEILING-PROBE.md` (with `lib_pokedexEntries.ts` + `answer_deep.ts`) is a committed, in-episode `$0` artifact whose explicit verdict is "**GATE CLEARS** … the cost pillar is NOT refuted — it died for SHALLOW helpers; a deep+invocable one is viable in principle" (hand-optimal deep helper collapses caller write-cost ~3.5×, 20 vs 80 lines). The assessment never cites it. Instead §4, §6 (HIGH), and §7-P2 frame C5 entirely from the shallow live result ("the shallow-warm arm already moved the WRONG way," "high chance of DONE-HONEST-NEGATIVE," "weakest + cheapest live falsifier"). That is a one-sided read of the program's own evidence: the deep-helper cost island was explicitly REOPENED (conditional on substrate work + a TURNS-measuring run) by a committed probe. C5 is under-covered, not just risky — the assessment's risk rating ignores the strongest piece of pro-C5 evidence that exists.

### G3 — "Governance gate is drift-sensitive" (P-5) is stated as PROVEN but the only live evidence is 0/22

P-5 asserts the governance gate is "drift-sensitive … 0 false-accept / 0 false-reject blind 20+20" and §2.1 lists it as a green gate. The supporting code is real (`run-governance-probes.ts`, `blindSuite.ts`, default `blindN=20`), so the *fixture* claim is fair. But the only end-to-end signal — `governanceGateApplied=22, governanceGatePassed=0` in `confirm-k5-pokeapi-h1x` — means the gate passed **zero of twenty-two** live applications. §6 (MED) does flag this honestly, but §3's PROVEN table elevates "governance is drift-sensitive" to a proven claim while the live pass-rate is 0%. The gap: P-5 should be scoped to "proven on hand-crafted probes; live behavior is 0/22 / untested," matching §6 — right now §3 and §6 are in mild internal tension over the same fact.

### G4 — Two "no blocker" left-to-dos are softer than billed

- §7-P1 "Mechanize manifest-binding + P3 upstream re-derivation" is listed with blocker "none," but §4's own paragraph says the P3 re-derivation is "not yet code … a manual sampled audit" and the predicates are "agent-executed prose." Mechanizing an agent-prose audit into a verified scorer recompute is real design work (defining the re-derivation contract over raw `answer.ts`+gold and raw SDK usage), not a no-op — calling it blocker-"none" understates it.
- §7-P1 "Refresh stale `src/eval/` pointers" is blocker "the reorg moved every referenced file," which is a cause, not a blocker — there is genuinely nothing stopping it. Fine as-is, but note it is coupled to the `prereg_sha` sealing path (§4 / §6-MED), so it is a prerequisite, not an independent chore.

### G5 — Minor prose/artifact mismatches (do not change conclusions)

- §1 and §5 cite "h1x 2/5 vs arm1 4/5" (and "m1 2/5 vs 5/5," "m2 3/5 vs 5/5") as per-task seed slices, but the scored, recompute-reproducible artifact P-3 leans on reports the matched-question figures (`arm4_vs_arm1` n=6, ΔPp −33.33). Mixing the per-task 2/5 framing with the n=6 scorer framing without flagging which is which slightly inflates the apparent decisiveness. Reconcile to one denominator.
- §2.1 / §6-LOW: the test-count drift is correctly flagged (fresh run 461; PHASE-1-FINDINGS says 424/424; RESEARCH-STRATEGY 432). Verified: 59 test files on disk, consistent with the "59 files / 461 tests" line. The drift is real and harmless, as stated.
- The episode also contains `STATUS.md` (last updated 2026-06-03, still says "#3 and #4 … BLOCKED") which directly contradicts §2.1 / §5's "Phase-2 #3 is DONE." The assessment is right and STATUS.md is stale, but the contradiction lives in the same episode folder and is not noted as a doc-refresh item alongside the §7-P1 pointer refresh.

### Verdict

Trustworthy as a direction-of-truth document — its mechanism claims verify against the code and its honest-negative posture is genuine — but it materially understates the headline negative's low power (n=6 / one-cluster CI / p=0.5) and omits the committed ceiling probe that reopens C5, so the §3 PROVEN tier and the §6 C5 risk rating should be read as moderately overstated in opposite directions.
