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

_(empty — iter1 in progress)_
