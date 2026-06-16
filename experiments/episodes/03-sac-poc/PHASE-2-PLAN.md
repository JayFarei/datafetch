# Phase 2 — generalize the substrate (dataset-neutral learning loop)

Phase 1's COST headline is an honest negative ([[project_sac_amortisation_falsified]]); the
thesis-regeneration workflow ([[project_sac_thesis_regeneration]]) showed the surviving
differentiators are GOVERNANCE-under-staleness and ZERO-SRC SDK ONBOARDING — both of
which need a dataset-neutral substrate. Phase 2 is that generalization. It is also the
prerequisite the workflow flagged: on PokeAPI the gate NEVER fired because it is
numeric-only (FAC) and PokeAPI answers are structured JSON.

Each item is additive + reversible, gated by `pnpm typecheck` + `pnpm test:unit` + the
governance probes (`npx tsx eval/skillcraft/scripts/run-governance-probes.ts`), since
quarantineValidator has no unit tests but the probes exercise it functionally.

## Verification (the Goal's Phase-2 criteria)
- `grep -rn` for dataset names in `src/` outside `src/eval` returns nothing.
- A NON-NUMERIC helper reaches `validated-typescript` maturity through the gate.

## Items + approach

1. **Numeric-only gate → answer-kit equality predicate** *(STARTED, 2026-06-03)*
   - DONE: `answerEquals(got, expected)` added to `src/runtime/answerKit.ts` (pure,
     unit-tested: `tests/sac-answer-equals.test.ts`). Type-dispatch: numeric→FAC 1% (byte-
     identical to the old `isFacMatch`), boolean→strict, string→normalised, structured→
     canonical key-sorted deep-eq.
   - NEXT: rewire `quarantineValidator.replayOnTrajectory` (`src/observer/quarantineValidator.ts:301-341`)
     to use `answerEquals(out, trajectory.answer.value)` instead of `numericFromAnswer`+`isFacMatch`;
     generalize `QuarantineValidationResult` (`:35-47`) `got/expected` from `number` to `unknown`
     (+ callers). Re-run governance probes (numeric fixtures unchanged ⇒ must stay 3/3 + 0/0 blind),
     then add a non-numeric probe fixture to prove a string/structured helper reaches validated-typescript.

2. **Promote string/boolean literals in authorFromSource** — `extractPromotedValuesFromSource`
   (`quarantineValidator.ts:~358`) and the authorFromSource literal walk currently only promote
   numeric literals (`ts.isNumericLiteral`). Extend to `ts.isStringLiteral` / `true`/`false` keywords
   so non-numeric input literals are crystallised into the helper signature.

3. **Relocate `finqacases` / `rangeTableMetric` hardcodes out of `src/observer`** — live branches at
   `src/observer/author.ts:1458,1472,1649,1742,1774,2208` (+ comments `template.ts:20`,
   `demo/runDemo.ts:332`). Move the dataset-keyed behaviour to a dataset-config seam (the
   MountAdapter / dataset descriptor) so `src/observer` is dataset-agnostic. Verify via the grep-clean rule.

4. **`df.tool.*` branch in `regenerateManifest`** — so a dataset whose interface is callable tools
   (not just df.db/df.lib) renders a typed `df.tool.*` surface in the generated df.d.ts (needed for
   tool-shaped datasets in Phase 3).

5. **Migrate SkillCraft + FinChain onto the generalized loop** — confirm both still pass their
   smokes (FinChain numeric via the answerEquals numeric branch = no behaviour change; SkillCraft
   structured now governable).

## Order
1 (predicate done → rewire) → 2 → 3 → 4 → 5. Item 1's rewire + a non-numeric validated helper
satisfies the second Phase-2 verification criterion; item 3 satisfies the grep-clean criterion.

## Note
Headline choice (cost-crystallisation vs governance-under-staleness vs SDK as the Phase-1/demo
story) is still the user's open decision; Phase 2 is foundational for the latter two regardless.
