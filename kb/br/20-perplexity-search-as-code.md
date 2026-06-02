---
title: "Perplexity Search as Code (SaC): Industrial Validation of the Code-Mode Data Interface, and Where It Threatens Our Novelty"
date: 2026-06-02
mode: deep
sources: "1 primary + 7 internal cross-refs"
status: complete
---

# Perplexity Search as Code (SaC): Industrial Validation of the Code-Mode Data Interface, and Where It Threatens Our Novelty

## Executive Summary

On 2026-06-01, the day after our skill-library baseline brief ([`19`](19-skill-library-baseline-ladder-and-paired-eval-methodology.md)) and three days after the Monigatti workshop brief ([`18`](18-agentic-search-context-engineering-elastic.md)), Perplexity published "Rethinking Search as Code Generation" and announced **Search as Code (SaC)** as their production search architecture across Computer and the Agent API. SaC is, almost line for line, the substrate our briefs 01 and 14 argued for: stop treating search as a monolithic function-call/MCP endpoint, re-architect the stack into atomized composable primitives exposed as an SDK, embed that SDK inside a secure code sandbox, and let a frontier model generate code that assembles a task-specific retrieval pipeline on demand. Their three-layer stack (models as control plane + compute sandboxes + Agentic Search SDK) is a near-exact match for our (model + dataset harness + typed `df.d.ts` namespace). The bottom line for the project: **the core architectural bet is no longer speculative, a frontier vendor just validated it at thousands-of-queries-per-second scale with hard benchmark numbers (SaC beats the same-infrastructure non-SaC baseline by +19.77pp on DSQA and by 2.5x on their new WANDR wide-research benchmark, and a CVE case study hit 100% accuracy at an 85.1% token reduction).** That is the single strongest external confirmation we have received that code-mode-over-a-data-plane is the right direction.

The validation is broad and specific. SaC keeps high-level end-to-end pipelines available "as a form of shorthand" that the model can use or bypass as the task demands, which is exactly the low-floor/high-ceiling combination brief 18 told us to adopt, now confirmed by a second independent party. SaC teaches its non-pretrained SDK with sub-2000-token Agent Skills carrying few-shot composition patterns, which is our codifier-skill preseed and directly corroborates the iter3.0a "mandate-strength preseed" finding ([`project_iter3_0a_finding`] in memory). SaC chose **filesystem-based serde over a persisted REPL** for cross-turn state, finding it "better reliability on particularly long trajectories" and conjecturing that "requiring models to convey state declaratively rather than implicitly helps them manage that state more effectively", which validates our file-backed `lib/<tenant>/*.ts` persistence over any in-memory warm-state shortcut and echoes brief 19's persistence-as-abstraction-beats-persistence-as-transcript result. And SaC runs a continuous **autoresearch loop** that jointly optimizes the SDK and the Skills against latency, codegen quality, and task performance, which is the observe-and-improve half of our observe-gate-crystallise loop, arrived at independently for the third time (Monigatti was the second).

The invalidation is narrower but real and it is about **novelty, not correctness**. SaC industrially occupies the "code-mode interface over a data/search plane" claim, so any pitch that leads with that idea now reads as catching up to Perplexity rather than introducing something new. Our defensible difference is precisely where briefs 14 and 19 already located it, and SaC's design choices sharpen rather than erode it: SaC's autoresearch optimizes the *shared* SDK and Skills offline over weeks with engineers in the loop, and it keeps task-specific helpers **ephemeral** (their "code as gap-filler" is generated, used, and discarded within a trajectory). SaC has **no per-tenant crystallisation of helpers from live trajectories, no cross-session persistence of those helpers, and no quarantine/replay-validation governance contract** for auto-generated code. That is the entire datafetch learning arc, and SaC's deliberate choice to keep helpers ephemeral is consistent with brief 19's prediction that single-session persistence yields ~0 correctness lift on a frontier model, which is exactly why our value claim must rest on amortisation, cross-session persistence, and governance rather than on the interface itself. One important nuance for honesty: SaC's headline +19.77pp is SaC-vs-monolithic-pipeline, our Arm 0/Arm 1 distinction from brief 19, not the inline-rewrite-no-persistence comparison that is our actual crux; SaC validates "code-mode beats the monolith" (which we already believed) and is silent on "governed persistent library beats inline rewrite" (which we still have to prove ourselves).

## Overview

**What it is.** A long-form research article (5,538 words) plus a product launch. Perplexity is rolling SaC out in Perplexity Computer and the Agent API. It follows their September 2025 architectural overview and a query-aware-context-compression line of work. The article is engineering-grade: it states the failure modes of monolithic search, lays out the three-layer design with named trade-offs, presents a real CVE-advisory case study with stylized trajectory code, and reports a five-benchmark evaluation against four competitors (OpenAI Responses, Anthropic Managed Agents, Exa, Parallel). No code or SDK is public; this is a published architecture and a results table, not a library to adopt.

**Why it matters to us.** Every brief from [`01`](01-voyage-ai-code-mode-data-interface.md) (Cloudflare code-mode + Voyage data plane) through [`14`](14-codex-code-mode-strategic-implications.md) (Codex `exec`/`wait` isolates) has argued the code-mode-data-interface thesis from the wrapper-and-runtime side. SaC is the first time a frontier search vendor has published the same thesis applied to a production *retrieval* stack, with benchmarks, and named it. It moves our substrate from "future-aligned and speculative" to "future-aligned and demonstrated by a competitor". That is simultaneously the best validation and the clearest novelty pressure we have seen.

**Traction signals.** Production rollout across two shipping products (Computer, Agent API); GPT 5.5 high-reasoning as the SaC control model in the eval; a new benchmark (WANDR) promised "in the coming weeks"; framed as the new reference architecture, not an experiment.

## How It Works

SaC replaces the monolithic search contract (accept a query, run a fixed pipeline, return a processed resultset) with three tightly coupled layers. Not a single retrieval operation is dispatched through function-calling or MCP; everything is orchestrated via model-generated Python code.

```
   +----------------------+   generates code   +-----------------------------+
   |  Model (control      | -----------------> |  Compute sandbox            |
   |  plane): GPT 5.5      |                    |  (deterministic runtime,    |
   |  decomposes task,     | <----------------- |   control flow, batching,   |
   |  decides pipelines    |   text(...) only   |   filter/join/aggregate)    |
   +----------------------+                    +-------------+---------------+
                                                             | imports
                                                             v
                                              +-----------------------------+
                                              |  Agentic Search SDK         |
                                              |  atomized primitives:       |
                                              |  retrieval, ranking,        |
                                              |  filtering, fanout,         |
                                              |  rendering, llm.extract...  |
                                              +-------------+---------------+
                                                            | sits atop
                                                            v
                                              +-----------------------------+
                                              |  Perplexity search infra    |
                                              |  (universal I/O layer)      |
                                              +-----------------------------+
```

### The three layers

- **Models as control plane.** The model reasons about the directive, decomposes it into tasks, decides which retrieval/processing pipelines each task needs, and emits code to implement them. SaC uses GPT 5.5 (high reasoning) in the eval.
- **Compute sandboxes.** Secure code-execution runtime that runs the model-generated code and provides the canvas for control flow, batching, retries, filtering, joining, and aggregation. This is our dataset harness; the analogy in [`project_canonical_analogy`] (dataset harness as browser harness, query mount as temporary worktree) lands cleanly here.
- **Agentic Search SDK.** Not a preexisting API packaged as a library; they "rearchitected our search stack into modular, composable primitives" and exposed them at "the most atomic level possible". High-level end-to-end pipelines remain available as shorthand the model can use or bypass. The SDK is embedded in the sandbox runtime so a single inference turn can orchestrate thousands of operations.

### The three failure modes SaC is built to kill

These map one-to-one onto problems our briefs already named:

1. **Coarse context.** A monolithic recall-oriented endpoint floods context when the task needs one surgical fact, or forces serial reuse of a suboptimal pipeline when the task needs many different strategies. This is brief 18's low-floor-tool-cannot-express-the-query problem.
2. **Failure to leverage domain knowledge.** The model may know (from training, a skill, memory, or earlier tokens) that it should blend lexical and semantic signals a particular way or prioritize certain sources, but a rigid query-parameter interface cannot act on that knowledge.
3. **Inefficient control flow and context pollution.** Fan-out, parallel fetch, dedup, and async control flow forced through model turns add latency and pollute context with intermediate state, causing more compactions. This is precisely why we push aggregation into the helper rather than tallying rows in token space (brief 18, aggregation outsourcing).

### Design decisions worth copying

- **Runtime choice.** They evaluated Python, Rust, TypeScript, and Bash; Python won on ubiquity and data-processing ecosystem. (We are TypeScript-first via `df.d.ts`; the choice is corpus- and ecosystem-dependent, not a correctness issue, but worth noting they landed elsewhere for the same reasons.)
- **Cross-turn state: filesystem serde, not REPL.** They tested both. The persisted-REPL approach is more token-efficient (variables referenced by name across turns, no serde code) but degrades on long trajectories "for reasons familiar to anyone who's worked with a 100-cell Jupyter notebook": the namespace clutters and the model loses track of what is persisted and why. Filesystem-based serde with explicit serialize/deserialize steps gave better reliability on long trajectories. Their conjecture: declarative state conveyance beats implicit. This is a direct, independent vote for our file-backed `lib/<tenant>/*.ts` persistence model over any in-memory warm cache.
- **Skills to teach a non-pretrained SDK.** "Unlike a language's standard library, a custom-built SDK is unlikely to be represented in pretraining data", so source plus autogenerated docs are not enough. They built highly-tuned Agent Skills, sub-2000 tokens in the root `SKILL.md`, spending most tokens on "concise, generalizable guidance and few-shot examples for composing these blocks", optimized through a dedicated autoresearch loop. This is our codifier-skill preseed, and the "fewer than 2000 tokens, mostly composition few-shots, reinforce in prompt" recipe is directly actionable on our preseed.
- **Autoresearch loop.** A continuous (weeks-long) loop proposes and validates SDK and Skill improvements against latency, codegen quality, and overall task performance. This is the observe-and-improve half of our loop, though crucially it operates on the *shared* SDK and Skills, not on per-tenant crystallised helpers (see Limitations).
- **Code as orchestrator and gap-filler.** Beyond composing existing primitives, code fills capability gaps the SDK lacks, for example fanning out parallel SDK calls to collect a superset, deduping, then writing deterministic code to narrow to an exact regex the query syntax cannot express. This is exactly our high-ceiling `exec` surface, and it is the rationale for keeping the SDK parsimonious rather than adding a function for every niche operation.

### The CVE case study (the amortisation proof point)

Task: identify and characterize 200+ high-severity CVEs from 2023-2025, each citing the vendor's own advisory and binding a specific CVE to a product and fix version. The trajectory shows three code blocks: (1) pure orchestration that encodes the source-class rule directly into a `web_many` fan-out over vendor-specific advisory query templates; (2) an LLM-as-planning-subroutine that summarizes coverage, asks for targeted refinements on sparse vendor-years, and validates each proposed query before execution; (3) a result verifier defined entirely by the agent via a typed `llm.extract_many` schema (`matches`, `cve`, `fix_version`, `version_bound_to_cve`, `confidence`) that dedupes by CVE and rejects weak evidence. **Result: 100% accuracy, token usage down from 288.7K to 42.9K (-85.1%) versus the non-SaC baseline; all non-Perplexity systems scored below 25%.** This is the clearest published instance of the exact endpoint brief 19 says is our live edge: large cost/token reduction at equal-or-better correctness as the pipeline is composed rather than serially round-tripped (compare SkillCraft's -41% tokens at neutral correctness).

### Evaluation results

Five benchmarks: DSQA, BrowseComp, HLE, WideSearch (preexisting), and the new WANDR ("wide research"). Single runs, not best-of-N, to isolate architecture from parallelization.

| Benchmark | Perplexity (SaC) | OpenAI | Anthropic | Exa | Parallel |
| --- | --- | --- | --- | --- | --- |
| DSQA | **0.871** | 0.733 | 0.815 | 0.530 | 0.810 |
| BrowseComp | **0.805** | 0.720 | 0.598 | 0.380 | 0.560 |
| HLE | 0.612 | **0.614** | 0.566 | 0.387 | 0.515 |
| WideSearch | **0.651** | 0.522 | 0.590 | 0.471 | 0.584 |
| WANDR | **0.386** | 0.130 | 0.152 | 0.057 | 0.126 |

SaC wins four of five and ties OpenAI on HLE. The SaC-vs-non-SaC same-infrastructure delta is +19.77pp (29%) on DSQA and +12.00pp (45%) on WANDR. On the cost-performance frontier (DSQA, WideSearch), all three SaC reasoning levels sit on the upper-right frontier; even low-reasoning SaC is cheaper than every non-SaC system while beating some of them. WANDR remains unsaturated even for SaC (0.386), the wide-research-orchestration regime is still hard, which is the regime our crystallisation and persistence should most help and where brief 16's CRAG/wide-research direction has headroom.

## Strengths

- **First production-scale, benchmarked validation of code-mode-over-a-data-plane.** Hard numbers against four named competitors, on a stack serving thousands of qps. This converts our briefs 01/14 thesis from speculation to demonstrated practice.
- **Independent convergence on the low-floor/high-ceiling combination.** "High-level pipelines as bypassable shorthand" is brief 18's curated-combination recommendation, now confirmed by a second party who never saw our work.
- **Independent convergence on the autoresearch/observe loop.** Continuous joint optimization of SDK and Skills against task metrics is the observe-and-improve half of our loop; third independent arrival at the pattern (after Monigatti).
- **A clean filesystem-serde-over-REPL result.** Their long-trajectory reliability finding and declarative-state conjecture are direct, citable support for our file-backed persistence and against in-memory warm state.
- **A concrete amortisation proof point.** The CVE case study (100% accuracy, -85.1% tokens) is precisely the cost-at-equal-correctness endpoint brief 19 identifies as our defensible value surface; it is external evidence the endpoint is real and large.
- **A wide-research benchmark to track.** WANDR is unsaturated and the spread is enormous (SaC 2.5x next best, most competitors near floor). When published it is a candidate companion corpus to CRAG for the persistence/orchestration regime where our claim is strongest.

## Limitations & Risks

- **Novelty pressure on the headline claim.** SaC industrially occupies "code-mode interface over a data/search plane". Leading a pitch with that idea now reads as following Perplexity. The product one-liner from brief 14 must lead instead: "Code mode for tools/data compresses the input and the work; *crystallisation with governance* removes the cold path entirely on the second similar intent." SaC compresses per-turn work; it does not remove the cold path across sessions or tenants.
- **SaC keeps helpers ephemeral, which both differentiates us and validates brief 19's null.** Their "code as gap-filler" is generated, used, and discarded within a trajectory. There is no per-tenant crystallised library, no cross-session persistence of task-specific helpers, and no quarantine/replay-validation governance contract for auto-generated code. The entire datafetch learning arc (observe, gate, crystallise into `lib/<tenant>/*.ts`, warm-path 4-to-2 tier collapse, governed reuse) is the gap SaC does not fill. Their choice to keep helpers ephemeral is consistent with brief 19's prediction that single-session persistence yields ~0 frontier-model correctness lift, which is exactly why our value must be claimed on amortisation, cross-session persistence, and governance, not on the interface.
- **Their benchmark answers the easy comparison, not our crux.** SaC-vs-non-SaC is code-mode-vs-monolith (our Arm 0/coarse-context contrast), not inline-rewrite-no-persistence (our Arm 1). The +19.77pp validates "code-mode beats the monolith" (already our prior) and is silent on "governed persistent library beats inline rewrite" (still unproven, still ours to demonstrate per brief 19's five-arm ladder).
- **Closed and unreproducible.** No public SDK, no released benchmark yet, no per-task cost table beyond the frontier plots, several figures are described not quantified. Treat headline numbers as vendor-reported. WANDR is promised but not published.
- **Frontier-model and infra dependence.** SaC runs on GPT 5.5 high reasoning atop Perplexity's proprietary atomized search infra and hardened sandboxes ("their overarching system design merits an article of its own"). The architecture's gains are entangled with infra investments we do not have; the transferable content is the *pattern and the design decisions*, not a portable result.
- **Runtime divergence.** They chose Python; we are TypeScript-first. Not a defect, but a reminder that the SDK-consumability and skill-teaching work is runtime-specific and our preseed must be tuned for our runtime, not lifted from theirs.

## Integration Analysis

**1. What to extract.**

- **Reframe the pitch around the learning arc, not the interface.** Update the hackathon narrative and `kb/docs` so the code-mode data interface is presented as the now-validated *substrate* (cite SaC as industry proof) and datafetch's contribution is the *governed crystallisation layer on top*: per-tenant helpers crystallised from observed trajectories, replay-validated and quarantined, persisted across sessions, amortising cost as reuse density rises. SaC is the strongest possible "the substrate is real" citation and simultaneously the clearest "and here is what nobody has built on top" contrast.
- **Adopt the filesystem-serde-over-REPL finding as design support.** Cite SaC's long-trajectory reliability result and declarative-state conjecture wherever we justify file-backed `lib/<tenant>/*.ts` persistence over in-memory warm state. It is independent confirmation of a choice we already made.
- **Tighten the codifier-skill preseed to SaC's recipe.** Sub-2000-token root skill, most tokens on few-shot composition patterns (not an API listing, which runtime reflection can supply), reinforced in the system prompt with a mandate-strength relationship. This operationalizes the iter3.0a finding and matches what a frontier vendor found necessary to make a non-pretrained SDK usable.
- **Keep the high-ceiling `exec` surface and a parsimonious typed namespace.** SaC's "code as gap-filler" rationale (do not bloat the SDK with niche functions; let code fill gaps) is a direct argument for our atomic `df.d.ts` primitives plus a general `exec`, and against over-specializing the typed surface.
- **Borrow the CVE-case-study shape for our amortisation demo.** A fan-out + LLM-planning-subroutine + typed-schema-verifier trajectory that reports tokens-at-equal-correctness is the demo template for brief 19's cost-at-neutral-correctness primary endpoint. Our version adds the second-intent warm path SaC lacks: run a sibling task and show the crystallised helper collapsing the cold path while SaC-style ephemeral code re-derives it.
- **Track WANDR.** When published, evaluate it as a companion to CRAG for the wide-research/persistence regime where SaC itself is unsaturated (0.386) and where our crystallisation should help most.

**2. Bootstrap path.**

- Minimal first step: add a "Prior art: Perplexity SaC" paragraph to the interface-design doc and the pitch, positioning SaC as substrate-validation and datafetch as the governed-crystallisation layer above it. Re-read brief 14's "code mode compresses input; crystallisation compresses work" one-liner through SaC's ephemeral-helper choice. No code. (Quick)
- Next: tune the codifier-skill preseed to the sub-2000-token, composition-few-shot, mandate-relationship recipe, and audit the harness for the filesystem-serde-vs-REPL choice (confirm no in-memory warm-state path competes with file-backed persistence). (Short)
- Eval: ensure the CRAG paired runner (brief 19) reports the SaC-style cost-at-equal-correctness endpoint as a co-primary, and design the second-intent warm-path demo (crystallised helper vs ephemeral re-derivation) as the visible differentiator SaC's architecture cannot produce. (Medium, eval-harness work)
- Optional: when WANDR releases, scope a small probe to see whether our persistence regime moves the needle on a wide-research task where even SaC is unsaturated. (Medium-to-Large)

**3. Effort estimate.** Pitch and doc reframing: **Quick (< 1h)**. Preseed tuning + harness serde audit: **Short (< 4h)**. SaC-style cost endpoint + second-intent warm-path demo in the eval harness: **Medium (< 1d)**. WANDR probe (gated on its release): **Large (> 1d)**.

## Key Takeaways

1. **Strong validation of the substrate.** A frontier vendor shipped our briefs-01/14 architecture (model + sandbox + atomized SDK, code-generated pipelines, high-level pipelines as bypassable shorthand) in production with hard benchmarks (+19.77pp DSQA over same-infra monolith; 100% accuracy at -85.1% tokens on the CVE case study). The code-mode-over-a-data-plane bet is no longer speculative. Lead the pitch with SaC as proof the substrate is real.
2. **The validation sharpens, and partially threatens, our novelty.** SaC occupies the interface claim and, by keeping helpers ephemeral, deliberately does not build the per-tenant, cross-session, governed crystallisation layer that is the entire datafetch learning arc. That is now our only defensible novelty surface, exactly where briefs 14 and 19 already placed it. Do not pitch the interface; pitch the governed learning arc on top of it.
3. **SaC validates our value-endpoint choice while leaving our crux unproven.** Their CVE case study is the cost-at-equal-correctness amortisation win brief 19 says is our live edge, and their ephemeral-helper choice is consistent with brief 19's prediction that single-session persistence gives ~0 frontier correctness. But their benchmark is code-mode-vs-monolith (Arm 0), not inline-rewrite-no-persistence (Arm 1), so "governed persistent library beats inline rewrite" remains ours alone to demonstrate.
4. **Three concrete design confirmations to bank now.** Filesystem-serde over REPL for long-trajectory reliability (supports our file-backed `lib` persistence); sub-2000-token composition-few-shot Skills to teach a non-pretrained SDK (supports the mandate-strength preseed, iter3.0a); code-as-gap-filler over a parsimonious atomic SDK (supports our typed namespace plus high-ceiling `exec`). Each is an independent vendor vote for a choice we already made.

## Sources

- [Rethinking Search as Code Generation, Perplexity Research, 2026-06-01](https://research.perplexity.ai/articles/rethinking-search-as-code-generation), the primary source: architecture, three-layer design, CVE case study with trajectory code, five-benchmark evaluation table, cost-performance frontier, and the filesystem-serde-vs-REPL discussion. Fetched as clean markdown via defuddle; figures 1-8 are described in-article but the underlying images were not separately analyzed.
- Perplexity, [Architecting and Evaluating an AI-First Search API](https://research.perplexity.ai/articles/architecting-and-evaluating-an-ai-first-search-api) (Sept 2025), the prior architectural overview SaC builds on (referenced, not independently reviewed).
- Benchmarks named in the article (not independently reviewed): DeepSearchQA/DSQA (arXiv 2601.20975), BrowseComp (arXiv 2504.12516), HLE (arXiv 2501.14249), WideSearch (arXiv 2508.07999), and WANDR (Perplexity, unpublished as of this brief).

Internal cross-references:
- [`01-voyage-ai-code-mode-data-interface.md`](01-voyage-ai-code-mode-data-interface.md), the original code-mode-data-interface thesis (Cloudflare pattern + Voyage data plane).
- [`14-codex-code-mode-strategic-implications.md`](14-codex-code-mode-strategic-implications.md), Codex `exec`/`wait` isolates; the "code mode compresses input, crystallisation compresses work" one-liner; datafetch's unique learning arc.
- [`18-agentic-search-context-engineering-elastic.md`](18-agentic-search-context-engineering-elastic.md), low-floor/high-ceiling vocabulary; the start-general-then-carve-specialized crystallisation methodology; aggregation outsourcing.
- [`19-skill-library-baseline-ladder-and-paired-eval-methodology.md`](19-skill-library-baseline-ladder-and-paired-eval-methodology.md), the five-arm baseline ladder; Arm 1 inline-rewrite-no-persistence as the real crux; amortisation/persistence/governance as the value surface; the single-session frontier-correctness ~0 prediction.
- [`16-substrate-benchmark-scouting.md`](16-substrate-benchmark-scouting.md), [`16-post-skillcraft-benchmark-selection.md`](16-post-skillcraft-benchmark-selection.md), CRAG/wide-research benchmark direction.
- [`17-crag-shape-probe-findings.md`](17-crag-shape-probe-findings.md), the silent-wrong-answer landmine that motivates the governance contract SaC lacks.
