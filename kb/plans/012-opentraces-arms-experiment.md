---
title: "feat: OpenTraces arms experiment (evidence-gated learned interface vs cold search, correctness + cost)"
summary: "Run the first live paired-arm experiment on the sealed OpenTraces corpus: does a governed, evidence-gated learned interface beat cold search on truthfulness and cost, with governance ablation, persona divergence, and the user's held-out real questions as external validity probe."
type: feat
status: in-progress
date: 2026-06-10
amendment: "2026-06-11 Amendment B adopted (user decision): curated-interface arms. See the Amendment B section; the original organic-emergence arms remain terminally failed at kill-gate M1 (RUN-LOG episode 05, Attempts 3-5) and are NOT claimed. Substrate track scoped separately as plan 013."
related_research:
  - kb/plans/011-opentraces-dark-store-corpus.md
  - kb/br/19-skill-library-baseline-ladder-and-paired-eval-methodology.md
  - kb/br/17-crag-shape-probe-findings.md
  - kb/plans/009-sac-aligned-poc-skillcraft.md
---

# OpenTraces Arms Experiment

*Drafted 2026-06-10, immediately after the plan-011 seal (commit `082269d61`). DESIGN DOCUMENT: no live run starts until the pre-registration milestone (M3) is committed and the two kill-gates (M1, M2) pass. A negative on any pre-registered endpoint is a terminal PASS.*

## Overview

Plan 011 sealed a corpus where cold agent search is ~50x more expensive than an existing interface AND wrong 8/10 times. This plan runs the arms that turn those probe facts into pre-registered claims: a two-phase learned-interface arm (build, freeze, fresh-process warm reuse) against a tool-matched cold-search baseline and the recipe/cache attribution floors, plus a governance ablation, scored on tri-state truthfulness and full-weight model-context cost over the 208-question pack. It also delivers the seam every prior value claim died waiting for: a runner that dispatches these arms on this corpus and a scorer that reads the pack's answer_type/tolerance fields.

## Problem Frame

Every surviving value claim from the SaC program (governance-under-staleness, onboarding, persistence-as-abstraction) is mechanism-proven but has zero live paired verdicts, blocked on the unbuilt runner-dispatch + widened-scorer seam (ASSESSMENT-2026-06-04). Meanwhile the OpenTraces G0 probe reopened the one claim that was structurally unwinnable on SkillCraft/FinChain/CRAG-finance: correctness. On a private polymorphic store the model has no prior on, cold search confabulates (commit attribution by time-window plausibility) where a derived interface is exact. If a *learned, replay-gated* interface recovers most of the expert-arm correctness at a fraction of cold cost, that is the product headline the program has lacked since the amortisation falsification. If it does not, that is a terminal finding about online interface emergence on realistic stores, and the corpus, conventions, and instrument survive for the md-memory/promotion-policy comparisons regardless.

## Requirements Trace

- R1. **Arms** (per-question fresh sessions; SAC_ARM-style single selector; one binding-line parity slot machine-checked across armN/armL pairs, hashes published):
  - `armN` cold search: datafetch workspace over the corpus mount, no learned lib, no persistence, lib wiped per question (tool-matched adversarial bar).
  - `armR` recipe floor: armN plus a <=600-char persisted NL recipe distilled from phase-1 (instruction-compression floor).
  - `armC` cache floor: armN plus strict name+args results cache from phase-1 (memoization floor; pack siblings are new-argument by construction, scorer asserts zero decisive phase-2 cache hits).
  - `armL` learned+governed: phase-1 BUILD on siblings 1-5 per template (observer crystallises, quarantine replay gates callability, recurrence keyed on shapeHash/template_id per the G1 carry-forward); phase-2 fresh process, frozen lib, HELD-OUT siblings 6-8.
  - `armG` governance ablation: armL with forced callability (no replay gate), phase-2 identical.
- R2. **Primary endpoint (pre-registered): truthfulness.** Tri-state grading (+1 accurate, 0 missing/abstain, -1 incorrect) from pack answer_type/tolerance fields; truthfulness = accuracy minus hallucination. Claim: armL phase-2 > armN on held-out siblings, per-question majority vote over k=3 seeds, clustered bootstrap CI excluding 0; abstention rows reported as their own slice.
- R3. **Co-primary: cost at non-inferior correctness.** Full-weight model-context tokens AND turns, armL warm vs armN, NI margin -5pp clustered; attribution ladder: armL must beat armR and armC on the primary unit or the callable-interface claim is not made (br/19 discipline).
- R4. **Governance endpoint:** armL vs armG on confidently-wrong rate (-1 cells), all rows plus the abstention slice. Prediction: armG hallucinates on abstention rows where armL declines.
- R5. **Divergence endpoint (first L_n measurement):** per-persona tenant libraries; report helper shape-hash overlap (pairwise Jaccard) against the pre-registered persona predictions; held-out P3: armL runs P3 questions with the P1/P2/P4-built library, measuring transfer vs fresh derivation.
- R6. **External validity probe:** the user's ten real questions (deliberately excluded from the sealed pack) run once under armN and armL at the end, graded by hand-written reference solvers authored at that time; reported as a slice, never pooled into the primary.
- R7. **Kill-gate M1, crystallisation fires ($0-ish, before anything else):** >=2 live agent sessions per persona over the corpus mount; PASS requires >=1 helper crystallised AND >=1 helper passing the replay gate to callable. Known risk: the gate's db->lib dataflow heuristic and the agent-prior problem (Era 2); the mandate-strength preseed machinery from plan 009 is the sanctioned lever. FAIL = STOP, finding recorded, substrate work scoped separately.
- R8. **Kill-gate M2, reuse density (R11 pre-flight):** ~20-task probe; frozen-lib warm reuse must fire on >=40% of eligible held-out siblings (calibrated to SkillCraft R7=0.846). FAIL = STOP (the corpus is build-able but not reuse-live; md-memory comparison still proceeds in a successor plan).
- R9. **Runner + scorer seam:** an OpenTraces runner (run-sac-poc.sh pattern: sealed run manifest, dirty-tree refusal, interleaved seeds, normalized.jsonl) and a scorer reading pack.yaml tolerances, emitting the R2-R5 endpoints with the sensitivity ladder (cached-weight 1.0 / 0.0 / 0.1). No silent default arm; unknown SAC_ARM-equivalent throws.
- R10. **Mount design:** trace envelopes via the records mount (per-question family slices, the G1-proven path); event access through a bounded df.tool scan surface with the population rule in workspace docs. No SCHEMA-TRUTH content anywhere in any workspace or prompt; quarantine grep runs in CI for every run dir.
- R11. **Hygiene invariants:** driver model pinned `claude-sonnet-4-6`; every spawned session `--safe-mode --no-session-persistence` (live-home hooks AND recursive OpenTraces capture); `git diff --stat src/` empty; all reads from the sealed snapshot; budget cap per arm pre-registered in the manifest; no push of any artifact (SEAL-ADDENDUM limitation 6 stands until resolved).
- R12. **Pre-registration (M3):** claim sentences for R2-R5 with directions, thresholds, slices, and the analysis script committed BEFORE the first scored episode; `claimUpheld=false` is a terminal PASS.

## Scope Boundaries

- No changes to `src/**`; any required substrate change is a BLOCKED finding, not a patch.
- No pack edits: the pack is sealed (`5f1e512a...`); any revision is a new digest and a documented re-audit.
- No md-memory arm in this plan (that comparison is the promotion-policy/oracle-regret successor); no cross-tenant family promotion; no public push or publication of any artifact.
- No new corpora; no τ³-bench; no CRAG runs here.
- No LLM-judged grading anywhere.

## Milestones

1. **M1 crystallisation kill-gate**: mount + live preseeded sessions; STOP/sign-off. *Effort: Medium*
2. **M2 reuse-density pre-flight**: ~20 tasks, frozen-lib reuse rate; STOP/sign-off. *Effort: Medium*
3. **M3 pre-registration**: claims, thresholds, budgets, analysis script, sealed manifest. *Effort: Short*
4. **M4 runner + scorer seam**: dispatch, normalize, score from pack.yaml; unit-tested on G1 fixtures. *Effort: Large*
5. **M5 the run**: 5 arms x 208 questions x k=3 seeds, two-phase armL/armG (budget-estimated and capped at M3). *Effort: Large*
6. **M6 scoring + supervisor audit**: endpoints, slices, recompute-reproducibility check. *Effort: Medium*
7. **M7 external probe + writeup**: user's ten questions; verdict rows into kb/research.md Era 5. *Effort: Short*

## Verification

1. M1/M2 gate results committed with pre-registered thresholds stated before measurements.
2. Pre-registration commit precedes the first scored episode (git ordering checkable).
3. Parity hashes published per armN/armL pair; run manifest sealed; `git diff --stat src/` empty.
4. Scorer recompute-reproducible byte-for-byte by the supervisor from normalized.jsonl.
5. Every endpoint reported with its pre-registered direction, including negatives.

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale |
|---|-------|----------|---------------|-----------|-----------|
| 1 | Design | Correctness (truthfulness) is PRIMARY, cost co-primary | Endpoints | Follow the evidence | G0's 8/10 naive-wrong is the reopened claim; cost-only claims are perishable as models cheapen |
| 2 | Design | Recurrence keyed on shapeHash/template_id | Methodology | G1 carry-forward | convergenceIndex's intentSignature merges P1/P3 families |
| 3 | Design | User's ten questions held OUT as external probe | Methodology | External validity | Stronger as unseen real questions than as pack rows; decided at seal |
| 4 | Design | Kill-gates M1/M2 before the runner build | Sequencing | Cheapest NO first | The Era-2 agent-prior problem and the 0/16 CRAG reuse precedent are the two live ways this dies; both are testable for ~$0-cheap before M4's Large effort |
| 5 | Scope | md-memory arm deferred to the successor plan | Scope | One claim structure per run | This plan isolates interface-vs-floors; memory-system comparison needs the oracle-regret framing (plan 010 revision) |
| 6 | Hygiene | safe-mode + pinned model on every session | Methodology | Plan-011 lessons | Live-home hook trip and self-capture recursion both already observed |

---

## Amendment B (2026-06-11, adopted): curated-interface arms

Kill-gate M1 terminally failed for organic emergence (three diagnosed substrate mismatches; RUN-LOG episode 05 Attempts 3-5). The experiment proceeds with a CURATED interface, which changes the claim, the arms, and two endpoints. The original text above stands as history; where this section conflicts with it, this section governs.

**The claim under test (replaces emergence):** a curated, typed, callable interface layer over a developer's data store materially improves agent correctness at materially lower cost than cold search, and beats plain documentation. No emergence claim is made anywhere; the word "learned" does not appear in any output of this experiment. (Emergence is plan 013's subject.)

**Arms (B-set, replaces R1):**
- `armN` cold: mounted workspace, db primitives only, no lib, no recipe.
- `armR` documentation floor: armN plus ONE <=600-char template-blind NL recipe describing the store's shape and conventions (the "good README" floor).
- `armL` curated interface: armN plus the curated seed library (below) exposed via df.d.ts and callable.
- DROPPED: armC (new-argument siblings make the cache floor vacuous), armG and the governance-under-staleness endpoint (DEFERRED: quarantine replay cannot validate composite outputs, diagnosed M1c; returns after plan 013 item c).

**The curated library contract (the load-bearing honesty rule):**
1. Authored from `SCHEMA-TRUTH.md` section 6 (the I\* sketch) ONLY. The author MUST NOT read `solvers/`, `questions/pack.jsonl` gold, or `templates/pack_spec.py` while authoring.
2. Helpers take DOMAIN parameters only (window, groupBy, project, model, skill, path glob, commit sha). FORBIDDEN: any `templateId`/`row_id` parameter, any per-template or per-question branching, any import from solvers/ or questions/. This is the line between an interface and an answer key; iteration 1 of the kill-gates crossed it and was ruled invalid.
3. Size discipline: at most 12 helpers, each a single intent-shaped function (guideline <=80 lines); no universal dispatcher.
4. Mechanical blindness verifier: a committed grep over the library sources for template ids, row ids, and solver/pack imports returns zero hits.

**Endpoints (amends R2-R6):** PRIMARY: truthfulness armL vs armN (tri-state from pack tolerances, per-question majority over k=3 seeds, clustered CI). CO-PRIMARY: full-weight model-context tokens AND turns at non-inferior correctness; armL must ALSO beat armR (else the value is documentation, not callability; reported either way). Slices: abstention rows, per-persona, per-difficulty. External probe (R6) unchanged: the user's ten held-out real questions, armN vs armL, graded by reference solvers authored at that time. Divergence endpoint (R5) DEFERRED with armG.

**Budget discipline (new, hard):** before any full run, a COST PILOT of 9 episodes (3 questions stratified easy/aggregate/event-join x 3 arms x 1 seed) projects the full-run cost from measured per-episode tokens. The full run uses a pre-registered stratified subsample (4 siblings per template = 104 questions, x 3 arms x k=3 = 936 episodes) and a hard cap fixed at budget sign-off. STOP after the pilot for supervisor + user sign-off on the projection; the run does not start without it.

**Sequence:** M-B1 curated library + blindness verifiers (STOP: supervisor library review). M-B2 cost pilot + projection (STOP: budget sign-off). M3 pre-registration commit. M4 runner/scorer seam (grader unit-tested on >=10 known-gold and >=3 deliberately-wrong cases before use). M5 run. M6 score + supervisor recompute audit (STOP). M7 external probe + writeup + research.md rows.
