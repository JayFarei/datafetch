---
title: "feat: FinChain Eval Harness Integration"
summary: "Stand up a FinChain evaluation harness mirroring eval/skillcraft/ so the substrate is proven generic across two unrelated public benchmarks on a single commit."
type: feat
status: in-progress
date: 2026-05-18
related_research:
  - kb/br/16-post-skillcraft-benchmark-selection.md
  - kb/br/06-bird-finqa-corpus.md
---

# FinChain Eval Harness Integration

## Overview

Build `eval/finchain/` mirroring `eval/skillcraft/`'s shape (runner, scripts, paired-arm pattern, per-tenant lib-cache, 4-shard parallel execution) so the same substrate code lifts published baselines on a *second*, structurally different public benchmark while preserving the SkillCraft iter164 result. This is the engineering deliverable that backs the commercial-release argument: "same substrate, no benchmark-specific identifiers, two unrelated benchmarks both pass." The execution-level plan with per-iteration hypothesis schedule lives in `experiments/PLAN.md` § Goal 5; this document is the product-level scope, requirements trace, and integration architecture.

## Problem Frame

Goal 4 (closed 2026-05-17 MET on iter164) proved the learning loop fires under a learning-honest rubric (R1-R9) on a single public benchmark (SkillCraft). The P1 matched-arm comparison `{NEUTRAL, PASS, PASS, NEUTRAL}` showed the substrate's measurable contribution under a strong agent backend is cost efficiency (-41% tokens, -17% wall-clock), not correctness — SkillCraft's pass-rate headroom on Claude sonnet-4-6 at low effort is too narrow for a correctness signal. The P2 product-flow cross-eval on jsonplaceholder revealed a separate gap: agents pick helpers iff `effort-to-call < effort-to-derive`, so thin auto-crystallised wrappers get bypassed in favour of inline rewrites.

The commercial-release argument the project must support is that the substrate generalises across data shapes, agent backends, and benchmark surfaces *without* benchmark-specific code paths. One benchmark (SkillCraft) is insufficient evidence: a reviewer can reasonably ask whether the substrate is over-fit to SkillCraft's per-entity fan-out structure even after Goal 4's data-shape-agnostic intent-signature redesign. FinChain (arxiv:2506.02515) is a structurally unrelated public benchmark — symbolic financial reasoning over 290 parameterised templates × 10 seeds = 2,900 instances, with frontier models documented to break on Advanced (4-step) templates — that provides the compositional-correctness headroom SkillCraft now lacks. Selection rationale and verified dataset shape probe are in `kb/br/16-post-skillcraft-benchmark-selection.md`.

## Requirements Trace

- **R1.** A FinChain harness at `eval/finchain/` mirrors `eval/skillcraft/`'s directory layout file-for-file (README.md, protocol.md, rubric.md, runbook.md, configs/, manifests/, adapters/, scripts/, reports/, results/, vendor/).
- **R2.** A new runner `src/eval/finchainFullDatafetch.ts` parallels `src/eval/skillcraftFullDatafetch.ts`'s argument shape, backend selection (codex / claude / codex-direct), lib-cache hydration / persistence, and `DATAFETCH_DISABLE_LEARNING=1` paired-arm control.
- **R3.** A new mount adapter `src/eval/finchainRecords.ts` parallels `src/eval/evalRecords.ts`; converts a FinChain template instance into the `EvalRecord` shape so `df.db.records` is populated identically to SkillCraft.
- **R4.** pnpm scripts `eval:finchain`, `eval:finchain:prepare`, `eval:finchain:normalize`, `eval:finchain:analyze`, `eval:finchain:report`, `eval:finchain:verify` exist and run.
- **R5.** A new smoke `src/observer/__smoke__/finchain-mount.ts` runs against a single FinChain template instance and is included in `pnpm test`. `pnpm test` count is ≥ 7 smokes + ≥ 374 vitest.
- **R6.** The FinChain scorer `eval/finchain/scripts/score-finchain.ts` produces a `finchain-scorecard.json` with FC1 (FAC vs paper baseline), FC2 (step-alignment vs paper baseline), FC3 (substrate-ON > substrate-OFF, paired-t p<0.05 on FAC + ≥10% tokens-or-wall-clock reduction), FC4 (cross-benchmark transfer evidence), FC5 (SkillCraft regression check). Reuses `eval/skillcraft/scripts/score-r1-r9.ts` via shared import for the R1-R9 portion.
- **R7.** On a single substrate commit, both `pnpm eval:finchain:analyze` AND a regression `pnpm eval:skillcraft:analyze` produce scorecards where R1-R9 + FC1-FC5 all PASS under `cacheBoundedByFramework`.
- **R8.** Goal 4's forbidden behaviours list applies to BOTH SkillCraft and FinChain identifiers; no substrate code may pattern-match on family / template / topic / tool identifiers from either benchmark.
- **R9.** `pnpm typecheck` clean on every iteration; `pnpm test` green on every iteration; working tree committed on every iteration.

## Scope Boundaries

- **No** modification of SkillCraft task definitions, seeds, or `eval/skillcraft/configs/`; SkillCraft is the regression-check anchor, not a co-iterated benchmark.
- **No** changes to `experiments/archive/2026-05-goal4-skillcraft/` historical content.
- **No** changes to `experiments/goal.md` until Goal 5 closes met (then a Goal 5 section is appended).
- **No** vendoring of FinChain templates into our repo as a hard copy; use a pinned git clone or submodule under `eval/finchain/vendor/finchain/`.
- **No** benchmark-specific branching in shared substrate (`src/observer/`, `src/snippet/`, `src/hooks/`, `src/sdk/`, `src/discovery/`, `src/server/`, `src/runtime/`). Only `src/eval/finchainFullDatafetch.ts` and `src/eval/finchainRecords.ts` may import from `eval/finchain/`.
- **No** B2 (insight layer) or B3 (cold-to-warm product flow) work until Goal 5 closes; they remain deferred per the PLAN.md supersede note.

## Context & Research

- `kb/br/16-post-skillcraft-benchmark-selection.md` — benchmark selection rationale, verified dataset shape probe (290 templates × 10 seeds = 2,900 instances; 12 domains × 58 topics; Basic/Intermediate/Advanced difficulty progression; published frontier baselines available at https://mbzuai-nlp.github.io/finchain/leaderboard.html; ChainEval metric for FAC + step-alignment).
- `experiments/STATUS.md` — Goal 4 iter164 baseline state (R1-R9 PASS under `cacheBoundedByFramework`); P1 paired-comparison evidence (-41% tokens / -17% wall-clock); P2 product-flow finding (effort-to-call < effort-to-derive).
- `experiments/PLAN.md` § Goal 5 — execution-level iteration schedule, per-iteration cadence, full forbidden behaviours list, what "done" looks like checklist.
- `kb/br/06-bird-finqa-corpus.md` — prior multi-corpus decision (BIRD + FinQA + supply-chain spine) that established the cross-collection polymorphism precedent.
- `eval/skillcraft/` — reference implementation that the FinChain harness mirrors.
- `src/eval/skillcraftFullDatafetch.ts` — reference runner for the new `finchainFullDatafetch.ts`.

## Architecture

The FinChain harness is a sibling of `eval/skillcraft/` with identical structural shape. Substrate code is shared and benchmark-agnostic; only the runner + mount adapter + scorer are FinChain-aware, and those live exclusively under `src/eval/finchain*` and `eval/finchain/`.

```
Repo root
├── eval/
│   ├── skillcraft/                    — unchanged (regression check anchor)
│   └── finchain/                      — NEW
│       ├── adapters/                  — FinChain template → df.db env wiring
│       ├── configs/                   — model configs (mirrors skillcraft/)
│       ├── manifests/                 — per-instance task manifests (generated)
│       ├── reports/                   — committed analysis JSONs
│       ├── results/                   — gitignored per-run base dirs
│       ├── scripts/                   — prepare/normalize/analyze/report/verify
│       │   ├── score-finchain.ts      — FC1-FC5 scorer (NEW)
│       │   ├── score-r1-r9.ts         — re-exports from eval/skillcraft/scripts/
│       │   └── p1-paired-analysis.py  — re-uses skillcraft script
│       ├── vendor/finchain/           — pinned clone of mbzuai-nlp/finchain
│       ├── protocol.md, rubric.md, runbook.md, README.md
│
├── src/
│   ├── eval/
│   │   ├── skillcraftFullDatafetch.ts — unchanged
│   │   ├── evalRecords.ts             — unchanged
│   │   ├── finchainFullDatafetch.ts   — NEW (parallels skillcraft runner)
│   │   └── finchainRecords.ts         — NEW (parallels evalRecords)
│   ├── observer/, snippet/, hooks/, sdk/, discovery/, server/, runtime/
│   │                                  — generic edits only (benchmark-agnostic)
│   └── observer/__smoke__/
│       └── finchain-mount.ts          — NEW (joins the 6 existing smokes)
│
├── experiments/
│   ├── PLAN.md                        — § Goal 5 (iter 0 deliverable, DONE)
│   ├── EXPERIMENTS.md                 — one entry per Goal 5 iteration
│   ├── EXPERIMENT_NOTES.md            — chronological per-attempt log
│   └── archive/2026-05-goal5-finchain/
│       └── headline-rows.md           — NEW (mirrors goal4 archive)
│
└── kb/plans/007-finchain-integration.md — this document
```

| Component | Responsibility |
|-----------|---------------|
| `src/eval/finchainFullDatafetch.ts` | Runner: argument parsing, agent backend selection (codex/claude/codex-direct), per-template episode launch, lib-cache hydration/persistence, `DATAFETCH_DISABLE_LEARNING=1` control toggle, trajectory write |
| `src/eval/finchainRecords.ts` | Mount adapter: convert FinChain template instance (parameter state + gold trace) into `EvalRecord` rows; populate `df.db.records` |
| `eval/finchain/scripts/score-finchain.ts` | FC1-FC5 scorer; reads `normalized.jsonl` + gold ChainEval references; emits `finchain-scorecard.json` |
| `eval/finchain/scripts/prepare-finchain.sh` | Clone vendor, generate per-instance manifests under `eval/finchain/manifests/` |
| `src/observer/__smoke__/finchain-mount.ts` | Single-template smoke: mount, run one episode, assert trajectory contains `df.db.records` access + a `df.lib.*` call or substrate-rooted chain |
| `eval/finchain/scripts/p1-paired-analysis.py` | Re-uses `eval/skillcraft/scripts/p1-paired-analysis.py` via shared logic; computes paired-t / McNemar on FinChain `normalized.jsonl` |
| Substrate (`src/observer/`, `src/snippet/`, ...) | UNCHANGED in shape; any new lever (e.g. composition-density gate) must be benchmark-agnostic and proven not to regress SkillCraft iter164 |

## Milestones

These mirror the iteration schedule in `experiments/PLAN.md` § Goal 5 but at product-deliverable granularity. The PLAN.md iter table is the day-to-day operational view; this is the milestone view a stakeholder cares about.

1. **M1 — Documentation foundation.** PLAN.md § Goal 5 section, this kb/plans/007 doc, archive scaffolding, EXPERIMENT_NOTES entry. *Effort: Short (< 4h). DONE in iter 0.*
2. **M2 — Mount adapter design.** Dataset study, EvalRecord shape decision, family/level mapping (Basic/Intermediate/Advanced ≈ e/m/h), protocol.md. *Effort: Medium (< 1d). Iter 1.*
3. **M3 — Harness skeleton.** `eval/finchain/` tree, `src/eval/finchainFullDatafetch.ts`, `src/eval/finchainRecords.ts`, pnpm scripts, `finchain-mount.ts` smoke. Vendor clone of `mbzuai-nlp/finchain`. `pnpm test` green with 7 smokes. *Effort: Large (> 1d). Iter 2.*
4. **M4 — Single-topic probe + scorer.** `score-finchain.ts` produces numbers on a single Intermediate-tier topic under both arms. Paired-arm smoke at ~30 episodes. *Effort: Medium. Iter 3.*
5. **M5 — Baselines + first bilateral scorecard.** Substrate-OFF and substrate-ON full runs at chosen size; SkillCraft regression check on same substrate SHA; first FC1-FC5 numbers. *Effort: Large. Iters 4-5.*
6. **M6 — Substrate iteration loop.** Each iteration targets a failing FC gate, implements via composition-density or existing Goal 4 levers, bilateral non-regression check. *Effort: ~5-10 iterations. Iters 6+.*
7. **M7 — Goal 5 declared MET.** R1-R9 + FC1-FC5 all PASS on a single substrate commit, surface checklist complete, STATUS.md updated. *Effort: 1 iteration to verify + document. Final.*

## Files to Modify

| File | Changes |
|------|---------|
| `experiments/PLAN.md` | Append § Goal 5 (DONE in iter 0). Update `## Next phase` header with SUPERSEDED note (DONE in iter 0). |
| `kb/plans/007-finchain-integration.md` | NEW: this document (DONE in iter 0). |
| `experiments/archive/2026-05-goal5-finchain/headline-rows.md` | NEW: per-iteration headline table skeleton (iter 0). |
| `experiments/EXPERIMENT_NOTES.md` | Append iter 0 attempt block (and subsequent iteration blocks). |
| `experiments/EXPERIMENTS.md` | Append G5.N entries per iteration. |
| `experiments/STATUS.md` | Update only on Goal 5 close. |
| `eval/finchain/**` | NEW: entire harness tree (iters 2-3). |
| `src/eval/finchainFullDatafetch.ts` | NEW: runner (iter 2). |
| `src/eval/finchainRecords.ts` | NEW: mount adapter (iter 2). |
| `src/observer/__smoke__/finchain-mount.ts` | NEW: smoke (iter 2). |
| `src/eval/skillcraftFullDatafetch.ts` | Possibly: extract shared paired-arm helpers into a sibling module if both runners benefit (iter 2-3 design call). |
| `src/observer/`, `src/snippet/`, `src/hooks/`, `src/sdk/`, `src/discovery/`, `src/server/`, `src/runtime/` | Generic edits per substrate iterations (iters 6+); benchmark-agnostic always. |
| `package.json` | Add 6 new pnpm scripts under `eval:finchain:*` (iter 2). |

## Risk + Mitigation

- **Risk:** FinChain templates don't map cleanly to the `EvalRecord` shape because they're symbolic-reasoning instances (parameter state + gold trace), not entity-list workspaces. **Mitigation:** Iter 1's mount-adapter design milestone produces an explicit protocol.md before any runtime code; if the shape doesn't fit, the protocol describes the adaptation (e.g. expose template parameters as `df.db.records` rows with metadata, expose ChainEval gold trace via a separate `df.db.goldTrace` mount, or treat the template body as the workspace and gold trace as the evaluator-side reference).
- **Risk:** The bilateral non-regression check makes each iteration expensive (FinChain run + SkillCraft full-126 = 2-4 hours of compute). **Mitigation:** Sub-sample FinChain (~150 instances per iteration, full 2,900 only at declare-met) and treat SkillCraft regression as an after-iteration cadence step that may run overnight; iteration commits happen on the substrate change, the bilateral scorecard catches up.
- **Risk:** Composition-density lever regresses SkillCraft's `toolFanout` crystallisation (which is currently the load-bearing helper for -41% tokens). **Mitigation:** The lever is gated by a measurable rich-vs-thin threshold; if `toolFanout` falls below the threshold the gate is tuned (not the substrate identifier-keyed); SkillCraft non-regression check catches it in the same iteration.
- **Risk:** FinChain paper baselines on `mbzuai-nlp.github.io/finchain/leaderboard.html` move or are revised. **Mitigation:** Snapshot the baseline numbers into `eval/finchain/rubric.md` at iter 1 with the date and source; FC1/FC2 score against the snapshot, not the live leaderboard.

## Open Questions

- **How many FinChain instances per arm per iteration?** Iter 1 dataset-study deliverable. Tentative answer: 150-200 (matched-size sub-sample of the 2,900 full corpus, weighted toward Intermediate + Advanced where the substrate advantage is concentrated).
- **Which topic for the fixed-pair validate?** Pick at iter 1. Tentative: `investment_analysis/ci.py` template 3 (Intermediate; clean structure; widely-recognised concept).
- **Is the composition-density lever an iter 6+ deliverable or earlier?** Depends on what iter 5's first bilateral scorecard surfaces. If FC1/FC2 are close to the paper baseline on Basic templates and missing on Intermediate/Advanced, composition-density goes iter 6. If FC3 fails (substrate not beating control on FinChain), composition-density may be iter 4-5.
- **Cross-benchmark `__intent__` pool?** Goal 4 introduced a shared per-intent-signature helper pool across SkillCraft families; for Goal 5 the natural extension is a cross-*benchmark* `__intent__` pool that serves both SkillCraft and FinChain. Iter 2 architecture decision: implement as a single pool (cleaner; tests FC4 transfer directly) or two pools (safer; ships the FC4 evidence as a deliberate iteration). Tentative: single pool, since FC4 is the load-bearing cross-benchmark gate.

## How This Maps to Goal 5

This document is the *what* and *why*. `experiments/PLAN.md` § Goal 5 is the *how* — per-iteration hypothesis schedule, lever surface, cadence rules, forbidden behaviours, surface-before-declaring-met checklist. Both stay in sync as iterations land; the headline-rows table at `experiments/archive/2026-05-goal5-finchain/headline-rows.md` is the public face of progress.
