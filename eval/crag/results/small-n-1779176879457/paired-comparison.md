# CRAG Paired Comparison — small-n-1779176879457

> Generated: 2026-05-19T09:35:31.076Z
> Source:    `results.json` from `small-n-1779176879457`
> Records:   50 matched pairs (50 substrate-on, 50 substrate-off)
> Total invocations: 100 (across 105.2 minutes wall-clock)

## Headline 4-vector + R7

| Axis | substrate-ON | substrate-OFF | delta | p (paired) | verdict |
|---|---|---|---|---|---|
| R1 tri-state correctness (mean +1/0/-1) | -0.200 | -0.100 | -0.100 | >0.10 (McNemar, b=1, c=4) | **NEUTRAL** |
| R2 effective tokens (mean, log-paired-t) | 1 | 1 | 0.000 (log) | >0.10 (t=0.00, df=49) | **NEUTRAL** |
| R4 wall-clock ms (mean, log-paired-t) | 196905 | 181638 | 0.051 (log) | <0.10 (t=1.71, df=49) | **FAIL** |
| R3 runtime error rate | 98.0% | 100.0% | -2.0% | >0.10 (McNemar) | **NEUTRAL** |

**4-vector: {NEUTRAL, NEUTRAL, FAIL, NEUTRAL}** — 0 PASS, 1 FAIL

**R7 helper-reuse: FAIL** — substrate-on: 0/50 questions hit a learned helper at least once. substrate-off: 0/50.

## Goal 5 threshold

> substrate-ON beats substrate-OFF on **≥ 3 of 4 axes** AND helper-reuse (R7) fires on at least one sibling-template family.

- ≥ 3 of 4 axes PASS: 0/4 ✗
- R7 fires on ≥ 1 family:  ✗

**THRESHOLD NOT MET on this run.** Specific gap(s) above.

## Per-slice tri-state (domain × question_type)

| slice | n | ON mean | OFF mean | delta |
|---|---|---|---|---|
| finance/aggregation | 1 | -1.000 | -1.000 | 0.000 |
| finance/comparison | 1 | -1.000 | 0.000 | -1.000 |
| finance/false_premise | 1 | 0.000 | 0.000 | 0.000 |
| finance/multi-hop | 1 | -1.000 | -1.000 | 0.000 |
| finance/post-processing | 1 | 0.000 | 0.000 | 0.000 |
| finance/set | 1 | -1.000 | 0.000 | -1.000 |
| finance/simple | 1 | -1.000 | 0.000 | -1.000 |
| finance/simple_w_condition | 1 | -1.000 | 0.000 | -1.000 |
| movie/aggregation | 1 | 0.000 | 0.000 | 0.000 |
| movie/comparison | 1 | 1.000 | 0.000 | 1.000 |
| movie/false_premise | 1 | -1.000 | 0.000 | -1.000 |
| movie/multi-hop | 1 | -1.000 | 0.000 | -1.000 |
| movie/post-processing | 1 | 0.000 | -1.000 | 1.000 |
| movie/set | 1 | -1.000 | 0.000 | -1.000 |
| movie/simple | 11 | 0.091 | -0.182 | 0.273 |
| movie/simple_w_condition | 1 | -1.000 | -1.000 | 0.000 |
| music/aggregation | 1 | 1.000 | 1.000 | 0.000 |
| music/comparison | 1 | 0.000 | 0.000 | 0.000 |
| music/false_premise | 1 | 0.000 | 0.000 | 0.000 |
| music/multi-hop | 1 | 1.000 | 1.000 | 0.000 |
| music/post-processing | 1 | -1.000 | -1.000 | 0.000 |
| music/set | 1 | -1.000 | 0.000 | -1.000 |
| music/simple | 1 | -1.000 | 0.000 | -1.000 |
| music/simple_w_condition | 1 | 0.000 | 1.000 | -1.000 |
| open/aggregation | 1 | 0.000 | 0.000 | 0.000 |
| open/comparison | 1 | 1.000 | 1.000 | 0.000 |
| open/false_premise | 1 | 0.000 | 0.000 | 0.000 |
| open/multi-hop | 1 | 0.000 | 0.000 | 0.000 |
| open/post-processing | 1 | 0.000 | -1.000 | 1.000 |
| open/set | 1 | -1.000 | -1.000 | 0.000 |
| open/simple | 1 | 0.000 | 0.000 | 0.000 |
| open/simple_w_condition | 1 | 1.000 | 0.000 | 1.000 |
| sports/aggregation | 1 | 0.000 | 0.000 | 0.000 |
| sports/comparison | 1 | -1.000 | -1.000 | 0.000 |
| sports/false_premise | 1 | -1.000 | 0.000 | -1.000 |
| sports/multi-hop | 1 | 1.000 | 1.000 | 0.000 |
| sports/post-processing | 1 | 0.000 | 0.000 | 0.000 |
| sports/set | 1 | 0.000 | 0.000 | 0.000 |
| sports/simple | 1 | -1.000 | 0.000 | -1.000 |
| sports/simple_w_condition | 1 | 0.000 | 0.000 | 0.000 |

## Per-dynamism tri-state

| static_or_dynamic | n | ON mean | OFF mean | delta |
|---|---|---|---|---|
| fast-changing | 5 | -0.400 | 0.000 | -0.400 |
| real-time | 1 | -1.000 | 0.000 | -1.000 |
| slow-changing | 9 | -0.556 | -0.333 | -0.222 |
| static | 35 | -0.057 | -0.057 | 0.000 |

## Per-question (paired)

| id | domain/type | dyn | ON score | OFF score | ON ans | OFF ans | gold |
|---|---|---|---|---|---|---|---|
| f08ed2eb | finance/simple | real-time | -1 | 0 | 0.19 | I don't know | $38.84 |
| d55e6e15 | finance/simple_w_condition | static | -1 | 0 | $2.28 trillion |  | the total amount of corporate … |
| c7f3a697 | finance/comparison | fast-changing | -1 | 0 | TRIS |  | cycc |
| adea74b3 | finance/aggregation | static | -1 | -1 | quarterly | annual | 4 |
| 94b8285c | finance/false_premise | slow-changing | 0 | 0 | invalid question | invalid question | invalid question |
| 0706fe40 | finance/set | static | -1 | 0 | Salesforce, Amgen, and Honeywe… |  | amgen inc., honeywell internat… |
| 318361f8 | finance/multi-hop | slow-changing | -1 | -1 | Apple | Apple | microsoft |
| a6f80f35 | finance/post-processing | static | 0 | 0 |  |  | $519.53 billion |
| 301b1d4d | movie/simple | static | 1 | -1 | yes | no | yes |
| e292786e | movie/simple_w_condition | static | -1 | -1 | The Artist | The Artist | argo |
| c4beea56 | movie/comparison | static | 1 | 0 | Finding Dory |  | finding dory |
| 47859020 | movie/aggregation | static | 0 | 0 |  | invalid question | 109 |
| 6bfc8de1 | movie/false_premise | static | -1 | 0 | no |  | invalid question |
| f8929d77 | movie/set | slow-changing | -1 | 0 | The Bourne Identity (2002), Th… |  | the names of the movies in the… |
| 4ebbb760 | movie/multi-hop | static | -1 | 0 | Ursula Andress |  | vesper lynd in 1953 |
| 1033305a | movie/post-processing | static | 0 | -1 |  | $752.5 million | $753,901,490 |
| dcf34e25 | music/simple | static | -1 | 0 | 1995 |  | 1993 |
| ade2500a | music/simple_w_condition | static | 0 | 1 |  | DAMN. | kendrick lamar won the 2018 pu… |
| 35409f1c | music/comparison | fast-changing | 0 | 0 |  |  | as of february 2024, taylor sw… |
| b8970214 | music/aggregation | static | 1 | 1 | 20 | 20 | 20 |
| d9d614b1 | music/false_premise | static | 0 | 0 |  |  | invalid question |
| c26d3df3 | music/set | static | -1 | 0 | Mick Jagger, Keith Richards, B… |  | the members of the rolling sto… |
| 74519fa3 | music/multi-hop | static | 1 | 1 | 2010 | 2010 | 2010 |
| 461bb1ce | music/post-processing | slow-changing | -1 | -1 | 6 years | 6 years | she didn't release any music b… |
| 91b6ffcf | open/simple | static | 0 | 0 |  |  | no, robert downey jr's iron ma… |
| 37c0f80e | open/simple_w_condition | static | 1 | 0 | John F. Clauser |  | john f clauser |
| 75dea36d | open/comparison | slow-changing | 1 | 1 | Selena Gomez | Selena Gomez | selena gomez has a larger soci… |
| dcbde332 | open/aggregation | static | 0 | 0 |  |  | 165 |
| ab54a7be | open/false_premise | static | 0 | 0 | invalid question |  | invalid question |
| 2b26da89 | open/set | static | -1 | -1 | English, Mandarin Chinese, Hin… | English, Mandarin Chinese, Hin… | chinese, spanish, english, fre… |
| 6ca6fb54 | open/multi-hop | static | 0 | 0 |  |  | massachusetts institute of tec… |
| a9ba91ac | open/post-processing | static | 0 | -1 |  | 1-2 | to care for the fish properly,… |
| 429768c8 | sports/simple | slow-changing | -1 | 0 | List of |  | joe flacco |
| 98890ab7 | sports/simple_w_condition | fast-changing | 0 | 0 |  |  | 2024-03-09 |
| 81e0fbd9 | sports/comparison | slow-changing | -1 | -1 | Tottenham | Tottenham | manchester united |
| 2aa174aa | sports/aggregation | static | 0 | 0 |  |  | an eight-time olympic gold med… |
| e4953aa2 | sports/false_premise | fast-changing | -1 | 0 | 9-23 | I don't know | invalid question |
| d6bc7e13 | sports/set | static | 0 | 0 |  |  | boston celtics, dallas maveric… |
| ad57a30d | sports/multi-hop | static | 1 | 1 | Del Harris | Del Harris | del harris |
| f06259f0 | sports/post-processing | fast-changing | 0 | 0 |  |  | 62.5% |
| af1ee3f6 | movie/simple | static | 0 | 0 |  |  | joaquin phoenix |
| 9b770c69 | movie/simple | static | 1 | 0 | Colin Dench |  | colin dench |
| 26561460 | movie/simple | static | 1 | 1 | Lynn Shelton | Lynn Shelton | lynn shelton |
| 1a1005cb | movie/simple | slow-changing | 0 | 0 |  |  | en |
| 20bdd3d1 | movie/simple | slow-changing | -1 | -1 | the | the | en |
| dc4ed1b5 | movie/simple | static | 0 | 0 |  |  | 1973-10-26 |
| 63cfd6f2 | movie/simple | static | 0 | 0 | invalid question |  | 2010-05-11 |
| 1432c6b2 | movie/simple | static | 0 | 0 |  |  | alberto sciamma |
| 27923312 | movie/simple | static | -1 | 0 | yes |  | no |
| fd2b5298 | movie/simple | static | 0 | -1 |  | timestamp 202403 | 1948-01-01 |

## Methodology

- **Arms:** substrate-on (defaults), substrate-off (`DATAFETCH_DISABLE_LEARNING=1`). All other inputs identical.
- **Agent backend:** claude-p (PTY-driven `claude --print` drop-in) → `claude-sonnet-4-6` at effort `low`.
- **Scoring:** rule-based tri-state (+1 exact-or-substring-match / 0 abstention / -1 incorrect). LLM-judge augmentation is iter6+.
- **Tests:** McNemar for binary axes (R1, R3), paired-t on log-transformed continuous axes (R2, R4 wall-clock). p-values are approximate buckets, not exact.
- **Substrate hash:** see worktree HEAD at run time.
- **CRAG version:** task 1+2 dev split (validation + public test = 2,706 records); this run is a stratified slice.
