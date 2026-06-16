---
title: "feat: Online interface synthesis — the oracle-regret benchmark (datafetch v2)"
summary: "Make the datafetch thesis measurable by manufacturing a gold target interface with an omniscient offline oracle, then scoring how fast an online algorithm converges to it (regret) as intents and data are revealed incrementally — three arms (no-memory / md-memory / code-memory) against the oracle ceiling, on synthetic data with deterministic ground truth."
type: feat
status: proposed
date: 2026-06-08
related_research:
  - kb/br/19-skill-library-baseline-ladder-and-paired-eval-methodology.md
  - kb/br/01-voyage-ai-code-mode-data-interface.md
  - kb/br/11-pysyft-force-intent-declaration.md
  - kb/br/05-agent-workflow-memory.md
  - kb/br/20-perplexity-search-as-code.md
  - kb/plans/009-sac-aligned-poc-skillcraft.md
---

# Online interface synthesis — the oracle-regret benchmark

*v2 successor to plan 009. 009 (the SaC PoC on SkillCraft) ran its pre-registered headline to completion and falsified it (cross-session cost amortisation: arm4 warm > arm1 inline in every token unit, less correct), and the program assessment (`experiments/episodes/03-sac-poc/ASSESSMENT-2026-06-04.md`) recorded the root cause: v1 was an **unsupervised emergence experiment against the wrong baseline with an unobservable target**. This plan fixes all three at once. It is a design lock, not a build order — no runner is written until the objective, the oracle, and the gates below are agreed.*

## Overview

We make the thesis measurable by **manufacturing the label**. Give a model the unfair, omniscient view — the full intent distribution, the data shape, the volume, the luxury of development time — and ask it to design the most efficient interface. Because it had perfect foreknowledge, its output is a defensible **ceiling** (`I*`): what a perfect engineer builds when they already know everything. The runtime system never gets that view; it must converge toward `I*` from incremental, partial observation. The gap at each step is **regret**, and the research collapses to one well-posed question: *design the incremental interface-derivation policy that minimises regret against the oracle.* We score three arms — **no-memory**, **md-memory** (the real incumbent), **code-memory** (datafetch) — on one computable objective, against the oracle ceiling, on synthetic data whose ground-truth answers we generate for free. The deliverable is the rig + the first regret curves, fast enough that a NO arrives in days.

## Problem Frame

v1's three structural mistakes, each fixed here:

1. **Unobservable target.** v1 asked "will the agent spontaneously crystallise a helper that pays off?" with no definition of the right interface, so every negative was confounded (was the derivation bad, did the model refuse to use it, were the economics adverse this week?). The oracle makes the target observable: `I*` is a concrete interface with a measured loss `L(I*)`.
2. **Wrong baseline.** v1 pitted code-memory against *no-memory* (inline-rewrite by a frontier model) — a tokens-cheap adversary nobody ships — and lost on cost. The market runs **md-memory** (prose notes: Mem0, Letta, CLAUDE.md, RAG-over-text). The contest that decides whether this is a product, code-memory vs md-memory, was never run. This plan runs it.
3. **Conflated learning-rule with agentic-realisation.** v1 tangled "what interface should accrete from usage" (the learning algorithm) with "will an agent produce it" (the substrate). This plan isolates the algorithm first (Stage 1, synthetic, fast); the substrate's realisation is a named, deferred Stage 2.

The locked thesis (north star, fixed for the duration): **datafetch is a code-memory access layer that accretes the optimal interface from incremental usage — schema-on-read for the agentic era.** It wins where inline-rewrite-no-persistence structurally cannot reach: it converges toward the omniscient interface from partial observation, it self-heals when data drifts, and it pays the organisational cost incrementally by use instead of upfront by a data team. The win is measured in **regret against the oracle** and in **human/activation cost**, not in raw tokens vs a frontier model rewriting 20 lines.

## Requirements Trace

- R1. The objective `L(I)` is fully **computable and deterministic** — no LLM judge. Because the data is synthetic we hold ground-truth answers for every intent, so correctness is checked by equality, not opinion. `L(I) = E_{t~D}[ runtime_cost(t, I) ] + λ·complexity(I)`, subject to `correctness(I) ≥ c` and `coverage(I) ≥ v`. `runtime_cost(t,I)` = caller-program tokens to answer intent `t` through `I` + execution calls made. `complexity(I)` = total interface size (the parsimony/maintenance penalty that forces the oracle toward *general, parameterised* families rather than one endpoint per intent).
- R2. The **oracle ceiling is honest.** The oracle is given `(full intent distribution D, data shape S, volume V)` and emits `I*` minimising `L`. Codex's adversarial job (Track B) is to *beat the oracle* — find a lower-`L` interface. If it can, the ceiling is raised before any arm is scored. `L(I*)` is published with the prompt and the generator seed.
- R3. **One objective, four lines on one figure.** The three arms (no-memory / md-memory / code-memory) and the oracle ceiling are scored on the *same* `L`. The headline artifact is a regret curve: `regret(t) = L(I_t) − L(I*)` vs number of intents seen, with the oracle at zero and no-memory as the flat upper line.
- R4. The **data generator exposes recurrence density, composition depth, and drift as explicit knobs.** A recurrence **sweep** is run (from high-recurrence to mostly-novel), not a single cherry-picked level, and the regime where code-memory *should* fail (low recurrence) is reported. Built-in recurrence is disclosed in every result (the v1 honesty rule).
- R5. The **regret metric** is convergence rate + asymptotic gap, plus three operational sub-metrics that isolate where code-memory structurally wins: caller-tokens-per-task as the stream grows (code bends sub-linear, md drifts up), correctness vs composition depth, and **post-drift regret recovery** (the staleness probe).
- R6. The **md-memory arm is a strong, best-practice implementation** (structured notes + retrieval + summarisation, Mem0/Letta-grade), built by codex *to win*. A documented strawman invalidates the comparison.
- R7. **Stage separation is enforced.** Stage 1 tests the learning *rule* (an algorithm deriving `I_t` directly from observed `(intent, program, answer)` tuples vs `I*`) with **no agent and no live model loop in the scoring path**. Stage 2 (deferred, named in §Milestones) proves the datafetch agent+observer *implements* the winning rule.
- R8. **Pre-registration + adversarial audit.** The predicted regret-curve shape is pre-registered before each gate. Every gate result must survive a codex adversarial challenge (find the confound, the rigged distribution, the cherry-pick) before it counts. `claimUpheld=false` is a terminal PASS, exactly as in 009.

## Scope Boundaries

- **No agentic loop in Stage 1.** The online algorithm is tested directly on `(intent, data)` streams; no `claude-p`, no observer, no live agent in the scoring path. (That is Stage 2.)
- **No real-corpus dependency.** The generator is synthetic with controlled structure; validating the generator against a real intent log is deferred to Stage 1.5.
- **No `src/` substrate changes for Stage 1.** The benchmark is a standalone rig under `eval/`. The substrate is touched only in Stage 2.
- **No dollar/economics claims.** `L` is an abstract loss in tokens + calls + interface size; the human/activation-cost framing (the Mongo baseline) is argued qualitatively until a Stage-1.5 cost model lands.
- **No claim that the agent realises the rule** until Stage 2. A Stage-1 win proves the target is learnable, not that datafetch learns it.

## Context & Research

- **kb/br/19** (baseline ladder + paired methodology): supplies the arm-discipline and the pre-registration/adversarial-audit spine, retargeted from live paired runs to offline regret.
- **kb/br/01** (Code Mode) + **kb/br/11** (force-intent-declaration): the interface IS a typed callable surface (`fn({...})` / `df.lib.*`); the oracle's `I*` and the online `I_t` are expressed in that same vocabulary, so the synthetic benchmark and the substrate share a contract.
- **kb/br/05** (Agent Workflow Memory): the md-memory incumbent this plan finally benchmarks against; AWM's induce/integrate/utilise is the prose-memory arm's reference design.
- **kb/br/20** (Perplexity SaC): the ephemeral-helper incumbent; datafetch's delta (convergence/persistence/governance) is exactly the regret-reduction + post-drift-recovery this rig measures.
- **plan 009** + `ASSESSMENT-2026-06-04.md`: the falsified v1 and its root-cause, which this plan is the direct response to.
- **This session's design arc** (to be saved as a kb/ concept doc): the four reframes — code-memory vs md-memory vs no-memory; shape-accretes-from-usage (schema-on-read); web-as-everything-dataset; app-for-every-user — are four faces of one thesis. This plan picks the **oracle-regret** method and the **md-memory + upfront-eng** baselines as the operative choices. The pasted **JIT-harness** concept is the execution model (planner writes a bespoke harness per task; the accreted library is the crystallised sediment of JIT runs that proved out).

## Architecture

```
synthetic generator ──► (intent stream D, document store, GOLD answers)
        │                         │
        │                  ┌──────┴───────┐
        ▼                  ▼              ▼
   oracle(D,S,V) ──► I*    online algo ──► I_t (per step)
        │                  (none/md/code arms)
        ▼                         ▼
   L(I*) ceiling ◄──── regret scorer ────► L(I_t), regret(t), sub-metrics
                                  ▲
                          codex adversary
                       (beat the oracle; audit every gate)
```

| Component | Responsibility |
|-----------|---------------|
| `eval/oracle-regret/generator.ts` | Emit `(intent stream, document store, gold answers)` with knobs: recurrence density, composition depth, drift schedule, volume. Deterministic from a seed. |
| `eval/oracle-regret/objective.ts` | Compute `L(I)` = expected caller-program cost + λ·complexity, with deterministic correctness/coverage from gold answers. |
| `eval/oracle-regret/oracle.ts` | Given full `(D,S,V)`, prompt a strong model to emit the ceiling interface `I*`; cache it; expose `L(I*)`. |
| `eval/oracle-regret/arms/{none,md,code}.ts` | The three online arms. `none` re-derives per intent; `md` accretes prose memory; `code` accretes typed callable helpers (the datafetch learning rule, standalone). |
| `eval/oracle-regret/scorer.ts` | Regret curve + the three operational sub-metrics; emits the headline figure data. |
| `eval/oracle-regret/algorithms/` | The online derivation-policy ladder (Milestone M4): naive → shape-hash crystallise → generalise-family → deprecate/re-derive-under-drift. |

### Operating model — parallel tracks, codex roles

| Track | Owner | Deliverable | Kill-gate (fast NO) |
|-------|-------|-------------|---------------------|
| **A — Rig** | us | generator + objective + scorer + the `code` arm's first learning rule | — (enabler) |
| **B — Beat the oracle** | codex (adversarial) | attempts to find a lower-`L` interface than `I*` | ceiling raised if found; keeps the target honest |
| **C — md-memory arm** | codex (adversarial) | a genuinely strong prose-memory arm, built to win | if md self-heals under drift as well as code, the thesis is weak |
| **D — algorithm ladder** | us | progressively smarter online policies | a policy that never reduces regret invalidates the framing |

Codex is **adversarial by contract**: it owns the arm trying to beat us (C) and the attack on our ceiling (B), and it audits every gate (find the confound). Nothing counts as a result until it survives a codex challenge. Each track is written as a codex `/goal`-compatible spec (outcome, verification surface, kill-gate, stop condition).

### Evaluation gates — fast, sequential, cheapest-NO-first

- **Gate 0 — feasibility.** Does the oracle produce a *compact* `I*` (materially below one-endpoint-per-intent)? If not, the distribution has no learnable structure; fix the generator. *(No structure to learn → stop.)*
- **Gate 1 — tracer bullet.** Run the dumbest online algorithm. Does regret reduce *at all* as intents accrue? If nothing converges, the framing is wrong and we learn it in days. *(This is the "fast enough to know if we're correct" milestone.)*
- **Gate 2 — the headline.** Do the three arms separate on the regret curve + caller-tokens + composition correctness, with the oracle as ceiling? *(code < md < none, or the thesis is wrong.)*
- **Gate 3 — staleness/governance.** Inject a drift mid-stream. Does code-memory detect and re-converge (regret recovers) while md-memory stays stale (silently-wrong, regret stuck high)? *(The survivor lever from v1, against the right baseline.)*

## Milestones

1. **M1 — Rig + tracer bullet.** Generator (one recurrence regime), `objective.ts`, `oracle.ts`, scorer, the `none` arm, and the dumbest `code` arm. Passes Gate 0 + Gate 1. *Effort: Medium (< 1d).*
2. **M2 — Three arms + the headline figure.** The strong `md` arm (codex, Track C) + the `code` arm; the recurrence sweep; Gate 2. *Effort: Medium.*
3. **M3 — Staleness probe.** Drift schedule in the generator + post-drift regret recovery; Gate 3. *Effort: Short (< 4h).*
4. **M4 — Algorithm ladder.** Ablate online derivation policies (crystallise / generalise-family / deprecate / re-derive-under-drift) against the oracle ceiling. The actual research. *Effort: Large (> 1d).*
5. **M5 — (deferred) Stage 2: agentic realisation.** Prove the datafetch agent+observer implements the winning rule from M4 in the live loop. Named here so it is not conflated with Stage 1; out of scope until M1–M4 return a positive. *Effort: Large.*

## Files to Modify

| File | Changes |
|------|---------|
| `kb/plans/010-online-interface-synthesis-oracle-regret.md` | This plan. |
| `eval/oracle-regret/{generator,objective,oracle,scorer}.ts` | New rig (Track A). |
| `eval/oracle-regret/arms/{none,md,code}.ts` | The three arms. |
| `eval/oracle-regret/algorithms/*.ts` | The online-policy ladder (M4). |
| `eval/tests/oracle-regret-*.test.ts` | Deterministic tests: objective math, generator determinism, oracle-cache, scorer regret math. |
| `experiments/episodes/04-oracle-regret/` | The episode log: pre-registered predictions, gate results, the regret figures. |
| `kb/concepts/` (new) | Save the JIT-harness concept doc + the four-reframes synthesis as durable concept notes. |

## Verification

1. `objective.ts` scores a hand-built interface to a known `L` (unit-tested arithmetic).
2. `generator.ts` is deterministic from a seed; gold answers verified by an independent recompute.
3. Gate 0: `L(I*) < L(one-endpoint-per-intent)` by a material margin on ≥3 recurrence regimes.
4. Gate 1: the dumb `code` arm's regret curve is monotone-decreasing on the high-recurrence regime (first tracer bullet).
5. Gate 2: on the recurrence sweep, `regret_code(t) < regret_md(t) < regret_none(t)` on the high/mid regimes; the low-recurrence regime is reported (expected convergence-failure disclosed, not hidden).
6. Gate 3: post-drift, `regret_code` recovers toward `L(I*)` within K intents while `regret_md` stays elevated and md-arm hallucination spikes.
7. Codex audit (Track B) cannot find an interface with `L < L(I*) − ε`; the ceiling is published with seed + prompt.
8. Every gate's pre-registered prediction is committed before the run; the realised result (PASS, or honest NO) is committed alongside.

## Decisions to Lock

| Open fork | Recommendation |
|-----------|----------------|
| **Cost model in `runtime_cost`** | Count both caller-program tokens (primary) and execution calls (secondary). Tokens are the code-vs-md-vs-none differentiator; calls guard against an interface that hides cost in deep chains. |
| **λ (complexity penalty)** | Start at the value where the oracle is *just* forced off one-endpoint-per-intent into parameterised families; sweep it as a sensitivity check. λ is where the API-design tension lives, so report results across a small λ range. |
| **First synthetic domain** | A parameterised document store (entities + attributes + time-series) with templated derivation intents (filter / aggregate / compare / range / rank / join). Maps directly onto `df.db`/`df.lib` and shape-hash family detection, so Stage 2 reuses the vocabulary. |
| **Oracle model + prompt** | Strongest available model, batch, given the full distribution + an explicit statement of `L`. Publish the prompt; let codex attack it (Track B). |
| **correctness `c` / coverage `v`** | `c = 1.0` (synthetic ground truth, no tolerance needed except numeric FAC 1%), `v` = the fraction of the head/torso the oracle itself covers (the tail is provably unreachable online and excluded from the regret denominator). |

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale |
|---|-------|----------|---------------|-----------|-----------|
| 1 | Design | Manufacture the label via an omniscient oracle instead of sourcing a real gold API | Architecture | Observability | Removes the corpus/labeling bottleneck that blocked every prior framing; makes the target a concrete `I*` with a measured loss. |
| 2 | Design | The real label is the computable objective `L`; the oracle is the *ceiling baseline* on it, not metaphysical ground truth | Methodology | Honesty | Avoids inheriting the oracle model's taste; lets codex attack the ceiling; keeps the metric relative and stable. |
| 3 | Design | Metric is regret/convergence, not exact match | Methodology | Correctness | The online algorithm provably cannot pre-build for unseen intents; the tail is unreachable by design (head/torso converges, tail does not). |
| 4 | Baseline | Add the md-memory arm (built strong by codex) as the headline comparator | Scope | Right-baseline | v1 lost to no-memory, which nobody ships; code-vs-md is the contest that decides product-hood and was never run. |
| 5 | Scope | Isolate the learning rule (Stage 1, offline) from agentic realisation (Stage 2, deferred) | Scope | Focus | v1 conflated them and could not tell which was failing; prove the rule converges before proving the substrate implements it. |
| 6 | Scope | Synthetic data with deterministic ground truth; no LLM judge in the scoring path | Architecture | Speed | Makes a single run conclusive (kills the noise that forced v1's k=5), so a NO arrives in days. |
| 7 | Ops | Codex is adversarial by contract (owns the md arm + the beat-the-oracle attack + every gate audit) | Process | Independence | The thing that nearly saved v1 was adversarial review; the thing that hurt it was too few experiments. This bakes both fixes in. |
