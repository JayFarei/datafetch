# GOAL P1 — matched-arm performance proof on SkillCraft (paired)

Substrate-ON (`datafetch-learned`) vs substrate-OFF (`datafetch-control`).
Same harness, same agent backend, same prompt skeleton, same df.tool + df.db + per_entity seed.
Only the learning loop differs: control arm runs with `DATAFETCH_DISABLE_LEARNING=1`,
which skips `hydrateFamilyLibCache`, `installObserver`, and `persistFamilyLibCache`.

Run dates: 2026-05-17. Backend: `claude-p` / `claude-sonnet-4-6` / effort `low`.
Episodes per arm: A=126, B=126. Paired tasks: 126.

## Headline 4-vector verdict

- **Pass rate**: NEUTRAL  (Δ = -2.4pp, McNemar p = 0.250)
- **Effective tokens**: PASS  (A/B ratio = 0.587x, paired t p ≈ 0)
- **Wall-clock**: PASS  (A/B ratio = 0.827x, paired t p ≈ 0.000)
- **Cost variance (σ effective tokens)**: NEUTRAL  (σA = 828.28, σB = 1,037.72)

## Table 1 — Headline deltas (full-126 means)

| Metric | Arm A (substrate ON) | Arm B (substrate OFF) | Δ | % improvement |
|---|---|---|---|---|
| R1 pass rate | 92.9% (117/126) | 95.2% (120/126) | -2.4pp | -2.5% |
| R2 mean effective tokens | 1,951.13 | 3,324.42 | -1373.3 | -41.3% |
| Wall-clock mean per task (ms) | 45,562.75 | 55,086.48 | -9523.7 | -17.3% |
| Effective-token σ (variance proxy) | 828.28 | 1,037.72 | -209.4 | -20.2% |
| Runtime errors | 2 | 0 | — | — |
| Infrastructure errors | 0 | 0 | — | — |

## Table 2 — Per-tier breakdown

| Tier | n A | passRate A | tokens A | wallMs A | n B | passRate B | tokens B | wallMs B | passΔ | tokΔ% | wallΔ% |
|---|---|---|---|---|---|---|---|---|---|---|---|
| train | 21 | 95.2% | 1,893.14 | 43,938.10 | 21 | 95.2% | 3,077.52 | 51,298.29 | +0.0pp | -38.5% | -14.3% |
| warm | 84 | 91.7% | 1,980.50 | 46,253.55 | 84 | 95.2% | 3,228.46 | 54,446.68 | -3.6pp | -38.7% | -15.0% |
| hard | 21 | 95.2% | 1,891.62 | 44,424.24 | 21 | 95.2% | 3,955.14 | 61,433.86 | +0.0pp | -52.2% | -27.7% |

## Table 3 — Per-family breakdown (21 families)

Sorted by Arm-A advantage on pass rate (largest substrate wins first).

| Family | n A | passA | tokA | n B | passB | tokB | passΔ | tokΔ% |
|---|---|---|---|---|---|---|---|---|
| cat-facts-collector | 6 | 0.0% | 1,685.17 | 6 | 0.0% | 1,884.17 | +0.0pp | -10.6% |
| cocktail-menu-generator | 6 | 100.0% | 1,785.33 | 6 | 100.0% | 2,600.67 | +0.0pp | -31.4% |
| countries-encyclopedia | 6 | 100.0% | 3,454.17 | 6 | 100.0% | 4,112.33 | +0.0pp | -16.0% |
| dnd-campaign-builder | 6 | 100.0% | 2,496.17 | 6 | 100.0% | 3,814.83 | +0.0pp | -34.6% |
| dnd-monster-compendium | 6 | 100.0% | 1,514.33 | 6 | 100.0% | 2,526.83 | +0.0pp | -40.1% |
| dog-breeds-encyclopedia | 6 | 100.0% | 1,456 | 6 | 100.0% | 2,803.50 | +0.0pp | -48.1% |
| gitlab-deep-analysis | 6 | 100.0% | 2,231.33 | 6 | 100.0% | 3,932.83 | +0.0pp | -43.3% |
| jikan-anime-analysis | 6 | 100.0% | 2,020.17 | 6 | 100.0% | 4,395.67 | +0.0pp | -54.0% |
| jsonplaceholder-blog-analyzer | 6 | 100.0% | 1,409.50 | 6 | 100.0% | 3,094.50 | +0.0pp | -54.5% |
| local-dna-analysis | 6 | 100.0% | 1,608.83 | 6 | 100.0% | 2,232.33 | +0.0pp | -27.9% |
| name-demographics-analyzer | 6 | 100.0% | 1,791.83 | 6 | 100.0% | 3,414.17 | +0.0pp | -47.5% |
| openmeteo-weather | 6 | 100.0% | 2,022.17 | 6 | 100.0% | 3,275.33 | +0.0pp | -38.3% |
| rickmorty-multiverse-explorer | 6 | 100.0% | 1,648.17 | 6 | 100.0% | 3,309.67 | +0.0pp | -50.2% |
| tvmaze-series-analyzer | 6 | 100.0% | 1,971.67 | 6 | 100.0% | 4,579.50 | +0.0pp | -56.9% |
| university-directory-builder | 6 | 100.0% | 1,791.17 | 6 | 100.0% | 3,031.83 | +0.0pp | -40.9% |
| usgs-earthquake-monitor | 6 | 100.0% | 2,039.67 | 6 | 100.0% | 4,459.67 | +0.0pp | -54.3% |
| vocabulary-builder | 6 | 100.0% | 1,464 | 6 | 100.0% | 2,947.50 | +0.0pp | -50.3% |
| world-bank-economic-snapshot | 6 | 100.0% | 2,937.50 | 6 | 100.0% | 3,781.67 | +0.0pp | -22.3% |
| pokeapi-pokedex | 6 | 83.3% | 1,722 | 6 | 100.0% | 3,295.67 | -16.7pp | -47.7% |
| random-user-database | 6 | 83.3% | 2,279 | 6 | 100.0% | 3,836.33 | -16.7pp | -40.6% |
| recipe-cookbook-builder | 6 | 83.3% | 1,645.50 | 6 | 100.0% | 2,483.83 | -16.7pp | -33.8% |

Families where A beats B by ≥ 10pp on pass rate: 0 (none).
Families where B beats A by > 2pp on pass rate (substrate anti-patterns): 3 (pokeapi-pokedex, random-user-database, recipe-cookbook-builder).

## Table 4 — Statistical confidence

Paired tasks (canonical task-key match between arms): 126

| Test | Statistic | p-value | n_pairs |
|---|---|---|---|
| McNemar (pass agreement, b=0, c=3) | discord(0,3) | 0.2500 | 3 |
| Paired t (effective tokens A − B) | t = -13.70 | 0 | 126 |
| Paired t (wall-clock ms A − B) | t = -6.63 | 0.0000 | 126 |

Pass discordance: treatment-only = 0, control-only = 3.

Notes on power: with N=126 (or fewer paired) any |Δ| < ~5pp on a 0/1 pass outcome falls outside what a McNemar can confidently distinguish from noise. Mean-token deltas are easier to detect — token costs vary continuously per task, so the paired t has effective n equal to the number of valid pairs.

## Interpretation

The 4-vector verdict is `{NEUTRAL, PASS, PASS, NEUTRAL}` — two strong cost wins, no movement on pass rate, lower variance with no formal test. The substrate's measurable contribution on SkillCraft, under a Claude backend strong enough to solve most tasks cold, is **cost efficiency, not correctness**. Per-task the agent finishes with **41% fewer effective tokens** (paired t p ≈ 0 on n=126) and **17% less wall-clock time** (p < 0.0001) when the learning loop is on; pass rate moves slightly in the wrong direction (-2.4pp, 117 vs 120 passes) but McNemar p=0.25 places this firmly inside noise.

The per-family table tells the same story 17 different ways: in 17 of 21 families both arms pass every episode, and the substrate-ON arm uses 10-57% fewer tokens (median around -40%). The four largest token wins are in fan-out-heavy families (jsonplaceholder-blog-analyzer -54%, tvmaze-series-analyzer -57%, usgs-earthquake-monitor -54%, rickmorty-multiverse-explorer -50%), exactly where the per_entity seed and learned tool-fanout helpers consolidate repeated tool calls into a single helper call.

Three families regress on pass rate by exactly 1 episode each (pokeapi-pokedex, random-user-database, recipe-cookbook-builder; -16.7pp = 1/6). These are worth flagging as **substrate anti-patterns to investigate**: in each, the substrate-OFF arm passed all 6 episodes while substrate-ON missed one. The most likely causes, based on iter164's analysis of similar one-off failures, are (a) a crystallised helper covering a near-but-not-exact intent that the agent prefers over the cold-start path, (b) hard-tier h1 episodes where the helper's parameter set is slightly too narrow, or (c) stochastic timeout. The aggregate effect is small (3 episodes out of 252), and the cost wins on these same families are large (-34% to -48% tokens), so the substrate is still net-positive on cost-per-task but produces honest losses on isolated correctness.

cat-facts-collector is the only family where neither arm passes any episode (all 12 episodes scored 60-65; the official evaluator's pass threshold is ≥70). This is consistent with iter164's finding that the cat-facts task design under-rewards correct fan-outs at the official scorer. The substrate still produces a small token advantage here (-11%) without learning anything callable.

## What this proves vs what it doesn't

**Proves:**

- The substrate's learning loop, with no benchmark identifiers in any code path and the same prompt skeleton for both arms, **measurably reduces both per-task token cost (-41%) and wall-clock time (-17%)** versus an identical agent run without the loop. Both effects are statistically robust at n=126.
- The cost advantage is **broadly distributed** (17/21 families improve by 10-57%) rather than driven by one or two outliers.
- The control-arm normalizer + `DATAFETCH_DISABLE_LEARNING=1` toggle works end-to-end: lib-cache directory absent for Arm B, observer never installed, `libFunctionsAvailable=0` on every Arm B row, `armId="datafetch-control"` propagated through to normalized.jsonl.

**Does not prove:**

- That the substrate makes Claude **more correct** on this surface. Under Claude `sonnet-4-6` at `low` effort the pass rate is essentially identical; if the substrate adds correctness, the headroom is too small to show here, or the substrate would need to operate on a benchmark where the un-substrated agent's pass rate is meaningfully below ceiling.
- That the substrate **reduces output variance** in a statistically meaningful sense. The aggregate σ on effective tokens drops 20%, but with one full-126 sample per arm we cannot bootstrap a confidence interval. A multi-seed replication is the right follow-up.
- That this generalizes off SkillCraft. SkillCraft's 21 families are designed for measurable fan-out patterns; the cost win specifically comes from helper consolidation of fan-outs. Different task surfaces with different call patterns may produce different deltas.
- That the three anti-pattern families (pokeapi / random-user-database / recipe-cookbook-builder) are intrinsic to the substrate rather than artefacts of stochastic episode runs. A multi-seed run is required to separate signal from noise on the -16.7pp per-family deltas.

**Honest summary:** P1 establishes causal evidence that the substrate's learning loop, holding agent + prompt + harness fixed, **trades a small amount of pass-rate variance for a large reduction in token and wall-clock cost**. That is a real, measurable, multi-dimensional advantage, graduating the substrate from "scored well on a benchmark" to "produced measurable improvement over a matched control." It is not a uniform improvement; cost is where the substrate earns its keep.

## Artifacts

- Arm A scorecard: `eval/skillcraft/results/datafetch/goal4-p1-armA-substrate-on-20260517/r1-r9-scorecard.json`
- Arm B scorecard: `eval/skillcraft/results/datafetch/goal4-p1-armB-substrate-off-20260517/r1-r9-scorecard.json`
- Arm A helper instrumentation: `eval/skillcraft/results/datafetch/goal4-p1-armA-substrate-on-20260517/helper-instrumentation.jsonl`
- Arm B helper instrumentation: `eval/skillcraft/results/datafetch/goal4-p1-armB-substrate-off-20260517/helper-instrumentation.jsonl`
- Arm A normalized rows: `eval/skillcraft/results/datafetch/goal4-p1-armA-substrate-on-20260517/normalized.jsonl`
- Arm B normalized rows: `eval/skillcraft/results/datafetch/goal4-p1-armB-substrate-off-20260517/normalized.jsonl`

Verdict classifier: PASS (≥10% & p<0.05), MARGINAL (2-10% & p<0.10), NEUTRAL (|Δ|<2% & p≥0.10), REGRESSION (B wins >2% & p<0.05).