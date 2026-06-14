# M5 Supervisor Recompute-Audit

Auditor: supervisor session (Opus 4.8), 2026-06-14. Independent of the build agent's scorer.
Verdict: **the pre-registered M5 result is VALID and reproduces exactly, and is upheld with one material caveat recorded below.** This note must be read alongside `score-report.md`; the headline is never to be cited without the empty-gold caveat.

## What was recomputed from the raw rows (not trusting the scorer)

Inputs: `grades.jsonl` (936) and `normalized.jsonl` (936), re-derived from scratch.

1. **Structure is clean.** 936 grade rows = 104 questions x 3 arms x 3 seeds = 312 cells, every cell has exactly seeds {1,2,3}, no duplicates, all `status=completed`, all `exitCode=0`.
2. **Point estimates match the scorer exactly.** Per-question majority-correct (>=2 of 3 seeds), the pre-registered metric:
   - armN 5/104 = 0.0481
   - armR 11/104 = 0.1058
   - armL 19/104 = 0.1827
   - PRIMARY armL-armN = +0.1346 ; ATTRIBUTION armL-armR = +0.0769
3. **CIs reproduce to four decimals under an independent bootstrap seed** (5000 resamples, 26 template clusters of 4, my own RNG seed):
   - PRIMARY armL-armN CI [0.0385, 0.2596], excludes 0 (positive)
   - ATTRIBUTION armL-armR CI [0.0192, 0.1538], excludes 0 (positive)
   The scorer's bootstrap is deterministic and honest.
4. **Cost claim holds.** Full-weight token identity `input + cache_read + cache_creation + output == modelContextTokens == tokens` holds on all 936 rows (0 violations). Mean full-weight tokens armL 143,518 < armN 157,903 < armR 162,481; mean turns armL 7.08 < armN 7.52 < armR 7.64. Co-primary (cheaper at non-inferior correctness) upheld.
5. **Zero infrastructure-incompletes.** Two rows carry an `error` field ("driver did not produce scripts/answer.ts"), both baselines (otc-0029 armN s3, otc-0039 armR s1). These are genuine failures-to-answer, not API/transport incompletes; graded `correctVsGold=None` = not-correct per the prereg. They penalise the baselines, not armL.
6. **Hygiene / experimental control.** Parity contract holds: all three driver prompts hash identically after the binding block is stripped, and `df.d.ts` is identical after the library section is removed (`v3-parity.json` `promptsMatchAfterBindingRemoved` and `dfDtsMatchAfterLibSectionRemoved` both true). Curated-library blindness re-grep zero hits (`v1`); recipe 302 chars, blindness zero hits (`v3`); zero `ANTHROPIC_API_KEY` references in the hygiene sweep (`v4`). Driver command across episodes is the pinned `claude -p --model claude-sonnet-4-6 --safe-mode --no-session-persistence --output-format json` (user's own claude -p, no API key).

## Material caveat (supervisor finding, not in the scorer report)

The absolute margin is **composed disproportionately of empty-result questions**, where "correct" means emitting an empty set `[]`.

- 11 of the 104 questions have empty/trivial gold (`[]`). On those, armL is 3/3 on every one (deterministic, not luck); armR 9/11; armN 5/11.
- armL also emits a false `[]` on 43 non-empty question-seeds (out of 279), i.e. it has a standing empty-set propensity. This makes empty-gold questions a low-information win for armL.
- **11 of armL's 19 winning questions are empty-gold.** Splitting the headline:

| slice | n | armN | armR | armL | L-N | L-R |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| all | 104 | 0.048 | 0.106 | 0.183 | +0.135 | +0.077 |
| non-empty-gold | 93 | 0.000 | 0.022 | 0.086 | +0.086 | +0.065 |
| empty-gold | 11 | 0.455 | 0.818 | 1.000 | +0.545 | +0.182 |

**The effect survives on the 93 non-empty-gold questions, but smaller**: armL 8/93 (8.6%) vs armN **0/93 (0.0%)** vs armR 2/93 (2.2%). The baseline never gets a single non-trivial question majority-correct; the curated interface gets eight. That non-empty-gold slice is the durable, defensible signal. The grader is even-handed on these (it failed armN seeds with wrong values and passed the one armN seed with correct values, using the same dict-by-group/key normalisation it applied to armL), so the eight non-empty armL wins are genuine value matches, not rubber-stamps.

## How to state the result honestly

The curated callable interface (armL) roughly quadruples per-question majority-correctness over the cold mounted baseline (18.3% vs 4.8%) and also beats the natural-language recipe floor (10.6%); both clustered CIs exclude zero in the positive direction, and armL is simultaneously cheaper in tokens and turns. Absolute correctness is low across all arms (these are genuinely hard dark-store questions, consistent with the program's prior organic-correctness findings). Roughly half the absolute margin comes from empty-result questions where the correct answer is `[]`; on the 93 non-trivial questions the cold baseline scores 0% and the interface ~9%, so the qualitative finding (a curated interface lets the agent answer questions the cold baseline essentially never answers) holds, at a smaller magnitude than the all-questions headline suggests.
