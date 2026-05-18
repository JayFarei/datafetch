# The R1-R10 Rubric for CRAG, As Actually Scored

This is the honest description of the Goal 5 CRAG scorecard as computed by
`eval/crag/scripts/score-r1-r10.ts` (TBD — built in P5). Mirrors the
SkillCraft `eval/skillcraft/rubric.md` structure. Two readers should walk
away:

- Engineers who want to know what each condition really measures (cite
  line numbers once the scorer lands, don't paraphrase the PLAN doc).
- Reviewers who want to know what the rubric *doesn't* yet measure and
  why some conditions only hold within their stated scope.

## How CRAG differs from SkillCraft for scoring

Five differences from the SkillCraft R1-R9:

1. **Tri-state correctness.** CRAG's grader returns +1 (correct), 0 (missing
   / abstained), or -1 (incorrect / hallucinated). R1 here is *not* the
   mean of a binary pass; it is the mean of the tri-state score, with
   abstention rewarded as 0 rather than treated as failure. Hallucination is
   penalised more than abstention.
2. **No SkillCraft-style families.** CRAG's structural unit is the
   **question template** (≈ 600 across the dataset). The R7 helper-reuse
   metric is computed over template instances, not family instances.
3. **Dynamism slicing.** Every question is labelled static / slow-changing /
   fast-changing / real-time. R1-R3 are reported as overall means *and* per-slice
   means. **Popularity slicing (head/torso/tail) is documented in the CRAG paper
   but the field is empty for all 2,706 records in `crag_task_1_and_2_dev_v4`;
   dropped from this rubric. Re-add if/when task 3 (50-page web) is also vendored.**
4. **R10 — Brier calibration.** New metric, CRAG-specific. Measures how
   well-calibrated substrate-ON's abstention behaviour is on questions
   where the gold answer is "I don't know" (false-premise + unanswerable
   slices). Brier score on the tri-state prediction.
5. **No SkillCraft-specific R3 classification.** Runtime-error
   classification reuses the same `classify-runtime-errors.ts` substrate
   normaliser, but CRAG questions don't have the SkillCraft-style "wrong
   tool returned junk" failure mode (CRAG mock APIs are well-typed and
   return clean dicts). Expect lower baseline R3 here than on SkillCraft.

## The Ten Conditions

### R1 — triStateScore

- **Measures:** `mean(triStateScore)` across all rows for the arm.
  `triStateScore ∈ {-1, 0, +1}` per CRAG's grading rubric: +1 for
  correct, 0 for "I don't know" / abstention, -1 for wrong / hallucinated.
- **Threshold (Goal 5):** substrate-ON ≥ substrate-OFF (matched-arm test).
  Absolute floor for "publishable": ≥ 0.30 (above naive RAG's 0.44 - 0.14
  hallucination penalty, ≈ 0.30 net).
- **Honest scope:** the LLM-judge half of the CRAG grader is stochastic;
  rule-based-only score is the primary metric for the paired comparison,
  LLM-judge-augmented is secondary.

### R2 — avgEffectiveTokens

- **Measures:** mean of `effectiveTokens` (non-null, finite) per question.
  Identical computation to SkillCraft's R2.
- **Threshold (Goal 5):** substrate-ON ≤ substrate-OFF (matched-arm test).
- **Honest scope:** does not include framework-prompt cache tokens (same
  `cacheBoundedByFramework` qualification as iter164).

### R3 — runtimeErrorRate

- **Measures:** `mean(runtimeStatus === "runtime_error")` across the arm.
  Reuses `classify-runtime-errors.ts` from SkillCraft.
- **Threshold (Goal 5):** substrate-ON ≤ substrate-OFF (matched-arm test).
- **Honest scope:** infrastructure errors (Anthropic 5xx, harness crash) are
  excluded.

### R4 — wallClockMs

- **Measures:** mean per-question wall-clock from request-start to
  answer-written.
- **Threshold (Goal 5):** substrate-ON ≤ substrate-OFF (matched-arm test).

### R5 — toolErrorRate

- **Measures:** rate of mock-API errors (mock-API returned `{error: ...}`
  shape, not a `{result: ...}` shape).
- **Threshold (Goal 5):** substrate-ON ≤ substrate-OFF (informational; not
  load-bearing).

### R6 — compositionalClusterCount

- **Measures:** number of distinct shape-hash clusters in the substrate-ON
  trajectories. Identical computation to SkillCraft's R6.
- **Threshold (Goal 5):** > 0 (substrate must crystallise *something*).
- **Honest scope:** raw count, not slice-weighted.

### R7 — helperReuseRate

- **Measures:** fraction of substrate-ON questions where at least one
  `df.lib.*` call was a warm-call against a previously-crystallised
  helper.
- **Threshold (Goal 5):** > 0 on at least one CRAG question-template family
  (the bottom-line Goal 5 condition).

### R8 — crossTemplateTransferRate

- **Measures:** fraction of warm-calls (R7 numerator) where the helper was
  authored on a DIFFERENT question template than the consuming question.
  Identical computation to SkillCraft's R8 cross-family.
- **Threshold (Goal 5):** informational; bonus signal.

### R9 — perTrajectoryHelperFanout

- **Measures:** mean number of `df.lib.*` calls per trajectory (vs raw
  `df.tool.*` or `df.db.*` calls). Identical computation to SkillCraft's R9
  FANOUT-tool transfer.
- **Threshold (Goal 5):** informational.

### R10 — abstentionBrier (NEW)

- **Measures:** Brier score on the tri-state prediction over false-premise +
  unanswerable slices. Treats the abstention output as a probabilistic
  prediction and scores it against the gold label.
- **Threshold (Goal 5):** substrate-ON ≤ substrate-OFF (substrate-authored
  helpers should improve calibration via the `premiseGuard`-shape pattern,
  see br/17 § Finding 4).
- **Honest scope:** only computed on the false-premise + unanswerable
  question types. Skipped for purely-knowledge questions.

## Qualifications

Mirror SkillCraft's qualifications. Three:

- `cacheBoundedByFramework` — Anthropic prompt cache tokens excluded from
  R2.
- `triStateGraderVariance` — rule-based-only R1 is primary; LLM-judge R1 is
  secondary because of the stochasticity.
- `noSkillCraftBleed` — substrate code must not reference CRAG-specific
  identifiers (tool names, envelope keys, paths). Audit at every iteration.

## Per-slice reporting

R1, R2, R3, R4, R7 are reported as overall means *and* per-slice means
along:

- domain × question_type (40 cells; 5 × 8)
- static_or_dynamic (4 cells)

The paired-comparison report renders the per-slice substrate-ON minus
substrate-OFF deltas as a heatmap.

Popularity slicing (head/torso/tail) is dropped pending task 3 vendoring;
see § "How CRAG differs from SkillCraft" item 3.
