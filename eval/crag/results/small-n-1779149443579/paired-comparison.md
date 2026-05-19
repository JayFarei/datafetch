# CRAG Paired Comparison — small-n-1779149443579

> Generated: 2026-05-19T01:53:05.479Z
> Source:    `results.json` from `small-n-1779149443579`
> Records:   50 matched pairs (50 substrate-on, 50 substrate-off)
> Total invocations: 100 (across 101.1 minutes wall-clock)

## Headline 4-vector + R7

| Axis | substrate-ON | substrate-OFF | delta | p (paired) | verdict |
|---|---|---|---|---|---|
| R1 tri-state correctness (mean +1/0/-1) | -0.140 | -0.200 | 0.060 | >0.10 (McNemar, b=3, c=4) | **NEUTRAL** |
| R2 effective tokens (mean, log-paired-t) | 1 | 1 | 0.000 (log) | >0.10 (t=0.00, df=49) | **NEUTRAL** |
| R4 wall-clock ms (mean, log-paired-t) | 177787 | 181676 | -0.024 (log) | <0.05 (t=-2.52, df=49) | **PASS** |
| R3 runtime error rate | 84.0% | 100.0% | -16.0% | <0.05 (McNemar) | **PASS** |

**4-vector: {NEUTRAL, NEUTRAL, PASS, PASS}** — 2 PASS, 0 FAIL

**R7 helper-reuse: FAIL** — substrate-on: 0/50 questions hit a learned helper at least once. substrate-off: 0/50.

## Goal 5 threshold

> substrate-ON beats substrate-OFF on **≥ 3 of 4 axes** AND helper-reuse (R7) fires on at least one sibling-template family.

- ≥ 3 of 4 axes PASS: 2/4 ✗
- R7 fires on ≥ 1 family:  ✗

**THRESHOLD NOT MET on this run.** Specific gap(s) above.

## Per-slice tri-state (domain × question_type)

| slice | n | ON mean | OFF mean | delta |
|---|---|---|---|---|
| finance/aggregation | 1 | -1.000 | -1.000 | 0.000 |
| finance/comparison | 1 | 0.000 | 0.000 | 0.000 |
| finance/false_premise | 1 | 0.000 | 0.000 | 0.000 |
| finance/multi-hop | 1 | -1.000 | 0.000 | -1.000 |
| finance/post-processing | 1 | 0.000 | 0.000 | 0.000 |
| finance/set | 1 | -1.000 | -1.000 | 0.000 |
| finance/simple | 1 | 0.000 | 0.000 | 0.000 |
| finance/simple_w_condition | 1 | -1.000 | -1.000 | 0.000 |
| movie/aggregation | 1 | 0.000 | 0.000 | 0.000 |
| movie/comparison | 1 | -1.000 | 1.000 | -2.000 |
| movie/false_premise | 1 | 0.000 | 0.000 | 0.000 |
| movie/multi-hop | 1 | -1.000 | 0.000 | -1.000 |
| movie/post-processing | 1 | -1.000 | 0.000 | -1.000 |
| movie/set | 1 | -1.000 | -1.000 | 0.000 |
| movie/simple | 11 | 0.273 | 0.091 | 0.182 |
| movie/simple_w_condition | 1 | -1.000 | -1.000 | 0.000 |
| music/aggregation | 1 | 1.000 | 1.000 | 0.000 |
| music/comparison | 1 | -1.000 | -1.000 | 0.000 |
| music/false_premise | 1 | 0.000 | -1.000 | 1.000 |
| music/multi-hop | 1 | 1.000 | 1.000 | 0.000 |
| music/post-processing | 1 | -1.000 | -1.000 | 0.000 |
| music/set | 1 | -1.000 | 0.000 | -1.000 |
| music/simple | 1 | 0.000 | -1.000 | 1.000 |
| music/simple_w_condition | 1 | 1.000 | 0.000 | 1.000 |
| open/aggregation | 1 | 1.000 | 1.000 | 0.000 |
| open/comparison | 1 | 1.000 | 1.000 | 0.000 |
| open/false_premise | 1 | 0.000 | 0.000 | 0.000 |
| open/multi-hop | 1 | 0.000 | 0.000 | 0.000 |
| open/post-processing | 1 | -1.000 | -1.000 | 0.000 |
| open/set | 1 | -1.000 | -1.000 | 0.000 |
| open/simple | 1 | -1.000 | -1.000 | 0.000 |
| open/simple_w_condition | 1 | -1.000 | 1.000 | -2.000 |
| sports/aggregation | 1 | 0.000 | -1.000 | 1.000 |
| sports/comparison | 1 | 0.000 | -1.000 | 1.000 |
| sports/false_premise | 1 | 0.000 | 0.000 | 0.000 |
| sports/multi-hop | 1 | 1.000 | 0.000 | 1.000 |
| sports/post-processing | 1 | 0.000 | 0.000 | 0.000 |
| sports/set | 1 | 0.000 | -1.000 | 1.000 |
| sports/simple | 1 | 0.000 | -1.000 | 1.000 |
| sports/simple_w_condition | 1 | 0.000 | -1.000 | 1.000 |

## Per-dynamism tri-state

| static_or_dynamic | n | ON mean | OFF mean | delta |
|---|---|---|---|---|
| fast-changing | 5 | -0.200 | -0.400 | 0.200 |
| real-time | 1 | 0.000 | 0.000 | 0.000 |
| slow-changing | 9 | -0.111 | -0.222 | 0.111 |
| static | 35 | -0.143 | -0.171 | 0.029 |

## Per-question (paired)

| id | domain/type | dyn | ON score | OFF score | ON ans | OFF ans | gold |
|---|---|---|---|---|---|---|---|
| f08ed2eb | finance/simple | real-time | 0 | 0 |  |  | $38.84 |
| d55e6e15 | finance/simple_w_condition | static | -1 | -1 | $1.5 trillion | $1.2 trillion | the total amount of corporate … |
| c7f3a697 | finance/comparison | fast-changing | 0 | 0 | I don't know | I don't know | cycc |
| adea74b3 | finance/aggregation | static | -1 | -1 | quarterly | quarterly | 4 |
| 94b8285c | finance/false_premise | slow-changing | 0 | 0 | invalid question | invalid question | invalid question |
| 0706fe40 | finance/set | static | -1 | -1 | Salesforce, Amgen, and Honeywe… | Salesforce, Amgen, Honeywell | amgen inc., honeywell internat… |
| 318361f8 | finance/multi-hop | slow-changing | -1 | 0 | Apple |  | microsoft |
| a6f80f35 | finance/post-processing | static | 0 | 0 |  |  | $519.53 billion |
| 301b1d4d | movie/simple | static | -1 | 1 | no | yes | yes |
| e292786e | movie/simple_w_condition | static | -1 | -1 | The Artist | The Artist | argo |
| c4beea56 | movie/comparison | static | -1 | 1 | Inside Out | Finding Dory | finding dory |
| 47859020 | movie/aggregation | static | 0 | 0 |  |  | 109 |
| 6bfc8de1 | movie/false_premise | static | 0 | 0 |  | invalid question | invalid question |
| f8929d77 | movie/set | slow-changing | -1 | -1 | The Bourne Identity, The Bourn… | The Bourne Identity, The Bourn… | the names of the movies in the… |
| 4ebbb760 | movie/multi-hop | static | -1 | 0 | Ursula Andress |  | vesper lynd in 1953 |
| 1033305a | movie/post-processing | static | -1 | 0 | approximately $753 million |  | $753,901,490 |
| dcf34e25 | music/simple | static | 0 | -1 |  | 1997 | 1993 |
| ade2500a | music/simple_w_condition | static | 1 | 0 | DAMN. |  | kendrick lamar won the 2018 pu… |
| 35409f1c | music/comparison | fast-changing | -1 | -1 | Drake | Drake | as of february 2024, taylor sw… |
| b8970214 | music/aggregation | static | 1 | 1 | 20 | 20 | 20 |
| d9d614b1 | music/false_premise | static | 0 | -1 | invalid question | Edgar Barrera leads the 2023 L… | invalid question |
| c26d3df3 | music/set | static | -1 | 0 | Mick Jagger, Keith Richards, B… |  | the members of the rolling sto… |
| 74519fa3 | music/multi-hop | static | 1 | 1 | 2010 | 2010 | 2010 |
| 461bb1ce | music/post-processing | slow-changing | -1 | -1 | 6 years | 6 years | she didn't release any music b… |
| 91b6ffcf | open/simple | static | -1 | -1 | No, Chris Evans is most famous… | No, Chris Evans is most famous… | no, robert downey jr's iron ma… |
| 37c0f80e | open/simple_w_condition | static | -1 | 1 | John Clauser | John F. Clauser | john f clauser |
| 75dea36d | open/comparison | slow-changing | 1 | 1 | Selena Gomez | Selena Gomez | selena gomez has a larger soci… |
| dcbde332 | open/aggregation | static | 1 | 1 | 163 above ground + 2 below gro… | 163 above ground + 2 basement … | 165 |
| ab54a7be | open/false_premise | static | 0 | 0 | invalid question | invalid question | invalid question |
| 2b26da89 | open/set | static | -1 | -1 | English, Mandarin Chinese, Hin… | English, Mandarin Chinese, Hin… | chinese, spanish, english, fre… |
| 6ca6fb54 | open/multi-hop | static | 0 | 0 | invalid question |  | massachusetts institute of tec… |
| a9ba91ac | open/post-processing | static | -1 | -1 | 1 goldfish per 20 gallons | 1 goldfish per 20 gallons | to care for the fish properly,… |
| 429768c8 | sports/simple | slow-changing | 0 | -1 |  | Damar Hamlin | joe flacco |
| 98890ab7 | sports/simple_w_condition | fast-changing | 0 | -1 |  | 2024-02-24 | 2024-03-09 |
| 81e0fbd9 | sports/comparison | slow-changing | 0 | -1 |  | Tottenham | manchester united |
| 2aa174aa | sports/aggregation | static | 0 | -1 |  | 8 | an eight-time olympic gold med… |
| e4953aa2 | sports/false_premise | fast-changing | 0 | 0 |  | invalid question | invalid question |
| d6bc7e13 | sports/set | static | 0 | -1 |  | Dallas Mavericks, Sacramento K… | boston celtics, dallas maveric… |
| ad57a30d | sports/multi-hop | static | 1 | 0 | Del Harris |  | del harris |
| f06259f0 | sports/post-processing | fast-changing | 0 | 0 | invalid question |  | 62.5% |
| af1ee3f6 | movie/simple | static | 1 | 1 | Joaquin Phoenix | Joaquin Phoenix | joaquin phoenix |
| 9b770c69 | movie/simple | static | 1 | 0 | Colin Dench | invalid question | colin dench |
| 26561460 | movie/simple | static | 1 | 0 | Lynn Shelton |  | lynn shelton |
| 1a1005cb | movie/simple | slow-changing | 1 | 1 | English | English | en |
| 20bdd3d1 | movie/simple | slow-changing | 0 | 0 |  |  | en |
| dc4ed1b5 | movie/simple | static | 0 | -1 | invalid question | 2018-02-22 | 1973-10-26 |
| 63cfd6f2 | movie/simple | static | 0 | -1 | invalid question | 11:00 PM | 2010-05-11 |
| 1432c6b2 | movie/simple | static | -1 | -1 | Christopher Smith | Christopher Smith | alberto sciamma |
| 27923312 | movie/simple | static | 1 | 1 | no | no | no |
| fd2b5298 | movie/simple | static | 0 | 0 | unknown | I don't know | 1948-01-01 |

## Methodology

- **Arms:** substrate-on (defaults), substrate-off (`DATAFETCH_DISABLE_LEARNING=1`). All other inputs identical.
- **Agent backend:** claude-p (PTY-driven `claude --print` drop-in) → `claude-sonnet-4-6` at effort `low`.
- **Scoring:** rule-based tri-state (+1 exact-or-substring-match / 0 abstention / -1 incorrect). LLM-judge augmentation is iter6+.
- **Tests:** McNemar for binary axes (R1, R3), paired-t on log-transformed continuous axes (R2, R4 wall-clock). p-values are approximate buckets, not exact.
- **Substrate hash:** see worktree HEAD at run time.
- **CRAG version:** task 1+2 dev split (validation + public test = 2,706 records); this run is a stratified slice.
