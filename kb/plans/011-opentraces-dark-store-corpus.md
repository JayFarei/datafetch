---
title: "feat: OpenTraces dark-store corpus (persona-driven eval for interface emergence)"
summary: "Build a sealed, persona-driven, deterministically-graded eval corpus over the local OpenTraces bucket, gated by two $0 kill-probes, so the evidence-layer thesis (interface emergence from agent search over polymorphic unknown data) gets its first honest instrument."
type: feat
status: proposed
date: 2026-06-10
related_research:
  - kb/br/19-skill-library-baseline-ladder-and-paired-eval-methodology.md
  - kb/br/17-crag-shape-probe-findings.md
  - kb/br/16-substrate-benchmark-scouting.md
  - kb/br/20-perplexity-search-as-code.md
  - kb/plans/009-sac-aligned-poc-skillcraft.md
  - kb/plans/010-online-interface-synthesis-oracle-regret.md
---

# OpenTraces Dark-Store Corpus

*Drafted 2026-06-10 from the post-falsification planning sessions. This plan builds the measurement instrument only. Arm runs, runner-dispatch work, and any scoring-harness changes are explicitly out of scope and belong to a successor plan that is written only if both kill-gates here pass.*

## Overview

This plan constructs an evaluation corpus over the OpenTraces local bucket (`~/.opentraces`, ~30GB: 1,528 trace records across 20 projects, 723,424 typed events in 3,742 batches, 243 context trees) to test the claim the existing corpora structurally cannot express: that a typed interface can be derived, and then improved through use, from agent search over a polymorphic store the model has no prior on. The corpus is persona-driven (four developer personas with jobs-to-be-done generate the intent stream, giving realistic recurrence clustering and a per-persona oracle interface), deterministically graded (every gold answer is the output of a reference solver script, never an LLM judgment), and sealed against a frozen snapshot digest. Two $0 kill-gates run before the full pack is built: a spread probe (is inline derivation expensive enough that an interface has something to amortise) and a shape probe (do trajectories over this store produce learnable, non-collapsing intent signatures).

## Problem Frame

The SaC PoC (plan 009) falsified blanket cross-session amortisation on PokeAPI: shallow helpers cost more than inline rewriting, and the surviving thesis is an evidence layer that promotes candidates selectively, only where re-derivation is expensive and recurrence is real. Testing that thesis requires a corpus where (a) the store is genuinely polymorphic and unknown to the model, (b) inline search is token-expensive (Criterion 3 from kb/br/16), (c) intents recur with family structure, (d) gold is execution-verifiable, and (e) drift is real. No wired corpus has these together: SkillCraft is clean, homogeneous, and prior-contaminated; FinChain has no store; CRAG as mounted is question-shaped, not store-shaped (kb/plans/010 and the 2026-06-09/10 planning sessions document the gap).

The OpenTraces bucket scores on all five. Its trace envelopes are deeply nested and vary by capture source (claude-code hooks vs codex_cli_rollout produce different metadata shapes); its event log is a discriminated union (13+ `event_type`s with type-specific payloads from 7 writers); its schema is private, so no frontier model has a training prior on it; its raw transcripts are large enough that the upstream project built projections specifically to avoid loading them (the existing `trace query`/`ctx`/`trail` CLI is crystallised demand, proof the questions recur); and it carries three months of real schema evolution (`SCHEMA_VERSION` stamps 0.3.0, manifest v2, `legacy_mirror` flags). We are the developer of the data source, so a held-out oracle truth is derivable, and the corpus doubles as the most product-realistic scenario we have: a developer turns datafetch on over their own data estate.

The persona framing additionally instruments the founding per-tenant claim that has never had a measuring device: different agents on the same data plane should grow different surfaces (kb/mission.md; the library-divergence metric L_n reserved since May). A persona is a tenant with a coherent intent distribution and an explicit utility function; four personas over one shared store make interface divergence, cross-persona transfer, and per-persona regret scoreable for the first time.

## Requirements Trace

- R1. **Oracle is a script, never a model.** Every gold answer in the pack is produced by a deterministic reference solver (Python, stdlib-preferred) reading only the frozen snapshot. Each solver is run twice at pack-build time and must emit byte-identical output. No LLM appears anywhere in the gold path. Solvers emit gold plus evidence pointers (file paths / trace_ids / event_sequences used).
- R2. **Frozen, sealed snapshot.** `objects/traces/v1/`, `events/v1/`, `contexts/`, `blobs/` (content-addressed bodies the context trees reference; ~10MB, included so context reads are self-sufficient), and `manifest.json` are copied from `~/.opentraces/bucket/` to `eval/opentraces/vendor/snapshot/` (gitignored). A committed `eval/opentraces/seal.json` records the upstream `bucket_digest` (manifest sha256), per-store file counts, byte totals, and the snapshot date. All solvers, probes, and (later) mounts read only the snapshot. The live bucket is never read by any eval artifact after sealing.
- R3. **Quarantined schema truth.** Phase A produces `eval/opentraces/SCHEMA-TRUTH.md`: complete store map, every event_type payload schema, cross-reference keys (trace_id, step_index, context_node_id, git anchors), version stamps and observed drift, plus a hand-derived oracle interface sketch I\* (and per-persona I\*_P). This file is committed but quarantined: it must never be mounted into an agent workspace or quoted in any agent prompt. The quarantine list lives in `eval/opentraces/README.md` so a later runner can enforce it mechanically.
- R4. **Persona pack with pre-registered predictions.** Four personas, each specified with: JTBD, cadence model (which jobs recur at what rhythm, including at least one one-off job that should never pay back), 5-8 query-shape templates with parameter slots, an explicit utility function, and a pre-registered predicted emergent interface (which helpers should crystallise if the thesis is right). Initial set: P1 FinOps optimizer (spend, waste, distillation harvest, nudges), P2 skill engineer (skill invocation outcomes, episode mining, per-skill cost), P3 sharing steward (syncability, redaction status, publication readiness), P4 attribution lead (what shipped, per-file/per-library effort, commit-to-trace blame joins). One persona (default P3, confirm at seal) is held out from any future policy tuning and used only for transfer evaluation.
- R5. **Template feasibility and blindness rules.** A template ships only if its reference solver works against the snapshot (data-groundedness beats narrative; infeasible templates are cut and logged). Question text is phrased in consumer language and must not contain raw schema field names, file paths, or store layout hints. A grep-based leak check over the pack against a deny-list derived from SCHEMA-TRUTH (field names, directory names) passes before seal.
- R6. **Pack size, siblings, and abstention cells.** At least 200 instantiated questions (target 200-400 per the paired-eval methodology report), with each template instantiated by at least 5 parameter draws (sibling structure for reuse measurement, mapping onto the family-and-level shape the existing harness speaks). At least 10% of questions are abstention/false-premise cases (asking about entities, windows, or event types that do not exist in the snapshot), graded tri-state CRAG-style: accurate +1, missing/abstain 0, incorrect -1, so governance has confidently-wrong cells to avoid. Each question record carries: question text, persona, template id, params, gold, answer_type (numeric tolerance / exact string / set / abstain), evidence pointers, and difficulty tags (single-store lookup / aggregate / cross-store join / temporal / drift-spanning).
- R7. **Two-implementation agreement.** For every template the upstream OpenTraces CLI can answer (`trace query/map/slice/get`, `ctx list/info/tree`, `trail blame/graph`), the solver output is cross-checked against the CLI on at least 3 instances. Disagreements block seal until root-caused; either outcome is logged (solver bug fixed, or upstream bug filed in the OpenTraces repo as dogfood value).
- R8. **Adversarial gold audit before seal.** An independent agent (Codex, advisory mode) attempts to refute at least 20 sampled gold answers using only the snapshot. Audit passes if 0 refutations stand (rule-of-three bound reported: 0/20 implies ≤ ~14% defect rate at 95%). The sealed pack commit includes the audit report, the persona predictions (R4), and the spread/shape probe results, constituting the pre-registration; no scored arm run may precede that commit.
- R9. **Gate G0, the spread probe (run BEFORE full pack build).** Ten questions (the user's real questions if supplied; otherwise the top template per persona plus two cross-store joins), each with a hand-written reference solver. Measure, in a fresh Claude Code session pinned to `claude-sonnet-4-6` (the house eval model; the build agent must not substitute its own model, a weaker driver inflates naive cost and biases toward PASS) over the snapshot with bash+jq+python only and no datafetch: model-context tokens and turns to a correct answer, cold (the naive inline-derivation cost). Measure the expert path: tokens and turns when the answer is one solver invocation (the oracle-interface cost). Pre-registered kill condition: if the median naive/expert token ratio is below 5x, or the median absolute spread is below 10,000 model-context tokens, the corpus is declared null-risk (the PokeAPI failure mode: nothing to amortise) and the plan STOPS with a written negative finding. Both numbers and per-question table go in the RUN-LOG before any further build.
- R10. **Gate G1, the shape probe (br/17 discipline).** At least 6 unscored sessions across at least 3 distinct templates, driven over the snapshot, with trajectories recorded and fed through the existing `extractTemplate` intent-signature pipeline offline. Kill condition: all sessions collapse to a single intent signature (the FANOUT collapse from kb/br/17), or signatures fail to separate the chosen templates into at least 2 distinct clusters. On failure: STOP, write the negative finding, and scope the substrate signature fix before any corpus investment continues.
- R11. **Construction token ledger.** The executing agent logs, per phase in the RUN-LOG, its own exploration and solver-authoring token/turn spend. This is a free upper-bound estimate of inline-derivation cost over this store and is reported alongside the G0 results.
- R12. **Privacy containment.** The snapshot is local and gitignored. Committed artifacts (pack, solvers, SCHEMA-TRUTH, probes, seal) may quote field names and minimal example values only after a secrets pass (no tokens, no credentials, no third-party code bodies, no prompt text longer than one line). Nothing from the bucket is published anywhere. OpenTraces' own security-tier design is noted as the model for datafetch's future trajectory-redaction policy, not implemented here.

## Scope Boundaries

- No changes to `src/` (substrate). Substrate-purity check applies: `git diff --stat src/` is empty over the life of this plan.
- No changes to the OpenTraces repo (read-only data source), except filing issues if R7 finds upstream bugs.
- No arm runs, no runner-dispatch work, no `sacArms.ts` / `score-cross-arm.ts` changes, no mount adapter work (the local-file adapter and the df.tool CLI-wrap compile path belong to the successor plan).
- No LLM-judged gold, no semantic/vector-search questions (deterministic answers only in v1).
- No public dataset publication and no syncing of any snapshot content off this machine.
- No more than four personas, and no md-memory arm construction here.
- No fix attempts on the intent-signature pipeline if G1 fails; that becomes a scoped substrate plan, not creep into this one.

## Context & Research

- kb/br/19: the baseline ladder and paired-eval statistics this corpus must eventually serve (200-400 paired questions, k>=5 seeds, McNemar with clustering); the source of the evidence-layer claim structure.
- kb/br/17: the precedent for G1; a $0 shape probe blocked a premature CRAG run when every trajectory collapsed to one FANOUT signature.
- kb/br/16: Criterion 3 (cost-to-derive-inline vs cost-to-call), the lens G0 operationalises.
- kb/br/20: Perplexity SaC; the substrate is commoditised, the defensible layer is governed, evidence-gated persistence, which is what this corpus is built to measure.
- kb/plans/009: the falsified blanket-amortisation PoC whose arms, parity discipline, and sealed-manifest pattern this corpus inherits; its R11 reuse-density pre-flight is the ancestor of G0/G1.
- kb/plans/010: the oracle-regret framing; this corpus is its Stage-1.5 realism instrument (real store, synthetic intents, deterministic gold), and the persona I\*_P construction resolves its generator-realism hole. The 010 commensurability objection is dissolved separately by treating prose recipes as promotion-ladder rungs, not rival systems (2026-06-10 session).
- Upstream: OpenTraces repo at `/Users/jayfarei/src/tries/2026-03-27-community-traces-hf` (Python, `src/opentraces/`), docs at opentraces.ai/docs. Its subsystem map is the persona census: Trace Intelligence = P1, skill-verifier/skill-intelligence = P2, security+publish = P3, Trail = P4.

## Architecture

```
eval/opentraces/
  README.md                  corpus overview, quarantine list, regeneration steps
  SCHEMA-TRUTH.md            quarantined: store map, event payload schemas, drift, I* sketch
  seal.json                  committed: bucket_digest, file counts, bytes, snapshot date
  personas/
    P1-finops.md             JTBD, cadence, templates, utility, predicted helpers
    P2-skill-engineer.md
    P3-sharing-steward.md    (default held-out persona)
    P4-attribution-lead.md
  templates/pack.yaml        template defs: slots, answer_type, difficulty, solver ref
  solvers/
    common.py                snapshot readers (trace envelopes, event batches, contexts)
    <template_id>.py         one deterministic solver per template
  questions/pack.jsonl       instantiated questions + gold + evidence pointers
  probes/
    spread-probe.md          G0 protocol + per-question results table
    shape-probe.md           G1 protocol + signature clustering results
  vendor/snapshot/           gitignored ~11GB frozen copy (objects, events, contexts, manifest)

experiments/episodes/04-opentraces-corpus/
  RUN-LOG.md                 append-only attempt ledger (house style from 03-sac-poc)
```

Data flow: snapshot (R2) -> Phase A excavation -> SCHEMA-TRUTH (R3) -> G0 spread probe (R9, kill-gate) -> persona pack (R4) -> solvers (R1, R5, R7) -> instantiated pack (R6) -> G1 shape probe (R10) -> adversarial audit -> seal commit (R8). Supervisor sign-off points: after SCHEMA-TRUTH, after G0, after persona redline (user), at seal.

## Milestones

1. **M0 Snapshot + seal scaffold**: copy stores to `vendor/snapshot/`, write `seal.json` (digest, inventory), add gitignore entries, scaffold episode RUN-LOG. *Effort: Short*
2. **M1 Phase A excavation**: SCHEMA-TRUTH.md complete (all stores, all observed event_types with payload schemas, cross-keys, drift inventory) plus I\* sketch; construction token ledger starts. *Effort: Medium*
3. **M2 G0 spread probe**: 10 questions + hand solvers, naive-vs-expert measurement, pre-registered kill thresholds applied, results in RUN-LOG. STOP on fail. *Effort: Short*
4. **M3 Persona pack**: four persona specs with predicted helpers; user redline gate (user adds/edits real questions; unclaimed user questions force a pack revision). *Effort: Medium*
5. **M4 Solvers + cross-check**: one solver per surviving template, determinism checks, CLI two-implementation agreement on eligible templates. *Effort: Large*
6. **M5 Pack instantiation**: ≥200 questions with siblings and abstention cells, leak check passes. *Effort: Short*
7. **M6 G1 shape probe**: 6+ unscored sessions, offline signature extraction, clustering verdict. STOP on fail. *Effort: Medium*
8. **M7 Audit + seal**: Codex gold audit, pre-registration commit (pack + predictions + probe results + audit report). *Effort: Short*

## Files to Modify

| File | Changes |
|------|---------|
| `eval/opentraces/**` (new) | Everything listed in Architecture |
| `.gitignore` | Add `eval/opentraces/vendor/` |
| `experiments/episodes/04-opentraces-corpus/RUN-LOG.md` (new) | Append-only attempt ledger |
| `kb/research.md` | One ledger row per gate verdict (G0, G1, seal), house style |
| OpenTraces repo | Read-only; issues filed only if R7 disagreements implicate upstream |

## Verification

1. `seal.json` digest matches a freshly recomputed digest of `vendor/snapshot/manifest.json`; file counts match the inventory.
2. Every solver run twice produces byte-identical gold for the full pack (`make` or script target, exit 0).
3. `questions/pack.jsonl` has ≥200 rows, ≥5 siblings per template, ≥10% abstention rows; every row's gold regenerates from its solver + params.
4. Leak check: zero deny-list hits in question text.
5. R7 cross-check log shows agreement (or root-caused, resolved disagreements) on ≥3 instances per CLI-eligible template.
6. G0 results table committed with pre-registered thresholds stated BEFORE measurement rows; verdict explicit (PASS / null-risk STOP).
7. G1 clustering result committed; ≥2 distinct signature clusters recovered, or explicit STOP finding.
8. Codex audit report committed: ≥20 samples, refutations resolved, rule-of-three bound stated.
9. `git diff --stat src/` empty across all plan commits.
10. RUN-LOG has one appended entry per attempt with date, action, observation, and decision (no rewrites of prior entries).

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale |
|---|-------|----------|---------------|-----------|-----------|
| 1 | Design | Gold from deterministic solvers, never an LLM | Methodology | Auditability | "Knowing the answer by spending tokens" is sound only if tokens buy a re-runnable answer machine; LLM-as-oracle makes the eval measure agreement-with-Claude |
| 2 | Design | Persona-derived templates over CLI-demand-derived | Realism | Evidence over fiction | Personas are reverse-engineered from subsystems the developer already built (Trace Intelligence, skill-verifier, security/publish, Trail), so recurrence claims rest on demonstrated demand |
| 3 | Design | Frozen snapshot sealed by digest | Methodology | Reproducibility | The live bucket was written to the day this plan was drafted; gold must be pinned, and the manifest already carries a sha256 digest |
| 4 | Scope | Derive-path mounts will see raw stores only; projections excluded | Scope | Fair test | The 11G search projection is the developer's derived interface; the derive path must discover structure, while the compile path (successor plan) reaches projections through the CLI |
| 5 | Scope | G0 runs before the full pack is built | Sequencing | Cheapest NO first | PokeAPI died on a spread that was never measured up front; ten questions and an afternoon settle whether anything here can amortise |
| 6 | Design | Tri-state grading with abstention cells | Metrics | Governance needs -1 cells | Adopted from CRAG (kb/br/16, cragGrader); a governed arm that abstains must be distinguishable from an ungoverned arm that confidently hallucinates |
| 7 | Design | One held-out persona (default P3) | Methodology | Anti-overfit | Any future promotion-policy tuning sees three personas; transfer to the fourth is the generalisation test |
| 8 | Scope | No harness integration in this plan | Scope | One instrument at a time | Arm runs need the runner-dispatch seam; building it before the corpus passes its kill-gates repeats the build-before-evidence mistake plan 009 documented |
| 9 | Design | Two-implementation agreement where the upstream CLI overlaps | Methodology | Strong gold | Independent implementations agreeing is the strongest cheap gold check; disagreements are dogfood value either way |
| 10 | Pending | User inputs: ten real questions; held-out persona confirmation; snapshot location confirmation (~11GB under `eval/opentraces/vendor/`) | Inputs | Persona-zero | Fallbacks defined (persona templates + redline gate) so construction is not blocked on these |
| 11 | Execution | Snapshot includes `blobs/` (deviation from drafted R2) | Architecture | Self-sufficiency | Context trees reference content-addressed blob bodies; 10MB buys P4-T5 answerability without reaching outside the seal |
| 12 | Execution | G0 driver model pinned to `claude-sonnet-4-6` | Methodology | Bias control | The build agent runs on a smaller model; measuring the naive arm with itself would inflate flailing and bias G0 toward PASS |
| 13 | Execution | Supervisor pre-executed M0, M1, persona drafts (M3 core), G0 protocol + 10 questions, and `solvers/common.py` before handover | Sequencing | Judgment density | Build agent is a smaller model; the gold-poisoning and security-sensitive artifacts (credentials exclusion, SCHEMA-TRUTH, I\* sketch, pre-registered predictions, probe design) stay with the stronger model, the mechanical work (solvers against crisp specs, instantiation, probe execution, audit assembly) is delegated |
