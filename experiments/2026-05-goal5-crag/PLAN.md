# Plan: prove the substrate is generic via a second benchmark (CRAG)

> Living document. Update when direction shifts. Companion files:
> [EXPERIMENTS.md](./EXPERIMENTS.md) (curated results),
> [EXPERIMENT_NOTES.md](./EXPERIMENT_NOTES.md) (chronological scratchpad),
> [STATUS.md](./STATUS.md) (snapshot at the start of this cycle).

## Working hypothesis

The substrate's iter164 wins on SkillCraft (matched-arm: R1 0.929,
R2 -41%, wall-clock -17%, R3 0.016) are *generic* properties, not
SkillCraft-specific over-fits. CRAG is the falsifier: a second benchmark
with a wildly different surface (4,409 questions × 5 domains × 8 question
types × 600+ templates over a 2.6M-entity mock KG) and a strong correctness
signal (tri-state +1/0/-1 grader, frontier SOTA 34-47%).

If the SAME substrate code produces matched-arm wins on CRAG **and** holds
the SkillCraft baseline, the generic-substrate claim is empirically supported.
If CRAG forces substrate changes that regress SkillCraft, the substrate is
benchmark-specific — and we identify which assumption was load-bearing for
SkillCraft only.

## P1 — iter1: re-probe substrate state under main (no substrate change)

**Hypothesis:** br/17's findings (FANOUT(tool) signature collapse, literal
data-shape-clone helper, helper-name collision skip) replicate on main's
substrate state. If they don't, the probe story is different and we need to
re-read main's observer code before designing iter2.

**Lever:** measurement only. No substrate change. Run
`scripts/crag-probe/crag-shape-probe.ts` against this worktree's substrate.

**Setup:**
- This worktree, `main` substrate (commit `ed2b6b5f3`).
- `pnpm tsx scripts/crag-probe/crag-shape-probe.ts`.
- Capture the same 7 trajectories' authoring outcomes.

**Success:** EXPERIMENTS.md row `EN1: re-probe under main` lands with one of:
- (A) Same findings as br/17 (signature collapse, clone helper, collision skip).
  Implication: substrate gap is real and on main; iter2 attacks it.
- (B) Different findings (e.g. main authors a richer helper, signature
  differentiates). Implication: br/17 was specific to the branch; re-document
  the gap as of main; iter2 may be different.

**Stop:** one probe run. The branch decision (whether to keep the gap list
from br/17 or rewrite it) depends entirely on this result.

## P2 — iter2: mock-API modeling decision

**Hypothesis:** Modeling CRAG mock APIs as `df.db.cragFinance.companies.findExact(...)`
(rather than `df.tool.cragFinance.getCompanyInfo(...)`) routes CRAG
trajectories through `FANOUT(db) → FANOUT(tool) → lib` shapes that match
`recordToolFanout` / `recordToolEnrichment` / `recordToolLookup` (3 of 5
substrate templates). This is br/16's recommendation and br/17's 1-hour
follow-on prediction.

**Lever:** harness-only. Build a small in-memory `MountAdapter` exposing
CRAG mock-API responses as collections; re-run the same 7 trajectories under
`db.*` modeling. Substrate untouched.

**Setup:**
- New script: `scripts/crag-probe/crag-shape-probe-db.ts`. Mirrors the
  existing `tool.*` probe but builds `cragFinance.companies` /
  `cragMovie.persons` / etc. as `CollectionHandle` stubs.
- Author signature comparison vs `tool.*` probe.

**Success:**
- (A) `db.*` probe authors structurally-different helpers per question type
  (signatures differentiate into `db→db`, `FANOUT(db)→FANOUT(tool)`, etc.).
  Pick `db.*` for the adapter (P4).
- (B) `db.*` probe collapses the same way as `tool.*`. Both modelings hit
  the same signature-collapse gap. Iter3 attacks the gap directly (refine
  `computeIntentSignature`).

**Stop:** one probe run.

## P3 — P5: build the harness

**P3 — Vendor CRAG dataset.** Download `crag_task_*.jsonl.bz2` from
facebookresearch/CRAG. Keep the public split (validation + public test =
2,706 records). Store under `eval/crag/vendor/`. Validate the schema matches
the canonical record shape (`interaction_id`, `query`, `answer`, `alt_ans`,
`domain`, `question_type`, `static_or_dynamic`, `popularity`,
`search_results`).

**P4 — Build CRAG adapter (`src/eval/cragFullDatafetch.ts`).** Mirror
`src/eval/skillcraftFullDatafetch.ts`'s structure. Per chosen modeling,
expose mock APIs as substrate primitives. Support `--on/--off` matched-arm
flags. Emit per-question artefacts under `eval/crag/results/<run-id>/`
matching the SkillCraft per-run layout. Drive an agent (Claude `sonnet-4-6`,
`claude-p`) over each CRAG question, capture trajectory, score, save.

**P5 — Build CRAG scorer + R10 calibration.** Mirror `score-r1-r9.ts`
patterns. Implement CRAG's tri-state grader (+1 correct / 0 missing / -1
incorrect-or-hallucination). Add R10 Brier calibration. Emit per-domain ×
question-type × popularity × dynamism slicing in the report.

## P6 — Small-N probe (50 questions, matched-arm)

**Hypothesis:** Whatever substrate failure-mode constellation the LLM-driven
run surfaces, it lands within the small-N probe. Cheaper to find at this
scale than at 2,706.

**Setup:**
- 5 domains × 2 question types × 5 instances = 50 questions, stratified.
- Both arms: `--on` (substrate observer + lib-cache live) and `--off`
  (substrate-OFF env vars set).
- Single Anthropic API key, sequential. Estimate ~$5-15 API time.

**Success criterion:** the first paired-comparison report exists at
`eval/crag/results/<run-id>/paired-comparison.md`. Read whatever the
constellation actually says.

## P7 — substrate iteration loop

Per the cycle workflow in `experiments/README.md` § "How a goal cycle works",
extended with the SkillCraft non-regression gate. Iterate substrate changes
until the Goal 5 threshold is plausibly met on small-N. Every iteration:

1. Read latest `EXPERIMENTS.md`.
2. State hypothesis in `EXPERIMENT_NOTES.md` (stage: `hypothesis`).
3. Implement against substrate (`src/observer/`, `src/snippet/`, `src/hooks/`,
   `src/eval/`). **Reject any benchmark-specific shortcut.**
4. Probe on a single CRAG domain.
5. Validate on a held-out domain pair.
6. Re-run small-N CRAG matched-arm.
7. Re-run SkillCraft full-126 on the same substrate hash; assert iter164/P1
   baseline holds.
8. `pnpm typecheck` + `pnpm test` clean.
9. Append iteration row to `EXPERIMENTS.md`.

Stop when: substrate-ON beats substrate-OFF on ≥3/4 axes AND R7 helper-reuse
fires AND SkillCraft baseline holds AND tests pass.

## P8 — full eval

Scale to 2,706 public split. Generate final `paired-comparison.md`. Submit
results.

## Decision log (live)

- **2026-05-18:** Cycle started. Worktree at `.claude/worktrees/eval+crag/`
  from `main`. Branch `worktree-eval+crag`. Goal 5 condition string
  registered. Cycle dir + harness scaffolded.
- **2026-05-19 iter1 (e1):** br/17 findings replicate as-written under main.
  PASSED finding (A) — substrate gap is real and on main. Proceed.
- **2026-05-19 iter2 (e2):** db.* modeling probe. INCONCLUSIVE. Pure tool.*
  collapses to one toolFanout; pure db.* gets unique names but
  single-call degenerate bodies. **Real gap = render-function coverage**
  for non-FANOUT-tool shapes. Iter3+ stops further synthetic probes.
- **2026-05-19 iter3 (e3):** vendor CRAG dataset. PASSED. 2,706 records.
  popularity field MISSING — rubric updated.
- **2026-05-19 iter4 (e4):** substrate plumbing smoke (hand-authored, no
  LLM). PASSED 5/6 +1. CragWebMount + scoreTriState work; the smoke
  proves the substrate composes against CRAG records end-to-end.
- **2026-05-19 iter5 (e5):** claude-p driver single-question. PASSED
  plumbing; -1 score (gold itself may be noisy per real NBA records).
- **2026-05-19 iter6 (e6 smoke):** k=3 parallel runner with replay mutex.
  PASSED infra; 8/8 hit 180s timeout (random first-4 records all finance/
  real-time). Race condition discovered + fixed via process-wide mutex
  on snippet replay phase.
- **2026-05-19 iter6 (e6 full, running):** full 50-record small-N kicked
  off, ETA ~100 min. Predicted outcome based on iter1+iter2 substrate
  gap: 4-vector {NEUTRAL,NEUTRAL,NEUTRAL,NEUTRAL} + R7 FAIL because no
  helpers crystallise under current substrate. Establishes baseline for
  iter7's substrate-fix iteration.

## Iter7+ planning (substrate render-function fix)

Per iter1+iter2 findings, the substrate has render-function coverage for
the 5 templates (toolFanout, toolFanoutEnrichment, recordToolFanout,
recordToolEnrichment, recordToolLookup) but NONE matches the natural
CRAG-shape trajectories (`FANOUT(db)`, `db→db`, `FANOUT(db)→compute`,
`db→validate`). The result is either:
- silent name-collision skip (tool.*-modeled trajectories), OR
- single-call degenerate body (db.*-modeled trajectories)

**Iter7 hypothesis:** Adding a generic `renderDbFanOutSource` (mirror
toolFanout's full-trajectory render pattern but for db.* calls) lets the
substrate crystallise FANOUT(db) trajectories into helpers that capture
the full sequence + parameterise over entity values + emit intent-shape
input contract per iter150+ pivot. This is a GENERIC fix (not CRAG-
specific) and will benefit any future db.*-heavy benchmark.

**Iter7 lever:** observer-side. Edit `src/observer/author.ts` to add
`renderDbFanOutSource` mirroring `renderToolFanOutSource`'s structure
(lines 1239-1370). Add `dbFanout` to the known-helper signature map
in `src/observer/template.ts`.

**Iter7 gate:** SkillCraft full-126 re-run on the new substrate hash
must hold iter164/P1 baseline. The fix CANNOT regress R1 ≥ 0.929, R2
tokens, R3 errors. If it does, the fix is benchmark-specific in
behavior (even if the code looks generic) and must be rolled back.

**Iter7 success:** small-N re-run on new substrate authors ≥ 1 helper
on at least one CRAG sibling-template family. R7 > 0 minimal threshold.
Then iter8+ measures the correctness/cost delta.

## Iter8+ planning (LLM-judge augmentation)

iter5/iter6 showed rule-based scorer brittleness (Nash 2.2 vs gold 4
edge case; comparison questions with paraphrased answers). LLM-judge
augmentation:
- Take rule-based-tri-state as primary
- For 0 / -1 questions, run a small claude-haiku-4-5 judge call asking
  "is this answer semantically equivalent to the gold? +1/0/-1?"
- Report BOTH rule-based and LLM-judge-augmented; rule-based is primary
  for the paired-comparison test (no judge variance)
- Cost: ~$0 on Max plan; ~5s per scoring call; ~100 calls for small-N

Defer to iter8 because: (a) infrastructure dependency on small-N
baseline, (b) doesn't change the substrate so doesn't need a SkillCraft
re-run, (c) more useful when we know whether the substrate-ON arm is
producing answers worth re-judging.

## Iter9+ planning (full eval scale-up)

When small-N stable on substrate-ON ≥ substrate-OFF and R7 > 0:

- Scale to 2,706 questions (10x small-N).
- Expected wall-clock: ~10-15 hours.
- Cost: $0 on Max plan, but stress on Claude rate limits.
- Use 3 workers + 180s timeout (proven config from small-N).
- Generate final paired-comparison.md at eval/crag/results/<runId>/.
- SkillCraft full-126 re-run on the SAME substrate hash to gate.
- This is the Goal 5 verification surface.
