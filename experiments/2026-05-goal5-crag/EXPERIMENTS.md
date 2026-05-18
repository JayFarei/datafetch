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
  - decision: **REJECT both pure modelings.** Iter3 explores hybrid `db→lib` or `db→tool` shapes.
