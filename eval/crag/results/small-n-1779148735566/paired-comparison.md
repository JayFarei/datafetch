# CRAG Paired Comparison — small-n-1779148735566

> Generated: 2026-05-19T00:09:01.928Z
> Source:    `results.json` from `small-n-1779148735566`
> Records:   4 matched pairs (4 substrate-on, 4 substrate-off)
> Total invocations: 8 (across 9.2 minutes wall-clock)

## Headline 4-vector + R7

| Axis | substrate-ON | substrate-OFF | delta | p (paired) | verdict |
|---|---|---|---|---|---|
| R1 tri-state correctness (mean +1/0/-1) | -0.750 | -0.750 | 0.000 | >0.99 (McNemar, b=0, c=0) | **NEUTRAL** |
| R2 effective tokens (mean, log-paired-t) | 1 | 1 | 0.000 (log) | >0.10 (t=0.00, df=3) | **NEUTRAL** |
| R4 wall-clock ms (mean, log-paired-t) | 181492 | 175950 | 0.035 (log) | >0.10 (t=0.67, df=3) | **NEUTRAL** |
| R3 runtime error rate | 100.0% | 50.0% | 50.0% | >0.10 (McNemar) | **NEUTRAL** |

**4-vector: {NEUTRAL, NEUTRAL, NEUTRAL, NEUTRAL}** — 0 PASS, 0 FAIL

**R7 helper-reuse: FAIL** — substrate-on: 0/4 questions hit a learned helper at least once. substrate-off: 0/4.

## Goal 5 threshold

> substrate-ON beats substrate-OFF on **≥ 3 of 4 axes** AND helper-reuse (R7) fires on at least one sibling-template family.

- ≥ 3 of 4 axes PASS: 0/4 ✗
- R7 fires on ≥ 1 family:  ✗

**THRESHOLD NOT MET on this run.** Specific gap(s) above.

## Per-slice tri-state (domain × question_type)

| slice | n | ON mean | OFF mean | delta |
|---|---|---|---|---|
| finance/aggregation | 1 | -1.000 | -1.000 | 0.000 |
| finance/comparison | 1 | 0.000 | -1.000 | 1.000 |
| finance/simple | 1 | -1.000 | 0.000 | -1.000 |
| finance/simple_w_condition | 1 | -1.000 | -1.000 | 0.000 |

## Per-dynamism tri-state

| static_or_dynamic | n | ON mean | OFF mean | delta |
|---|---|---|---|---|
| fast-changing | 1 | 0.000 | -1.000 | 1.000 |
| real-time | 1 | -1.000 | 0.000 | -1.000 |
| static | 2 | -1.000 | -1.000 | 0.000 |

## Per-question (paired)

| id | domain/type | dyn | ON score | OFF score | ON ans | OFF ans | gold |
|---|---|---|---|---|---|---|---|
| f08ed2eb | finance/simple | real-time | -1 | 0 | 0.19 |  | $38.84 |
| d55e6e15 | finance/simple_w_condition | static | -1 | -1 | $.9 billion | 7 billion | the total amount of corporate … |
| c7f3a697 | finance/comparison | fast-changing | 0 | -1 |  | TRIS | cycc |
| adea74b3 | finance/aggregation | static | -1 | -1 | quarterly | quarterly | 4 |

## Methodology

- **Arms:** substrate-on (defaults), substrate-off (`DATAFETCH_DISABLE_LEARNING=1`). All other inputs identical.
- **Agent backend:** claude-p (PTY-driven `claude --print` drop-in) → `claude-sonnet-4-6` at effort `low`.
- **Scoring:** rule-based tri-state (+1 exact-or-substring-match / 0 abstention / -1 incorrect). LLM-judge augmentation is iter6+.
- **Tests:** McNemar for binary axes (R1, R3), paired-t on log-transformed continuous axes (R2, R4 wall-clock). p-values are approximate buckets, not exact.
- **Substrate hash:** see worktree HEAD at run time.
- **CRAG version:** task 1+2 dev split (validation + public test = 2,706 records); this run is a stratified slice.
