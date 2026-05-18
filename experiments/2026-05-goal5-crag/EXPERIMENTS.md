# Experiments — Goal 5 (CRAG cycle)

> Curated, chronological list of substrate-level iterations against the CRAG
> benchmark. Each entry captures hypothesis, change, expected delta, actual
> delta, status, and lessons. Both successful and failed attempts go here.
> This file is the first thing the next iteration should read.

## Format

```
### EN: <one-line title>
- Date: YYYY-MM-DD
- Goal: <which Goal 5 phase / threshold this iteration was working towards>
- Hypothesis: <one sentence claim>
- Lever: <hook registry / observer / snippet runtime / prompt template / discovery / harness / measurement-only>
- Change: <what was actually implemented; commit ref>
- Probe: <single-domain probe — domain, score before, score after, delta, learning-loop metrics>
- Validate: <held-out domain-pair — score before, after, delta, learning-loop metrics>
- Small-N (50): <pass rate, avg tokens, runtime err, R7 reuse rate>
- Full CRAG (2,706, optional): <pass rate, avg tokens, runtime err, learning-loop metrics>
- SkillCraft re-run: <R1, R2, R3 — assert iter164/P1 baseline holds>
- Status: PASSED | FAILED | INCONCLUSIVE
- Lessons: <what we learned, what surprised us, what to do differently>
- Artefacts: <paths to analysis JSON, run-id, headline row>
```

The two new rows vs the SkillCraft cycle format:

- **Small-N (50)** before **Full CRAG**, because the small-N probe is the
  primary iteration vehicle. Full eval runs only when small-N is stable.
- **SkillCraft re-run** is the non-regression gate. Every iteration that
  lands a substrate change must re-run `pnpm eval:skillcraft` on the new
  substrate hash and assert the iter164/P1 baseline holds. No exception.

---

## Iteration log

### E1: re-probe substrate shape under main (no substrate change)
- Date: 2026-05-18
- Goal: P1 — validate that br/17's findings replicate under main's substrate state before designing P2 (modeling decision)
- Hypothesis: br/17's three findings (FANOUT(tool) signature collapse, literal data-shape-clone helper body, helper-name-collision silent skip) all replicate on main's substrate state at `ed2b6b5f3`
- Lever: measurement-only. No substrate change. Re-ran `scripts/crag-probe/crag-shape-probe.ts` against this worktree's substrate.
- Change: none. Probe artefact saved to `eval/crag/reports/iter1-probe-output.txt`.
- Probe (single-domain): 7 hand-authored trajectories (3 finance, 2 movie, 1 sports, 1 cross-domain comparison). All chained trajectories (call count ≥ 2) hashed to `intentSignature: FANOUT(tool)`. First chained trajectory authored `toolFanout.ts`. Trajectories 2-6 skipped with `name already exists`. False-premise trajectory (1 call) refused by `extractTemplate` (requires ≥ 2 calls).
- Validate: helper invocation under `{query: "Microsoft", tickerName: "MSFT"}` fires warm, mode `interpreted`, tier 2, 0 LLM calls. Body returns `getPeRatio` output regardless of input intent — confirms the data-shape-clone landmine.
- Small-N (50): not run (measurement-only iteration, no substrate change to test).
- Full CRAG (2,706): not run.
- SkillCraft re-run: not required (no substrate change).
- Status: PASSED (the hypothesis held — finding (A) per PLAN.md § P1).
- Lessons:
  1. The br/17 gap list applies as-written to main. No need to re-read main's observer; substrate-on-main has the same signature-collapse + clone-helper + name-collision-skip pattern.
  2. The iter150+ intent-shape pivot documented in `kb/docs/intent-shape-interface.md` does NOT fire for 2-call FANOUT(tool) trajectories — the renderer falls through to a literal `{query, tickerName}` data-shape clone. This is on main, not just on `decouple-substrate-from-skillcraft`.
  3. The substrate gap is real and stable; the design space for iter2-N is the one br/17 § "What this means for the CRAG plan in br/16" enumerates.
- Artefacts:
  - probe output: `eval/crag/reports/iter1-probe-output.txt`
  - authored helper (transient): `/tmp/crag-probe-*/lib/crag-probe/toolFanout.ts`
  - probe source: `scripts/crag-probe/crag-shape-probe.ts`
  - substrate hash: `ed2b6b5f3` (scaffold commit: `5d28dd6a6`)
  - prior-cycle peer findings: `kb/br/17-crag-shape-probe-findings.md`

### E2: db.* modeling probe — does pushing CRAG onto db primitives differentiate?
- Date: 2026-05-18
- Goal: P2 — settle the mock-API modeling decision before building the adapter
- Hypothesis: Modeling CRAG mock APIs as `df.db.cragFinance.companies.findExact(...)` rather than `df.tool.cragFinance.getCompanyInfo(...)` routes CRAG trajectories onto richer substrate shapes (per `kb/br/17` § "The modeling decision the probe forces"); the substrate produces structurally-different helpers per question type instead of one toolFanout-for-everything
- Lever: harness-only. New probe at `scripts/crag-probe/crag-shape-probe-db.ts`. Substrate untouched.
- Change: 7 trajectories re-modeled to use `db.*` primitives over denormalised collections (cragFinanceCompanies / cragMovieYears / cragMovieTitles / cragMoviePersons / cragSportsPlayers / cragFinanceCeos). Simple lookups become 1-call (`findExact` returns the rich row); comparisons/multi-hops remain 2-call.
- Probe: 7 trajectories. **Three findings**:
  1. Name-collision DISAPPEARS. Each 2-call trajectory authored a UNIQUE helper name derived from the question text (`whichHasHigherMarketCapAppleOrMic`, `whoDirectedTheMovieThatWonBestPic`, `whatIsTheMarketCapOfTheCompanyWh`). No silent "name already exists" skips.
  2. 4/7 trajectories (A1, A2, D, E — the 1-call ones) are structurally outside crystallisation. Rich-row modeling reduces tool calls but also eliminates substrate learning opportunities for simple-chain CRAG questions.
  3. **Authored helper bodies are SINGLE-CALL clones, not full-trajectory clones.** Helper B (comparison) accepts `{name: string}` and calls `findExact` once; the original 2-call comparison logic (Apple AND Microsoft) is dropped. Helper C (multi-hop) renders only the SECOND `findExact` call, dropping the year-lookup that produced its input. Iter1's tool helper at least rendered both calls; the db-render path is degenerate by comparison.
- Validate: not run (probe-level finding sufficient to decide).
- Small-N (50): not run.
- Full CRAG (2,706): not run.
- SkillCraft re-run: not required (no substrate change).
- Status: INCONCLUSIVE. db modeling wins on name-collision; regresses on helper-body fidelity; same blind spot on 1-call trajectories. **Neither pure modeling produces useful crystallisation alone.**
- Lessons:
  1. The substrate has render-function coverage for FANOUT(tool) but NOT for FANOUT(db). The db-path falls back to a degenerate single-call body. Iter3 needs to either (a) add a `renderDbFanOutSource` that captures the full trajectory or (b) push CRAG onto hybrid `db→lib` / `db→tool→lib` shapes that match the existing render functions (`recordToolFanout`, `recordToolEnrichment`, `recordToolLookup`).
  2. 1-call simple-chain CRAG questions cannot be crystallised under either modeling. The substrate's value-add for these question types is zero. If we want substrate wins on CRAG's simple slice, EITHER we need a sub-1-call crystallisation path (e.g. crystallise the local-extract logic), OR we accept that the substrate's CRAG win comes from the multi-call slices (comparison, multi-hop, enriched-multi-hop).
  3. Name derivation in the db render-path uses the QUESTION TEXT as the helper name. This is functionally helpful (no collision) but semantically wrong (the helper is structurally a generic "lookup-by-name-then-extract", not a question-specific function). Future iteration should refactor name derivation to use the intent-shape, not the question text.
- Artefacts:
  - probe output: `eval/crag/reports/iter2-probe-db-output.txt`
  - authored helpers (transient): `/tmp/crag-probe-db-*/lib/crag-probe-db/*.ts`
  - probe source: `scripts/crag-probe/crag-shape-probe-db.ts`
  - substrate hash: `ed2b6b5f3` (still iter1's hash; no substrate change)
  - decision: **REJECT both pure modelings.** Iter3 (originally planned as hybrid probe) replaced with vendoring + adapter work — the substrate gap is well-characterised; further synthetic probes have diminishing returns. Iter4 will land the gap in real LLM-driven measurement.

### E3: vendor CRAG dataset (task 1+2 public dev split)
- Date: 2026-05-19
- Goal: P3 — get the 2,706-question public split downloaded, decompressed, schema-verified, and reproducibly preparable
- Hypothesis: the CRAG dataset matches `kb/br/16`'s schema description; the 2,706-record count holds.
- Lever: harness-only (download + script).
- Change: `eval/crag/scripts/prepare-crag.sh` — idempotent download + decompress + verify; `eval/crag/vendor/.gitignore` (excludes the raw 705 MB / 4.8 GB files from git); `eval/crag/vendor/README.md` (full distribution stats).
- Probe: schema fields match expectations (interaction_id / query_time / domain / question_type / static_or_dynamic / query / answer / alt_ans / search_results / split). **One critical deviation from br/16: `popularity` field is MISSING from all 2,706 records.** Likely available only in task 3's combined split or in CRAG's internal scoring rubric.
- Validate: record counts confirmed: 2,706 total (1,371 validation + 1,335 public test). Domain distribution: finance 661, movie 611, open 542, sports 519, music 373. Question-type distribution: simple 754, simple_w_condition 407, comparison 333, aggregation 315, false_premise 309, set 249, multi-hop 231, post-processing 108. Dynamism: static 1,503 / slow-changing 583 / fast-changing 353 / real-time 267.
- Small-N (50): not run.
- Full CRAG (2,706): dataset ready; adapter not yet built.
- SkillCraft re-run: not required (no substrate change).
- Status: PASSED.
- Lessons:
  1. The `popularity` field that br/16 cited (661 head, 658 torso, 665 tail) is **not in the released dataset** for task 1+2. Rubric updated to drop popularity slicing; will re-add if/when task 3 is vendored.
  2. Search results per record = **5** (not 50). Task 3 is the 50-page version, downloaded separately. For substrate purposes 5 pages is plenty — fewer tokens to manage per question.
  3. Question-type distribution is **heavily simple-biased**: 754 simple + 407 simple_w_condition = 43% of the corpus. Per iter2 finding (3), simple 1-call trajectories don't crystallise under either modeling. So substrate value at full eval depends on the remaining 57% (comparison + aggregation + multi-hop + set + post-processing + false_premise — all multi-call shapes).
- Artefacts:
  - download script: `eval/crag/scripts/prepare-crag.sh` (idempotent)
  - vendor README with distributions: `eval/crag/vendor/README.md`
  - gitignore for the raw files: `eval/crag/vendor/.gitignore`
  - substrate hash: `ed2b6b5f3` (still iter1's hash)

### E4: end-to-end substrate plumbing through CRAG records (smoke, hand-authored)
- Date: 2026-05-19
- Goal: P4 — prove the substrate's snippet runtime composes against CRAG records before introducing LLM-driven runs
- Hypothesis: Wrapping a CRAG record's 5 search_results pages as a `df.db.cragWeb` collection via a generic `MountAdapter`, the substrate's snippet runtime can run a hand-authored snippet that calls `df.db.cragWeb.search(query)` + `df.answer({...})` end-to-end, capture a trajectory, and let the tri-state scorer grade against gold + alt_ans — all without modifying any substrate-runtime files.
- Lever: harness-only. New files: `src/eval/cragMount.ts` (CragWebMount + parseCragRecord + scoreTriState), `eval/crag/scripts/run-smoke.ts` (6-question hand-authored smoke covering simple/comparison/multi-hop/false_premise/aggregation/post-processing).
- Change: no substrate-runtime edits. Pure adapter-layer work. `pnpm typecheck` clean, `pnpm test` 374/374 pass on the same `ed2b6b5f3` substrate hash.
- Probe: 6 hand-picked CRAG questions (1 per question_type × ≥4 domains). Snippet does `df.db.cragWeb.search(query, {limit:3})` then `return df.answer({status:"answered", value: <gold>, evidence: <urls>})`. The snippet returns the gold answer directly — the smoke is plumbing-validation, not extraction-quality.
- Validate (smoke per-question): exit 0 in 6/6, trajectories captured in 6/6 (1 primitive call each = the `db.cragWeb.search`), `cost.tier=4`, `cost.llmCalls=0`, scorer fires correctly on all 6 (5 exact-match +1, 1 false-premise abstention 0, 0 incorrect -1). Mean tri-state = **0.833**. Report at `eval/crag/results/smoke-iter4/smoke-report.json`.
- Small-N (50): not run — iter5 introduces claude-p driver.
- Full CRAG (2,706): not run.
- SkillCraft re-run: not required. Iter4 landed no substrate-runtime changes; only added `src/eval/cragMount.ts` (eval-adapter, structurally isolated from src/observer/, src/snippet/, src/hooks/, src/sdk/, src/adapter/, src/trajectory/). The 374/374 vitest + clean typecheck on the same substrate hash provide the equivalent non-regression signal at zero API cost.
- Status: PASSED.
- Lessons:
  1. CragWebMount works as a generic `MountAdapter` over per-question pages. The pattern (one mount per CRAG question, registered/unregistered around each `snippetRuntime.run`) keeps each question's evidence surface isolated and is naturally parallelisable.
  2. The substrate's `df.db.<ident>` resolution requires an `identMap` on the MountRuntime (not just on the adapter); construct via the `{mountId, adapter, identMap, collection, close}` shape exported from `src/adapter/runtime.ts`.
  3. The AnswerEnvelope from `df.answer(...)` is returned via `result.answer` on the snippet runtime's `RunResult`, not `result.returnValue`. The snippet body needs `return df.answer({...})` to make it the IIFE's resolved value.
  4. Tri-state scorer is rule-based-only for this iteration. Patterns like "invalid question" / "i don't know" / "unknown" / "n/a" / empty all map to abstention (0); exact / substring match against gold or alt_ans maps to +1; everything else for false-premise questions maps to -1. LLM-judge augmentation is iter5+.
  5. Hand-authored "return gold answer" is a useful intermediate step — proves end-to-end plumbing without burning API credit on a still-unbuilt extraction path. Iter5 swaps in claude-p.
- Artefacts:
  - new substrate file: `src/eval/cragMount.ts` (~190 lines: parseCragRecord, CragWebMount/CragWebCollection, scoreTriState)
  - smoke runner: `eval/crag/scripts/run-smoke.ts` (~260 lines)
  - smoke report: `eval/crag/results/smoke-iter4/smoke-report.json`
  - substrate hash: `ed2b6b5f3` (unchanged from iter1; only eval-layer additions)
  - typecheck output: clean (0 errors)
  - test output: 374/374 vitest pass
