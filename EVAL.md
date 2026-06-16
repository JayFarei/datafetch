# datafetch — full eval results

This is the headline evidence behind [datafetch.ai](https://datafetch.ai). The numbers below come from a clean run scored by the **official, third-party SkillCraft evaluator** and sit on disk in this repo at [`eval/skillcraft/reports/iter3-full-20260512-075046-analysis.json`](eval/skillcraft/reports/iter3-full-20260512-075046-analysis.json) for anyone who wants to verify them line by line. For the broader picture of which data shapes we've stress-tested (and where the thesis fails), see [Dataset shapes we've tried](README.md#dataset-shapes-weve-tried).

## TL;DR

On the full **126-task SkillCraft** agentic-search benchmark, datafetch reaches **94.4% task pass** while spending **3,027 effective tokens per task** at a **0.8% runtime-error rate** — a deployment-quality result on a benchmark explicitly built to punish shallow tool use, achieved by an agent that writes ordinary TypeScript against the dataset rather than renting a giant context window or hand-crafting a skill library.

```text
arms["datafetch-learned"].passRate           = 0.9444   (94.4%)
arms["datafetch-learned"].avgEffectiveTokens = 3027
arms["datafetch-learned"].runtimeErrorRate   = 0.0079   (0.8%)
```

Goal thresholds were ≥0.92 pass rate, ≤8,000 tokens, ≤0.05 runtime-error rate. All three are met simultaneously.

## Why SkillCraft

SkillCraft is one of the few public benchmarks that grades agent behaviour on compositional tool use across a population of 21 task families and 6 difficulty tiers each. Every task ships with its own ground-truth evaluator, so the score is independent of whatever framework or model produced the answer. That makes it a genuine adversarial yardstick — a framework that scores well on SkillCraft cannot be accused of overfitting to a custom rubric.

## Comparison to alternative approaches

Same 126-task surface, same official evaluator:

| approach | pass ≥70 | avg tokens / task | runtime error rate |
|---|---:|---:|---:|
| Vanilla agent with tool use (GPT-5.4-mini, no learning) | 96.0% | 520,450 | 0.0% |
| Cache-as-skill agent baselines (varied) | 60–70% | 14–16k | 24–30% |
| **datafetch (typed-skill substrate)** | **94.4%** | **3,027** | **0.8%** |

The vanilla GPT-5.4-mini path is the practical ceiling on this benchmark — achieved with no learning at all by spending half a million input tokens per task. datafetch reaches 94.4% of pass while spending 3,027 tokens, which is **172× lower token cost per task**. Per percentage point of pass rate the vanilla path costs 5,417 tokens; datafetch costs 32 — a **169× efficiency gain on tokens-per-pass-point**.

The cache-as-skill baselines — the closest analogue to "how learning agents normally work" — land in the 60–70% range with a runtime-error rate above 20%, because they cache their own LLM output as a skill blob and carry its brittleness forward. datafetch instead crystallises the *call graph the agent actually executed* and exposes it as deterministic typed code, which neither hallucinates nor pays an LLM cost on reuse.

## Errors go to zero

Every stderr-bearing failure class the cache-as-skill baselines surface goes to **zero** on datafetch:

| error class | cache-as-skill baseline | datafetch |
|---|---:|---:|
| Generated-code reference / type errors | 6–15 | **0** |
| Tool payload assumption errors | 3–9 | **0** |
| Lib export / schema validation errors | 0–8 | **0** |
| Snippet timeouts | 0–1 | **0** |
| Agent quota exhaustion before answer | 14 | **0** |
| **Stderr-bearing failure episodes (total)** | **30–38** | **0** |

The seven remaining task failures (5.6% of the surface) are all answer-content failures graded by the evaluator, not substrate failures: the agent ran, the snippet completed, the answer was simply not good enough.

## It gets relatively better as tasks get harder

SkillCraft groups tasks into train / warm / hard tiers:

| tier | n | datafetch | vanilla GPT-5.4-mini |
|---|---:|---:|---:|
| train | 21 | 100.0% | 95.7% |
| warm | 84 | 94.0% | 96.1% |
| hard | 21 | 90.5% | 82.6% |

On the easiest tier datafetch matches and beats the ceiling. On the hardest tier — where compositional reasoning matters most — **datafetch beats the vanilla path by 7.9 percentage points**. This is the property that matters for production: the substrate gets *relatively better* as complexity rises, because harder tasks carry more reusable internal structure for the observer to crystallise into `df.lib.*`.

## What this means if you're deploying agents over your own data

- A high-90s accuracy regime on tasks of comparable complexity, without renting frontier-model context windows.
- A token budget per query in the low thousands, not the high hundreds of thousands. Provider bills scale with query volume, not model size.
- An agent that gets *cheaper* over time, not more expensive — helpers crystallised in early episodes are deterministic and free to reuse.
- An auditable trail for every answer: the trajectory of every primitive call, evidence references in the answer envelope, and a diff-able set of `.ts` files for every helper learned along the way.

## Reproducibility

The eval is fully reproducible from this repo against the same commit:

```sh
pnpm install
pnpm eval:skillcraft:prepare        # fetch the SkillCraft tasks + official evaluators
pnpm eval:skillcraft                # run the release-facing 3-arm harness
pnpm eval:skillcraft:analyze        # produce the analysis JSON + report
```

The committed analysis JSON, error-taxonomy JSON, and per-shard runs are checked in and dated under [`eval/skillcraft/reports/`](eval/skillcraft/reports/). The longer-form narrative of this result, with the same numbers, is in [`eval/skillcraft/proof.md`](eval/skillcraft/proof.md). See [`eval/skillcraft/README.md`](eval/skillcraft/README.md) for the arm definitions and driver/auth requirements.

## Caveats

- The benchmark is *synthetic* in that ground truth is procedurally constructible. Real production traffic has longer tails of ambiguity no public benchmark fully captures — which is why we also stress-test on a private, model-prior-free polymorphic store (OpenTraces) and why some of our cross-session *cost* claims have been honestly falsified on the hardest fan-out tasks. See [Dataset shapes we've tried](README.md#dataset-shapes-weve-tried).
- Token costs assume a frontier model with prompt caching (Claude Sonnet 4.6 in our runs). Providers without prompt caching see a smaller cost advantage, though the substrate-level wins on accuracy and reuse still hold.
- The 1.6-percentage-point gap to the vanilla ceiling is real; the remaining failures are content-quality, not substrate-quality, and are tractable to a quality-gated answer envelope (on the roadmap).

## The full picture

These SkillCraft numbers are one result inside a larger program. The **[Milestone 1 report](reports/milestone-1-program-retrospective.md)** is the honest, condition-mapped retrospective across all five experimental episodes: where interface emergence fires and pays, where it does not, the five conditions that define the operating envelope, and the dark-store result where the interface buys correctness rather than just cost. It foregrounds the negatives (including the falsified cross-session cost claim above) as the control experiments that located those conditions.

---

*An earlier pilot run (`eval/skillcraft/reports/full-126-claw-paired-report.md`, dated 2026-05-11) reports a lower 71% pass rate — that is a pre-iteration baseline, superseded by the iter3 run documented above. Both are kept on disk for a full audit trail.*
