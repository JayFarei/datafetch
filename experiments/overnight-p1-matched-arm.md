# GOAL P1 — Matched-arm performance proof on SkillCraft

> Full spec for the overnight P1 goal. Referenced from the bootstrap
> prompt; this is the canonical version. Branch
> `goal4-p1-matched-arm-skillcraft`.

## What you're proving

The substrate's learning loop produces measurable, multi-dimensional
performance improvement on SkillCraft tasks versus a vanilla agent
running the same backend on the same prompts with no substrate
learning enabled.

This is NOT a pass/fail rubric check. This is CAUSAL EVIDENCE
PRODUCTION — the missing experiment that should have been run before
declaring Goal 4 MET. Codex's 2026-05-17 review identified this as the
single most important "graduation" experiment.

The substrate is asserted to provide:
1. higher pass rate at scale (R1)
2. lower effective tokens per task (R2)
3. lower wall-clock per task (latency — currently un-measured)
4. lower output variance across re-runs (consistency)

P1 must produce quantified, paired evidence for ALL FOUR dimensions or
characterise honestly which dimensions show no improvement.

## Current state (2026-05-17)

Head commit: `88083177` (docs sync). Last substrate commit `4fc0febd`.
Substrate state:
- 4 generic patches landed (success/ok-envelope unwrap, multi-line
  `??`/`||` rewriter, generic `rowsOf`, String() coercion)
- 5 helper templates (toolFanout / toolFanoutEnrichment /
  recordToolFanout / recordToolEnrichment / recordToolLookup)
- ReGAL coverage-density gate + PSN maturity gate — inert at probe
  scale
- Scorer tightened: R8 dual gate (mean ≤0.70 AND per-pair fraction
  ≥0.70), `cacheBoundedByFramework` qualification, benchmark envelope
  keys removed

iter164 declared Goal 4 MET on Claude full-126 under
`cacheBoundedByFramework`. iter161 (same substrate, ~24h earlier) was
5/8 because of Anthropic 500 errors.

Read in order before doing anything:
- `experiments/experiment-history.md` (the chronological arc, 660 lines)
- `eval/skillcraft/rubric.md` (what R1-R9 + qualifications measure)
- `kb/docs/intent-shape-interface.md` (the helper authoring pivot)
- `experiments/STATUS.md`, `experiments/PLAN.md`

## Architecture pieces

- `src/eval/skillcraftFullDatafetch.ts` — eval harness
- `eval/skillcraft/configs/arms.yaml` — arm definitions
- `eval/skillcraft/scripts/normalize-results.ts` — per-episode rows
- `eval/skillcraft/scripts/analyze-results.ts:161` — paired-arm
  contrast already exists; reuse it
- `eval/skillcraft/scripts/score-r1-r9.ts` — R1-R9 + qualifications
- `DATAFETCH_AGENT=claude` + `CLAUDE_CLI=claude-p` bypasses
  `claude --print` rate limit
- `DATAFETCH_INTERFACE_MODE=hooks-draft` is canonical

**CHECK FIRST:** does a no-substrate arm already exist in
`arms.yaml`? Run `cat eval/skillcraft/configs/arms.yaml` + grep the
harness for arm dispatch. If `skillcraft-base` or similar already
implements no-learning, USE IT — don't rebuild.

If not, the minimum addition: `DATAFETCH_DISABLE_LEARNING=1` env
flag in `src/eval/skillcraftFullDatafetch.ts` that:
- skips `hydrateFamilyLibCache`
- skips `installObserver`
- renders `df.d.ts` without learned interfaces
- renders the prompt without the learned-reuse surface
- emits normalized rows with `arm: "datafetch-control"`

## Inviolable constraints

1. **No R1-R9 threshold or qualification rule changes.** Measurement
   bar is fixed.
2. **No substrate behaviour changes** (observer, gate, template,
   author, snippet runtime, hook registry). P1 is measurement-only.
   The no-learning toggle is the only allowed substrate change.
3. **No benchmark identifiers** in any code path (family names, task
   IDs, tool names).
4. **No bypassing the observer or hook registry** for the learned
   arm — it must run exactly as iter164 did.
5. **No cherry-picking families.** Same task set for both arms.
6. **Same backend** for both arms (don't compare claude vs
   codex-direct).
7. **Preserve dirty worktree.** Don't reset/revert unrelated edits.
8. **Never push to remote.**
9. **Never `--no-verify` or `--no-gpg-sign`.**

## Execution plan (high parallelism)

### Phase 0 — Bootstrap (you, 15 min)
- Read the docs + `arms.yaml` + `skillcraftFullDatafetch.ts` header
- Verify `pnpm typecheck` + `pnpm test` green
- Run `bun /Users/jayfarei/src/tries/2026-02-05-test-usage-via-cli/packages/cli/dist/cli.js usage-check`
  to confirm Claude weekly capacity for ~2 full-126 runs

### Phase 1 — Verify or implement no-learning arm (subagent, ~30 min)
Spawn ONE general-purpose subagent:

> "Check `eval/skillcraft/configs/arms.yaml` and
> `src/eval/skillcraftFullDatafetch.ts` to determine if a no-substrate
> (vanilla-agent) arm exists. If yes, document the invocation. If no,
> implement `DATAFETCH_DISABLE_LEARNING=1` env flag: skip
> hydrateFamilyLibCache, skip installObserver, render `df.d.ts`
> without any `df.lib.*` learned interfaces, render the prompt
> without any learned-reuse surface, emit normalized rows with
> `arm: 'datafetch-control'`. Run a tiny smoke (1 family × 1 level)
> under each arm to confirm both work. Report back with exact env-var
> + CLI invocation for each arm."

### Phase 2 — Run matched eval in parallel (~30 min wall, ~60 min budget)
Use `scripts/parallel-eval.sh` shape. Launch TWO eval processes via
`Bash run_in_background`:

**Arm A — substrate ON:**
```
DATAFETCH_AGENT=claude CLAUDE_CLI=claude-p \
DATAFETCH_PROMPT_MODE=brief DATAFETCH_INTERFACE_MODE=hooks-draft \
DF_SKILLCRAFT_CLAUDE_MODEL=claude-sonnet-4-6 \
DF_SKILLCRAFT_CLAUDE_EFFORT=low \
pnpm eval:skillcraft -- --live --out-dir \
  eval/skillcraft/results/datafetch/goal4-p1-armA-substrate-on-20260517 \
  --timeout-ms 300000
```

**Arm B — substrate OFF:**
Same env + `DATAFETCH_DISABLE_LEARNING=1` OR the existing control
arm invocation.
```
--out-dir eval/skillcraft/results/datafetch/goal4-p1-armB-substrate-off-20260517
```

Both arms: ALL 21 families × 6 levels = 126 episodes each.

**CRITICAL:** instrument wall-clock per episode. The harness already
writes `elapsedMs` to `agent/usage.json`; ensure it surfaces in
`normalized.jsonl`. If not, add `wallClockMs: number` to
`NormalizedRow` in `normalize-results.ts` (measurement augmentation,
not rubric change).

### Phase 3 — Score + analyse (you, 30 min)
For each arm, full diagnostics pipeline:
```
RUN=<arm-out-dir>
pnpm exec tsx eval/skillcraft/scripts/normalize-results.ts --datafetch-run $RUN --out $RUN/normalized.jsonl
pnpm exec tsx eval/skillcraft/scripts/walk-artifacts.ts --run $RUN --out $RUN/helper-instrumentation.jsonl
pnpm exec tsx eval/skillcraft/scripts/intent-cluster-analysis.ts --run $RUN --out $RUN/intent-clusters.json
pnpm exec tsx eval/skillcraft/scripts/score-r1-r9.ts --run $RUN --out $RUN/r1-r9-scorecard.json
pnpm exec tsx eval/skillcraft/scripts/fanout-slot-diagnostics.ts --run $RUN --out $RUN/fanout-slot-diagnostics.json
```

Then produce the paired comparison artifact at
`eval/skillcraft/results/datafetch/goal4-p1-paired-comparison-20260517.md`:

**Table 1 — Headline deltas:**
| Metric | Arm A | Arm B | Δ | %impr |
|---|---|---|---|---|
| R1 pass rate | | | | |
| R2 mean effective tokens | | | | |
| Wall-clock mean per task | | | | |
| Cost variance (stddev) | | | | |

**Table 2 — Per-tier (train/warm/hard):** pass rate, mean tokens,
mean wall-clock per tier × per arm

**Table 3 — Per-family (21 families):** pass rate, mean tokens per
arm; highlight families where A beats B by >10pp and families where
B beats A (substrate anti-patterns — surface honestly)

**Table 4 — Statistical confidence:**
- Pass rate: paired sign test or McNemar on per-task agreement
- Tokens: paired t-test on per-task token delta
- Wall-clock: paired t-test
- Report p-values; if N=126 gives weak power for any dimension,
  note it

## Success criteria (progressive, not binary)

The goal does NOT pass on a single threshold. It produces evidence
across 4 dimensions; the verdict is summary-and-honesty.

Per dimension:
- **PASS** (strong evidence): arm A advantage ≥ 10% relative;
  p < 0.05
- **MARGINAL** (weak evidence): arm A advantage 2-10%; p < 0.10
- **NEUTRAL** (no signal): |Δ| < 2%; p ≥ 0.10
- **REGRESSION** (arm B wins): arm B advantage > 2%; p < 0.05

The goal's verdict is a 4-vector across (pass rate, cost, wall-clock,
variance), e.g. `{PASS, MARGINAL, NEUTRAL, PASS}`.

Respectable graduation: ≥ 3 PASS or MARGINAL with 0 REGRESSION.
Strong claim: 4 × PASS. Any REGRESSION must be characterised
(which families, why).

## Output deliverable

A single markdown report at
`eval/skillcraft/results/datafetch/goal4-p1-paired-comparison-20260517.md`
with:
- Headline 4-vector verdict
- The 4 tables above
- 1-2 paragraph honest interpretation
- Pointers to scorecards + helper-instrumentation.jsonl files
- "What this proves vs what it doesn't" closing section

PLUS update `experiments/EXPERIMENT_NOTES.md` with a P1 entry.
PLUS update `experiments/STATUS.md` "Current state" with P1 verdict.

## Stop conditions

STOP and REPORT if:
- Either arm's eval fails to complete > 90% of episodes (invalidate
  the run as iter161 was)
- Substrate behaviour changes inadvertently (typecheck fail, test
  fail, helper authoring diverges from iter164)
- Wall-clock budget exceeds 4 hours total
- You discover an arm-B implementation gap requiring > 2 hours of
  substrate change

STOP and DECLARE WIN if:
- 4-vector verdict is ≥ 3 PASS/MARGINAL with 0 REGRESSION
- Underlying data archived
- Report committed as
  `feat(goal4 p1): matched-arm substrate-vs-no-substrate proof`

STOP and DECLARE NEUTRAL if:
- 4-vector mostly NEUTRAL — substrate doesn't measurably advantage at
  this scale; honest evidence; note in NOTES + STATUS

STOP and ESCALATE if:
- REGRESSION on any dimension. Don't try to fix; surface to user.

## Reference paths

- `eval/skillcraft/configs/arms.yaml`
- `eval/skillcraft/scripts/score-r1-r9.ts`
- `eval/skillcraft/scripts/normalize-results.ts`
- `eval/skillcraft/scripts/analyze-results.ts:161`
- `src/eval/skillcraftFullDatafetch.ts`
- `experiments/experiment-history.md`
- `eval/skillcraft/rubric.md`
- `scripts/parallel-eval.sh`

Usage check before launching:
```
cd /Users/jayfarei/src/tries/2026-02-05-test-usage-via-cli
bun run lazyusage-check
```
