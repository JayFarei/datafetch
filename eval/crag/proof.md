# Proof of Goal 5 completion

> This file enumerates exactly what counts as "Goal 5 done". Mirrors
> `eval/skillcraft/proof.md`. The Goal 5 condition's evaluator (per the
> session-scoped Stop hook) will look for these specific artefacts.

## The four artefacts

1. **CRAG paired-comparison report** at
   `eval/crag/results/<run-id>/paired-comparison.md`, covering all 5
   domains × 8 question types × head/torso/tail × static/slow/fast/realtime
   slices over the 2,706-question CRAG public split, showing:
   - substrate-ON beats substrate-OFF on ≥ 3 of 4 axes (R1 tri-state
     correctness, R2 effective tokens, R4 wall-clock, R3 runtime errors).
   - R7 helper-reuse fires on ≥ 1 CRAG question-template family.
   - Per-slice McNemar / paired-t for each cell ≥ 20 questions.

2. **SkillCraft re-run scorecard** at
   `eval/skillcraft/results/datafetch/<same-substrate-hash>/r1-r9-scorecard.json`
   showing the iter164/P1 baseline holds on the same substrate git hash:
   - R1 ≥ 0.929
   - R2 effective tokens ≤ Arm A P1 baseline (1,951)
   - R3 errors ≤ 0.016
   - 4-vector ≥ {NEUTRAL, PASS, PASS, NEUTRAL}

3. **Test summary** from `pnpm test` reporting 374/374 pass on the same
   substrate hash.

4. **Typecheck output** from `pnpm typecheck` reporting 0 errors on the
   same substrate hash.

All four artefacts must be visible via `cat`/`pnpm` to the Goal 5
evaluator's transcript on the same run.

## What does NOT count as proof

- Small-N (50 question) probe results. These are iteration vehicles, not
  Goal 5 completion proof.
- LLM-judge-augmented R1 alone. Rule-based R1 is primary.
- A SkillCraft re-run on a DIFFERENT substrate hash than the CRAG run.
- Partial-corpus CRAG results. "Above the dataset threshold" is undefined
  on a subset.
- Substrate-ON wins on tokens/wall-clock only with R1 regression.
  Correctness ≥ substrate-OFF is required.

## What counts as BLOCKED

- A substrate change required for CRAG that CANNOT be made generic without
  regressing SkillCraft. Append BLOCKED to EXPERIMENT_NOTES.md with the
  specific generic-vs-benchmark-specific tension that surfaced.
- Anthropic API outage preventing reproducible runs for > 24h. Re-attempt
  on a quieter day.
- A CRAG dataset schema change upstream that breaks the adapter. Update the
  adapter and document; not a Goal 5 failure.
- LLM-judge grader instability > 5pp variance across reruns. Switch to
  rule-based-only as primary and document.
