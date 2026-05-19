# Iter7 spec: generic `renderDbFanOutSource` for FANOUT(db) trajectories

> Substrate-side fix anticipated by iter1+iter2 findings. Lands when
> iter6 small-N baseline is recorded. **Will require `pnpm eval:skillcraft`
> non-regression re-run** because it touches `src/observer/`.

## Hypothesis

Adding a generic `renderDbFanOutSource` in `src/observer/author.ts` that
mirrors `renderFanOutSource`'s full-trajectory render pattern but for
`db.*` primitives lets the substrate crystallise `FANOUT(db)` trajectories
into helpers that:

1. Capture the FULL trajectory (not single-call clone like iter2 showed)
2. Parameterise over entity values + collection idents (intent-shape per
   `kb/docs/intent-shape-interface.md` iter150+ pivot)
3. Are GENERIC (no CRAG-specific code; benefits SkillCraft + any future
   benchmark with db.*-heavy trajectories)

## Files to touch

### `src/observer/author.ts`

1. Add `isPureDbFanout(template)` near `isPureToolFanout` (line ~292):
   ```ts
   function isPureDbFanout(template: CallTemplate): boolean {
     if (template.steps.length < 2) return false;
     return template.steps.every((s) => s.primitive.startsWith("db."));
   }
   ```

2. Add `renderDbFanOutSource` near `renderFanOutSource` (line ~1254).
   Mirror its structure but emit body that calls
   `df.db[mountIdent][collectionName].findExact(...)` per step. The
   intent-shape input is `{intent?, limit?, entityValues?, collectionIdent?,
   collectionName?, methodName?, paramName?, sharedInput?}` analogous to
   the InternalToolFanoutPlan but for db.* primitives.

3. Add to dispatch chain in `authorFunction` (line ~94):
   ```ts
   const fanOutSource =
     renderToolFanoutEnrichmentSource({ template, trajectory }) ??
     renderRecordToolEnrichmentSource({ template, trajectory }) ??
     renderRecordToolFanOutSource({ template, trajectory }) ??
     renderFanOutSource({ template, trajectory }) ??
     renderDbFanOutSource({ template, trajectory });  // <-- new
   ```

### `src/observer/template.ts`

1. Add `dbFanout` to `knownLearnedHelperIntentSignature` (line 307-323):
   ```ts
   function knownLearnedHelperIntentSignature(primitive: string): string | null {
     if (primitive === "lib.toolFanout") return "FANOUT(tool)";
     if (primitive === "lib.dbFanout") return "FANOUT(db)";  // <-- new
     ...
   }
   ```

## Non-regression risk

SkillCraft's `EvalRecordsMount` uses db.* primitives for the per-entity
record collection. SkillCraft trajectories with `FANOUT(db)` shape (two
or more consecutive db calls) currently don't crystallise (no
render function matches). After iter7, they WILL crystallise — which
could either:

- (A) Produce useful new helpers that improve SkillCraft (NET POSITIVE)
- (B) Produce broken helpers that REGRESS SkillCraft baseline (NET FAIL)
- (C) Produce no new SkillCraft helpers because the `FANOUT(db)`
  signature doesn't appear in SkillCraft trajectories (STATUS QUO)

Only the SkillCraft full-126 re-run will tell us which.

If (B): roll iter7 back. The fix is benchmark-specific in behavior even
though the code looks generic; iterate the render logic. Common cause:
the db-fanout helper's body assumes a specific db.* collection schema
that SkillCraft doesn't have, so the helper returns the wrong shape and
downstream score drops.

If (C): the fix is harmless for SkillCraft (no new helpers, no regression).
Should be the baseline assumption.

If (A): iter7 BEATS the SkillCraft baseline. Bonus.

## Validation gate (Goal 5 explicit threshold)

After iter7 lands:

1. `pnpm typecheck` clean
2. `pnpm test` 374/374 pass
3. `pnpm eval:skillcraft` re-run with same config as iter164 / P1:
   - R1 ≥ 0.929 ✓
   - R2 effective tokens ≤ P1 Arm A baseline (1,951) ✓
   - R3 errors ≤ 0.016 ✓
   - 4-vector ≥ {NEUTRAL, PASS, PASS, NEUTRAL} ✓
4. Re-run small-N on the new substrate hash; expect at least:
   - R7 > 0 (at least one helper authored + reused across siblings)
   - Substrate-ON ≥ substrate-OFF on R1 correctness
   - Substrate-ON ≤ substrate-OFF on R2 tokens (post-helper-author, the
     warm call should be fewer tokens than cold composition)

If 4 fails: iter8 (LLM-judge augmentation) or iter9 (alternative render
strategy: hybrid db→lib).

## Estimated effort

- Read author.ts:1239-1370 (renderFanOutSource source) in detail: 20min
- Implement renderDbFanOutSource: 1h
- Implement template.ts addition: 15min
- Local probe with scripts/crag-probe/crag-shape-probe-db.ts to verify
  helper authors with full-trajectory body: 30min
- pnpm typecheck + pnpm test: 5min
- pnpm eval:skillcraft re-run: 1-2h wall-clock (or run overnight)
- Re-run CRAG small-N: ~100min wall-clock background
- Generate new paired-comparison.md + commit: 30min

**Total: 4-6 hours focused work + ~3-4 hours background eval time.**

## What this fix does NOT do

- It does NOT add LLM-judge scoring augmentation (iter8).
- It does NOT scale to full 2,706-question CRAG eval (iter9+).
- It does NOT touch the snippet runtime's globalThis.df reentrancy issue
  (cragRunner.ts's withReplayLock is the consumer-side workaround for
  that; a substrate-level fix is iter10+).
- It does NOT add the popularity slice (CRAG dataset doesn't have it).
- It does NOT add a `renderHybridDbLibSource` for `db→lib` shapes (iter11+
  if FANOUT(db) alone doesn't unlock enough crystallisation).
