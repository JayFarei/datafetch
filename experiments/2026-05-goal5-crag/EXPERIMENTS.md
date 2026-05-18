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
