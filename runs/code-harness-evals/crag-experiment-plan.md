# CRAG Match/Beat Experiment — Principles, Hypotheses, and Staged Plan

**Owner:** code-harness-evals `/goal` session · **Started:** 2026-05-28
**Goal contract:** produce a defensible CRAG-Finance match/beat result for datafetch (learned `df.lib` arm vs matched cold arm vs published 44% RAG / 51% SOTA references), scored with CRAG's own accuracy/hallucination/missing scorer — or an evidence-backed blocker.

This document is the engineering spine for the run. It exists because a prior 30-minute zero-LLM probe (`kb/br/17-crag-shape-probe-findings.md`, 2026-05-18) already found that the CRAG eval "cannot run honestly today" for substrate reasons, so the value question ("does the learned arm beat the cold arm?") is gated behind a substrate-readiness question that must be answered cheaply first. The plan is ordered cheapest-falsifiable-first.

---

## Principles (guardrails — non-negotiable)

These specialise `reference.md`'s Forbidden Shortcuts to this experiment. Every stage is checked against them before escalating.

- **P1 — Correctness-under-reuse is the spine.** A warm `df.lib` call that returns a confident wrong answer is strictly worse than a cold `df.db`/`df.tool` fallback. CRAG's tri-state scorer punishes this directly (`-1` for hallucination). "Falling back is not a failure; silent bad reuse is." A literal-clone helper that rides across siblings with different tools/metrics is a P1 violation and must be refused, not measured.
- **P2 — Generic substrate only.** No CRAG/finance/domain/template-name branches in `src/`. The adapter is a *clean consumer* of the generic mount/tool/manifest surfaces (the way `evalRecords.ts` is), not a special-cased path. Any substrate change (e.g. finer intent-signature differentiation) must be benchmark-agnostic and justified by making the system simpler or more correct *generally*, then proven against existing SkillCraft/FinChain evals for non-regression.
- **P3 — Honest scorer.** Use CRAG's own published 3-way scorer unchanged. `df.answer` self-validation is not the gate. No threshold/rubric weakening, no benchmark-shaped unwrap/default answer logic.
- **P4 — Smallest falsifiable probe first.** Zero-LLM or tiny-LLM probes before any live fanout. Escalate only on evidence (the `kb/br/17` 30-min probe pattern proved its worth — reuse it).
- **P5 — Discovery through the filesystem, not the prompt.** No helper-name leaks. The agent must find helpers via `df.d.ts` / `AGENTS.md` / `apropos` / `man`. Hook manifests remain the callability authority; no quarantine bypass.
- **P6 — Evidence or blocker, never speculation.** Every stage ends with a logged hypothesis → exact command → exit line → evidence → decision. If blocked, write an evidence-backed `BLOCKED:` entry with the input that would unlock progress — not speculative code.
- **P7 — Guard/budget discipline.** Codex usage guard is currently unavailable → treat as unreliable → bounded Claude only (`DATAFETCH_AGENT=claude CLAUDE_CLI=claude-p`), no large Codex fanout. Re-check the guard before any fanout step.
- **P8 — `/deep-research` is a first-class escape hatch.** When stuck on an *external-knowledge* question (not a code question) — CRAG data format, scorer semantics, baseline-number provenance, mock-API contract — invoke `/deep-research` with a scoped question and capture cited findings into `runs/code-harness-evals/research/` rather than guessing. Code questions stay in-repo (read source, run probes).
- **P9 — Shared-worktree hygiene.** Multiple `/goal` sessions may share this worktree. Check `git status`/mtimes before editing shared files; never blind `git checkout --` a shared file.

---

## Hypotheses (falsifiable, ordered cheapest-first)

| # | Hypothesis | Tested in | Falsifier → action |
|---|---|---|---|
| **H0** | Under `df.db.*` modeling (the alternative `kb/br/17` recommends, not the `df.tool` modeling it actually ran), the substrate can author **distinct, correct, intent-shaped** helpers for the distinct CRAG question shapes. | Stage 0 | Re-run still collapses shapes to one bucket / authors a literal clone → learned arm is **blocked at substrate**. Either make the minimal *generic* signature/render fix (P2) or report BLOCKED. |
| **H1** | The CRAG-Finance **cold no-`df.lib` arm** scores well below ceiling on CRAG's scorer (in the published ≤34% bare-LLM / 44% RAG band; NOT saturated like FinChain FAC=1). | Stage 2 | Cold arm saturates → **STOP and report** (same failure mode as FinChain: too easy to need the harness). Do not build the learned arm on faith. |
| **H2** | Over a repeated-structure CRAG-Finance question stream, the observer crystallises ≥1 **correct, intent-shaped** `df.lib` helper that the agent **discovers via the filesystem** and reuses on warm siblings without correctness regression. | Stage 3 | No crystallisation, or crystallised helper is a literal clone (P1 landmine) → learned loop does not fire honestly on CRAG. |
| **H3** | The learned arm scores **higher accuracy and/or lower hallucination** than the matched cold arm at the same model/scorer (stretch: approaches/beats the 44% RAG reference). | Stage 4 | Learned arm ≤ cold arm, or learned arm **raises** hallucination → no defensible match/beat; report the honest negative. |

---

## Staged workflow (the dynamic-workflow shape, with `/deep-research` wired in)

Sequencing is deliberately gated: each stage's gate can halt the run with an evidence-backed blocker before spending the next stage's budget.

### Chosen direction (decided 2026-05-29, after Stage 0 + deep-research)
Deep-research (`research/crag-finance-structure-scorer.md`) confirmed: **H1 headroom holds** (cold ~33–44%, opposite of FinChain), but **~56% of CRAG-Finance is the 2-call same-category chain** that collapses the substrate's category-only intent signature into a literal-clone helper (P1 landmine). User decision: **make the generic finer-intent-signature substrate fix first, prove non-regression on SkillCraft + FinChain (P2), then run CRAG-Finance across all question types.** This inserts a Stage 0.5 below; the modeling is the hybrid `df.db` (entity/ticker corpus) + `df.tool` (metric APIs).

### Stage 0.5 — Generic intent-signature + authoring fix *(touches `src/`, highest P2 risk)*
- **Goal:** distinguish a *dependent chain* from a *parallel fan-out* in `computeIntentSignature` (input/output reference patterns, not category alone), and refuse literal-clone authoring on 2-call same-category trajectories (`author.ts`), per `kb/br/17`'s recommendations 1–2.
- **Hard constraint (P2):** must NOT regress SkillCraft's existing clustering (146 trajectories → 55 clusters, 0 incoherent) or FinChain FC1–FC5/R1–R9. The category-only collapse was deliberate and well-tuned; the fix must be additive/surgical.
- **Verify:** existing smoke + vitest suites green (`tsx` smokes + `vitest run`), SkillCraft/FinChain verify pass, the `crag-shape-probe` now authors distinct (or correctly refuses) rather than literal-cloning.
- **Gate:** any SkillCraft/FinChain regression → revert and reconsider (do not weaken to pass).

### Stage 0 — Scope & substrate-readiness probe *(cheap, zero/low-LLM)*
- **Scope CRAG inline:** data format, mock-API surface, published 3-way scorer. **If any external-knowledge gap → `/deep-research`** (P8) and store the cited brief under `research/`.
- **Re-run the `kb/br/17` follow-on probe under `df.db.*` modeling** (the 1-hour probe its "Smallest follow-on probe" section specifies): re-shape the 7 trajectories as `db.crag.<domain>.<collection>` primitives, re-run `extractTemplate` + `authorFunction`, compare authoring outcomes against the predictions in that doc. **Tests H0.**
- **Gate:** substrate authors distinct correct helpers → proceed to Stage 1. Substrate still collapses/clones → minimal generic fix (P2) or BLOCKED.

### Stage 1 — CRAG→`df.db` Finance adapter *(build)*
- Corpus as a mount (`MountAdapter`/`EvalRecordsMount`-style), mock search APIs as `df.tool`, gold answers mapped to the `df.answer`/scorer boundary. Model on `src/eval/evalRecords.ts` + `src/eval/finchainFullDatafetch.ts`.
- Port CRAG's published scorer **faithfully** (accuracy/hallucination/missing). **If scorer semantics ambiguous → `/deep-research`** (P8).
- End with typecheck + focused tests.

### Stage 2 — Cold-arm precondition gate *(live, bounded Claude)*
- Run cold no-`df.lib` arm, score with CRAG scorer. **Tests H1.** Re-check guard first (P7).
- **Gate:** saturated → STOP + report; headroom → proceed.

### Stage 3 — Learned arm *(live, bounded Claude)*
- Repeated-structure question stream, `df.lib` crystallisation enabled, same model. **Tests H2.** No helper-name leaks (P5).

### Stage 4 — Score both arms + paired report *(the value claim)*
- Both arms scored with CRAG's scorer. **Tests H3.** Paired report prints accuracy/hallucination/missing for both arms vs the 44% RAG / 51% SOTA references, with a clear match/beat/neutral/blocked verdict.
- **Dynamic-workflow fan-out:** once the adapter exists and the question set is enumerated, Stages 2–4 are N independent question-slices, each running the strict ordered pipeline `cold-arm → learned-arm → CRAG-score → reconcile`, joining into the paired aggregate. This is where the `Workflow` fan-out applies — gated behind the Stage 0/2 gates and the guard (P7).

### Stage 5 — Thermo-nuclear code-quality review
- Structural simplicity, abstraction quality, file size, spaghetti-condition growth; is the shipped design easier to understand than the start? Update `quality-review.md`.

---

## `/deep-research` integration (explicit)

Deep research is a stage-agnostic escape hatch, triggered only by **external-knowledge** blockers (never code blockers, which stay in-repo):

| Trigger | Example research question |
|---|---|
| CRAG data format unclear | "CRAG benchmark (arXiv:2406.04744 / facebookresearch/CRAG) public dataset record schema and Finance-domain question fields" |
| Scorer semantics unclear | "CRAG published 3-way scorer: exact accuracy/hallucination/missing definitions and the LLM-judge prompt used in the KDD-Cup-2024 evaluation" |
| Baseline provenance | "Provenance of CRAG ≤34% bare-LLM, 44% straightforward-RAG, 51% SOTA numbers — which split and metric" |
| Mock-API contract | "CRAG mock web-search and mock-KG API request/response shapes" |

Each invocation stores its cited output under `runs/code-harness-evals/research/<slug>.md` and is referenced from the relevant `log.md` attempt entry.

---

## Definition of done

A paired report (printed in the transcript) giving CRAG-scorer accuracy/hallucination/missing for both arms with a match/beat/neutral verdict against the 44%/51% references — **or** an evidence-backed `BLOCKED:` entry naming the substrate/headroom blocker and the input that would unlock it. Plus typecheck/tests green and a thermo-nuclear review. No FC1-FC5/R1-R9 gate weakened; no Forbidden Shortcut taken.
