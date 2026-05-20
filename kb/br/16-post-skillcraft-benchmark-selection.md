---
title: "Post-SkillCraft Benchmark Selection: Which Public Benchmark Most Accurately Tests the Datafetch Substrate Premise"
date: 2026-05-18
mode: ultradeep
sources: 22
status: complete
---

# Post-SkillCraft Benchmark Selection: Which Public Benchmark Most Accurately Tests the Datafetch Substrate Premise

## Executive Summary

The standing recommendation, FinReflectKG-MultiHop as primary, FinAgentBench as secondary, FinChain as control, is directionally right on schema and evidence labels and the dataset shape *can* host the cold-warm-hard family progression that the datafetch thesis predicts: shape probe on `final_master_dataset.json` (2026-05-18) shows 19 unique patterns across the 555 QA pairs, with 7 patterns in the highest-value 3-hop cross-company cell carrying 13, 12, 11, 7, 3, 3, and 1 siblings respectively — sibling density is fine. The real practical problems are softer: no Claude or GPT-5 baseline numbers exist in the paper (Gemini 2.5 Pro is used as judge, not answerer); no evaluation harness ships with the repo (JSON + README only); the underlying KG carries a CC-BY-NC-4.0 license that complicates any product narrative downstream. The 24% correctness lift and 84.5% token reduction the paper attributes to KG-guided retrieval are real and load-bearing for the premise — that gap is precisely the kind of crystallisable structure a substrate should capture — but realising the framing requires building the eval harness and establishing the substrate-OFF baseline yourself first.

The single most accurate benchmark for proving the datafetch premise as currently framed is **FinChain (parameterised) as the primary discrimination instrument, paired with the FinReflectKG-MultiHop cross-company 3-hop subset as the realism cap, and the existing in-house FinQA/BIRD-SQL corpus as the product-narrative spine**. FinChain wins primacy on three forcing arguments: it is the only candidate where intent families are first-class (290 parameterised templates × executable Python traces = unlimited sibling generation under exact pattern control), it is the only candidate with a reasoning-step metric (ChainEval scores intermediate steps, not just final answers, which is what `kb/docs/benchmarking.md` calls "derivation visibility"), and the paper explicitly documents compositional headroom on GPT-5, Claude 4.5, Gemini 2.5 Pro and Grok 4 Heavy ("systematic weaknesses in long-horizon, compositional reasoning"). FinReflectKG-MultiHop becomes the document-grounded realism cap rather than the primary instrument, because it tests "can the substrate close a 24% gap that has already been quantified by the paper itself" rather than "can the substrate amortise structure across many siblings". This reframing inverts what the original recommendation says, and it is informed by what the public release actually contains, not what the paper aspirationally describes.

There is a fourth candidate the original analysis omits that deserves explicit consideration and explicit rejection as the *primary* instrument: **SkillsBench (arXiv 2602.12670, published 2025)** is the closest existing benchmark to the datafetch premise: 86 tasks × 11 domains × three conditions (no Skills / curated Skills / self-generated Skills) × 7,308 trajectories, with the published headline result that curated Skills lift pass rate by 16.2pp on average while self-generated one-shot Skills lift it by approximately zero, which is a near-verbatim restatement of the user's own jsonplaceholder finding from the SkillCraft cross-eval. SkillsBench is the right *complementary* benchmark, not the right *primary*, because datafetch is specifically about *dataset interfaces* (the `df.db.*` and `df.lib.*` surface), and SkillsBench tests *general agent skills* across office docs, git, and data processing. Running on SkillsBench would test "does our skills system improve agents", but the question we actually want to answer is "does our dataset-interface substrate improve agents on dataset queries". Use SkillsBench as the external generalisation arm, the way the AtlasFS hybrid corpus uses BIRD as the cross-collection control.

## Overview

This document evaluates which public benchmark most accurately tests the datafetch substrate premise after SkillCraft's P1 matched-arm result of `{NEUTRAL, PASS, PASS, NEUTRAL}` (correctness neutral at 92.9% vs 95.2%, tokens -41%, wall-clock -17%, σ-tokens neutral). The premise, as encoded in `kb/elevator.md` and operationalised in `kb/docs/benchmarking.md`, is that a code-mode dataset harness that learns visible intent programs improves correctness, evidence quality, latency, cost, and robustness *over repeated sessions on the same dataset*, with the load-bearing word being "repeated". The four dimensions where the substrate must amplify are (1) correctness on hard compositional queries, (2) evidence quality with auditable provenance, (3) reuse rate of learned `lib/*` interfaces, and (4) compositional generalisation across cold-warm-hard tiers within an intent family.

The candidates under evaluation:

1. **FinReflectKG-MultiHop** (arXiv 2510.02906, Oct 2025) — financial QA grounded in a 17.5M-triplet KG over S&P 500 10-K filings, 2-hop and 3-hop patterns with KG-path evidence labels.
2. **FinAgentBench** (arXiv 2508.14052, ICAIF 2025, not SIGIR as the original analysis claimed) — two-stage agentic retrieval over five SEC document types, with graded chunk-level relevance labels.
3. **FinChain** (arXiv 2506.02515, with public GitHub at mbzuai-nlp/finchain) — symbolic financial reasoning benchmark with 290 parameterised templates spanning 12 domains × 58 topics, executable Python traces, and a ChainEval metric for verifying intermediate reasoning steps.

Three additional candidates surfaced during verification that the original analysis did not consider:

4. **SkillsBench** (arXiv 2602.12670, 2025) — 86 tasks × 11 domains with curated/self-generated/no-skill conditions, the most direct existing test of the substrate premise.
5. **Spider 2.0** (arXiv 2411.07763, ICLR 2025) — 632 enterprise text-to-SQL workflow problems with 17% peak pass rate on o1-preview, BigQuery/Snowflake/SQLite databases averaging 812 columns, multi-dialect SQL exceeding 100 lines per answer.
6. **FRAMES** (arXiv 2409.12941, Google × Harvard, 2024) — 824 multi-hop questions over 2-15 documents per query, baseline accuracy of 0.40 without retrieval, with Claude 4 Sonnet documented as abstaining on 45% of parametric questions.

The analysis below evaluates each candidate against the seven hard requirements from `kb/docs/benchmarking.md` (which are essentially identical to the seven hard requirements in the original recommendation, since they were authored from the same source), then collapses the comparison into a single most-accurate pick with a concrete bootstrap path.

## How It Works

### What "most accurate for proving the premise" actually means

The original recommendation evaluates candidates against seven requirements (repeated intent families, evidence labels, compositional complexity, noise/ambiguity, reusable structural patterns, real product surface, independent scaling axis). All three of the original candidates satisfy the requirements *at the description level*, FinReflectKG-MultiHop satisfies them most explicitly, which is why it was picked first. This document argues that the description-level satisfaction is a misleading proxy and that the actually load-bearing question is different.

The datafetch thesis is a claim about *amortisation*. The substrate value should compound across sibling queries within a family because:

- The cold-path agent pays the full discovery cost (which KG pattern, which retrieval scope, which entity decomposition, which evidence assembly).
- The observer crystallises the accepted trajectory into a `lib/<tenant>/<name>.ts` function.
- The warm-path agent on a sibling query finds this function via `df apropos`, calls it directly, pays approximately zero discovery cost, and produces an answer with the same nested evidence path.
- The harder-variant query stresses whether the crystallised interface generalises (correct sibling) or over-specialises (regression).

For a benchmark to PROVE this thesis, three things must be true simultaneously, and only the third is genuinely scarce in the candidates:

1. The benchmark must have **enough siblings per family** to detect a difference, with enough families to control for family-level noise. The original analysis treats "≥3 sibling queries per family" as the floor; that floor is fine but it implies you need to count, not just assert. A benchmark with 555 questions across, say, 50 patterns averages 11 per pattern, which is enough, but if the 50 patterns are concentrated in 2-hop intra-company variants and the cross-company 3-hop pattern (the one where the substrate would shine most) has 5 instances, you have a 5-sample family for the only family that matters.
2. The benchmark must have a **machine-checkable answer label** and ideally an **evidence label**. All three candidates pass.
3. The benchmark must contain **structure that is genuinely costly to rediscover but cheap to crystallise**. This is the critical filter the original analysis underspecifies. SkillCraft's null correctness result and the secondary jsonplaceholder finding both point to the same diagnosis: the substrate's crystallised helpers were *below the agent's internal rewrite threshold*. If an agent can derive the answer inline cheaper than calling the helper, the agent will inline, and the substrate's correctness/efficiency advantage will collapse. The benchmark must therefore contain structure that is *expensive to derive inline*.

This third criterion separates the candidates much more sharply than the original analysis suggests.

### Criterion 3 ranking: cost-to-derive-inline vs cost-to-call-helper

This is the criterion that actually predicts whether the substrate will manifest a measurable advantage, because it captures *why* agents would bother to use the substrate at all.

**FinChain** has the lowest cost-to-derive-inline among the three. The reasoning patterns are *symbolic financial formulas* (compound interest, discounted cash flow, ratio analysis). A frontier model can re-derive these from first principles in tokens, and almost certainly will, especially on the easier 2-step templates. The substrate's advantage on FinChain therefore depends entirely on capturing the *3-step and 4-step* templates where re-derivation becomes expensive (more chain steps, more places to make an arithmetic slip). The paper documents that frontier models *do* break on long-horizon symbolic chains, which means the advantage is real but narrowly located in the hard tier. As a *control arm* this is exactly right: if the substrate can't improve FinChain hard tier, the crystallisation policy is broken.

**FinReflectKG-MultiHop** has medium-to-high cost-to-derive-inline. A frontier model cannot re-derive a 3-hop KG traversal over 17.5M triplets *inline*; it must actually query something. The substrate's value is that it can crystallise *which* query to issue for a given intent family, rather than letting the agent rediscover the entity types and relationship patterns each time. This is the most genuinely amortisable structure in the candidate set: if the cold-path agent discovers that "supply chain vulnerability assessment" = `(ORG)-[:Depends_On]->(RAW_MATERIAL)<-[:Causes_Shortage_Of]-(EVENT)`, the warm-path sibling for a different ticker can reuse this traversal with just a parameter swap, and the agent *cannot easily rederive the traversal pattern inline*. **This is the most powerful single argument for the original recommendation, and it survives the smaller-than-advertised dataset.** The problem is purely sample size and baseline absence, not the underlying logic.

**FinAgentBench** has medium cost-to-derive-inline. The two-stage doc-type-then-chunk pipeline is a recurring decision pattern but the decisions are localised per-company (which 10-K section contains the answer for AAPL → which chunk in that section). A substrate could crystallise a "find_risk_factor_chunks(ticker)" helper, but the helper would need to know each company's filing layout, which varies. The advantage is real but the family structure is weaker than FinReflectKG-MultiHop's pattern repetition.

### Criterion 1 ranking: sibling density per family

This is the criterion where the original recommendation's pick *underperforms its own claims*.

**FinChain**: ∞ siblings per family. Templates are parameterised, so a single template can generate as many sibling queries as desired by varying inputs. This is unique to FinChain among the three. You can design the round structure (cold/warm/hard) by *varying parameters within a template* for the warm tier and *increasing the chain length* for the hard tier.

**FinReflectKG-MultiHop**: 555 total questions, ~50% in each of 2-hop and 3-hop categories. The paper does not publish a per-pattern count. Cross-company queries are 9.7% (~54). If those 54 are distributed across, say, 10 cross-company patterns, that's 5-6 per pattern, which is exactly at the floor the requirements specify. The intra-company patterns will be denser but those are the easier ones where the substrate advantage is smallest. **The dataset publicly released is one-third the size you'd want for the cell structure `kb/docs/benchmarking.md` describes.**

**FinAgentBench**: query density depends on the number of categories × companies. The paper organises queries into 10 categories (Analyst Q&A, Guidance, Risks, etc.); if there are ~10 companies per category that's 100 questions per category, but they're not natively grouped into sibling families. You'd have to synthesise the family structure post-hoc, which is doable but adds engineering surface.

### Criterion 2 ranking: evidence label quality

All three pass. FinReflectKG-MultiHop is the strongest (KG path + chunk ID + page + triplet ID per answer). FinChain has executable Python traces that *are* the evidence (every intermediate value is verifiable). FinAgentBench has graded chunk relevance (0/1/2 per TREC Eval). The substrate's evidence-quality dimension is testable on all three, though "did the agent cite the right rows/spans" is most natural on FinReflectKG-MultiHop and FinAgentBench, while "did the agent reproduce the right intermediate computation" is most natural on FinChain.

### The hidden cost: dataset accessibility and baseline absence

The original recommendation is silent on whether the QA dataset is actually downloadable in a usable form, and whether published baselines exist for frontier models. Verification surfaces sharp differences here.

**FinReflectKG-MultiHop**: QA dataset is at `https://anonymous.4open.science/r/finreflectkg-multihopqa-BD45/` (anonymous version) and `github.com/finreflectkg/finreflectkg-multihopqa` (public, 2 stars, 5.11 MB JSON, 555 questions, no eval scripts). The paper evaluated on a "representative subset of 150 QA pairs". Gemini 2.5 Pro was used as an *LLM judge*, not as the QA system. **No Claude, no GPT-5, no published baseline numbers exist for the answering models you would benchmark against.** The KG itself is CC-BY-NC-4.0 (non-commercial); the QA repo does not state a license explicitly. Engineering cost to bring this online: medium-to-large (build eval harness, run baselines from scratch, establish the cold/warm cell structure inside a 555-question budget).

**FinAgentBench**: Paper specifies the baselines (LLaMA-4-Maverick best on chunk ranking). Dataset details and accessibility from the search results are less explicit, but a HuggingFace paper page exists. Engineering cost: medium (need to construct family structure post-hoc).

**FinChain**: Public GitHub repo (`mbzuai-nlp/finchain`), templates and ChainEval metric included, frontier model results published (GPT-5, Claude 4.5, Gemini 2.5 Pro, Grok 4 Heavy). Engineering cost: small-to-medium (can re-use repo's eval harness directly).

**SkillsBench**: Public dataset and harness at `skillsbench.ai`, headline result published (+16.2pp curated, ~0pp self-generated), 86 tasks × deterministic verifiers, 7,308 published trajectories to compare against. Engineering cost: small (cleanest off-the-shelf harness in the candidate set).

**Spider 2.0**: Public dataset, established leaderboard, frontier baselines published (~17-24% pass rate). Engineering cost: medium (executable but heavyweight, BigQuery/Snowflake credentials needed for full reproduction).

Engineering cost is explicitly the *least important* tie-break in the requirements, but it becomes relevant when the gap is large enough to change the calendar. FinReflectKG-MultiHop with no published baselines means you'd be establishing the substrate-OFF baseline yourself before you can measure the substrate-ON delta, which doubles the eval cost and introduces the well-known "compare against yourself" weakness that reviewers will rightly flag.

### What the four candidates actually measure

| Candidate | What it primarily tests | What datafetch wants tested |
|---|---|---|
| FinReflectKG-MultiHop | Can KG-guided retrieval beat text retrieval? (Answer: yes, +24% correctness, -84.5% tokens, per the paper) | Can a substrate that crystallises KG traversal patterns reproduce that gap? |
| FinAgentBench | Can agentic two-stage retrieval beat one-stage retrieval? (Answer: chunk ranking still weak at 0.42 nDCG@5) | Can a substrate that crystallises the doc→chunk pipeline reproduce two-stage advantage with one cached call? |
| FinChain | Can frontier models do long-horizon compositional reasoning? (Answer: partial; 4-step templates expose weaknesses) | Can a substrate that crystallises symbolic templates close the long-horizon gap with predictable reuse? |
| SkillsBench | Do curated Skills help LLM agents? (Answer: yes, +16.2pp on average; self-generated Skills don't) | Does our specific Skill format (committed visible TS lib functions) improve on the curated-Skills average? |
| Spider 2.0 | Can LLMs handle real enterprise text-to-SQL workflows? (Answer: no, 17% pass rate) | Can a substrate that learns dataset-specific SQL idioms close the gap? |
| FRAMES | Can LLMs reason over 2-15 documents with frontier retrieval? (Answer: 40% without retrieval, much better with) | Same question as FinReflectKG-MultiHop but with Wikipedia instead of SEC filings |

The third column reveals the asymmetry: each benchmark *as published* answers a slightly different question than the one datafetch wants answered. The benchmark's published question is the headline result; datafetch's question is "given a substrate that crystallises [the benchmark's headline-result structure], do we reproduce the headline-result gap with amortised cost?". The best candidate for datafetch is therefore the one whose headline result aligns most directly with what crystallisation would capture *and* has the family structure to test amortisation.

By that filter, **FinChain is most directly aligned** (templates *are* the crystallisable structure), **FinReflectKG-MultiHop is most prestigious and document-grounded** (KG traversal patterns *are* the crystallisable structure, and the 24% gap from KG-guided retrieval is already on record), and **SkillsBench is the most direct test of the broader thesis** but at the wrong scope (agent skills generally, not dataset interfaces specifically).

## Strengths

### What the original recommendation gets right

The original analysis correctly identifies that the next benchmark must:

- Have intent families repeated over a shared corpus (not independent one-shot questions).
- Have public correctness AND evidence labels (provenance must be auditable separately from outcome).
- Resist saturation by frontier models (correctness headroom must be visible on Claude 4.x / GPT-5).
- Reward amortised reasoning rather than one-shot competence.

It correctly identifies FinReflectKG-MultiHop's structural fit on schema (24 entity types × 29 relationship types = 696 possible relationship patterns, of which the benchmark uses the 2-3 hop subset). It correctly identifies that FinChain's symbolic verifiability is the *control arm* that should sanity-check the crystallisation policy. It correctly identifies that FinAgentBench's two-stage structure is a recurring decision pipeline worth crystallising.

### What FinReflectKG-MultiHop legitimately wins on

- **Document-grounded provenance**: the paper ships KG path + chunk ID + page + triplet ID per answer. This is the strongest evidence-label format in the candidate set and gives the cleanest "did the substrate cite the right span" measurement.
- **Genuinely hard-to-rediscover structure**: 3-hop cross-company queries on 17.5M triplets cannot be solved by a single retrieval call no matter how good the embedding is. The agent *must* traverse, and the traversal pattern *is* the crystallisable structure.
- **Realistic product surface**: S&P 500 10-K filings are exactly the corpus datafetch's elevator pitch targets ("range of chemicals revenue between 2014 and 2016"). This is the strongest product-narrative match.
- **The paper's own 24% gap**: the FinReflectKG paper has already demonstrated, in print, that KG-guided retrieval beats text-only retrieval by 24% correctness and 84.5% token reduction. That is the gap the substrate should close. Designing a benchmark protocol around closing a paper-documented gap is a much sharper story than "we made things faster".

### What FinChain legitimately wins on

- **Templates as native intent families**: 290 templates (58 topics × 5 templates: 2 basic / 2 intermediate / 1 advanced) generating 2,900 instances (× 10 seeds), each template a Python function returning `(question, solution)`. Direct probe of `mbzuai-nlp/finchain/data/templates/` (2026-05-18) confirms: 12 domain directories, 59 topic files, multiple template functions per file using `random` for parameter variation (e.g., `investment_analysis/ci.py` has `template_ci_simple_calculation`, `template_ci_quarterly_compounding`, `template_ci_rate_and_total_known`, `template_ci_half_yearly_variable_rate`, ...). Cold-warm-hard tiers can be designed by parameter variation within a template (warm) and template-difficulty progression (hard). This is uniquely well-suited to the cell structure `kb/docs/benchmarking.md` specifies.
- **Intermediate-step scoring (ChainEval)**: this is the only candidate with a published metric that scores *intermediate* reasoning, which maps directly to datafetch's "derivation visibility" metric. On FinReflectKG-MultiHop you can score evidence quality (did the cited spans exist) but not derivation quality (did the intermediate computations match). FinChain scores both.
- **Published frontier baselines**: GPT-5, Claude 4.5, Gemini 2.5 Pro, Grok 4 Heavy results are in the paper. You can run substrate-OFF and compare against the paper's numbers rather than re-establishing baselines.
- **Public, working repo**: `github.com/mbzuai-nlp/finchain` has the templates, the ChainEval implementation, and presumably the eval harness. This is the lowest-friction starting point.

### What SkillsBench legitimately wins on, and why this matters

- **Headline result already replicates the user's secondary finding**: "Curated Skills raise pass rate by +16.2pp; one-shot self-generated Skills provide no benefit on average." This is a near-verbatim restatement of what the user found on jsonplaceholder: hand-authored helpers get reused, auto-crystallised helpers get bypassed. SkillsBench is essentially measuring the same phenomenon at scale.
- **86 tasks × deterministic verifiers**: this is the largest published task set in the candidate space with verifiers and the cleanest "switch substrate on/off" measurement.
- **External validity**: if datafetch's substrate-ON arm beats SkillsBench's "curated Skills" baseline of +16.2pp on the *same task suite*, that is a strong external claim. If it merely matches the +16.2pp, the claim becomes "we automate what was previously hand-curated", which is also defensible.

The reason to *not* make SkillsBench the primary is scope: datafetch is about *dataset interfaces* (df.db.*, df.lib.*, df.answer); SkillsBench tests *general agent skills* (office docs, git, data processing, healthcare protocols). Running on SkillsBench would require either narrowing to the SkillsBench tasks that look like dataset queries (small subset) or running on the whole thing and claiming a general result (broader than the product currently supports).

## Limitations & Risks

### Risks with the original recommendation as stated

**FinReflectKG-MultiHop's total sample is small (555 questions) but the per-pattern sibling density is high enough to host the round structure.** Direct probe of `github.com/finreflectkg/finreflectkg-multihopqa/final_master_dataset.json` (2026-05-18) confirms: 19 unique patterns total, with the top pattern having 68 siblings and the median pattern having ~30. The 3-hop slice has 9 patterns over 265 questions. The 3-hop *cross-company* cell — the highest-value cell per the cost-to-derive-inline criterion — contains 7 unique patterns over 50 questions, with the top three patterns carrying 13, 12, and 11 siblings each (well above the ≥3 floor). This is a correction to the first draft of this document: I had assumed cross-company patterns would be too sparse, but the probe shows the dataset is *highly concentrated* in a small set of patterns rather than spread thinly. The patterns are also interesting in their own right and map cleanly to crystallisable interfaces: `PERSON → Subject_To → ORG_REG → Regulates → ORG → Discloses → FIN_METRIC` (regulatory-exposure pattern, 13 cross-company siblings) would crystallise as `df.lib.resolveRegulatoryExposure(person)`. The actual constraint is not sibling count, it is total question count (555 caps the number of cells you can populate across families × rounds × arms) and the absence of published baselines. The KG itself (17.5M triplets, 1.67 GB, CC-BY-NC-4.0) is a separate artefact from the QA benchmark (555 questions, 5.11 MB, no eval scripts); the original analysis conflates them.

**No published Claude or GPT-5 baselines on FinReflectKG-MultiHop.** Gemini 2.5 Pro is used as a *judge*, not as the *answerer*. The original recommendation cites "Claude Sonnet 4 gets only 0.419 nDCG@5 on chunk-level retrieval in the related FinAgentBench" as evidence that frontier models leave headroom; that number is from FinAgentBench, not from FinReflectKG-MultiHop. The actual FinReflectKG-MultiHop headroom on Claude Sonnet 4.6 / Opus 4.7 is unknown until you run it. This means the substrate-OFF baseline is a *prerequisite eval*, not a sanity check.

**CC-BY-NC-4.0 on the underlying KG.** Acceptable for academic research, problematic for a product narrative. The QA repo doesn't state its license explicitly; need to clarify before building a public demo.

**No evaluation harness.** The QA repo ships JSON + README; no eval scripts, no baselines, no scoring code. You'd build the harness yourself, which is fine but adds 1-2 weeks of engineering before the first comparable number.

### Risks with FinChain as primary

**Symbolic templates are exactly the structure frontier models can re-derive inline.** This is the same failure mode that produced SkillCraft's neutral correctness result. On FinChain 2-step templates, a frontier model will almost certainly inline the formula and the substrate will provide no advantage. The signal will be concentrated in the 4-step templates, where the substrate's correctness advantage should emerge. This is fine if the experiment design weights the hard tier appropriately, but it means the FinChain "easy tier" cells will likely be neutral, which the reader has to be primed for.

**Product narrative is weaker than FinReflectKG-MultiHop.** FinChain is a *reasoning* benchmark; the question "what is the value of an investment compounding at 5% for 10 years" doesn't map naturally to the "mount a dataset as workspace" story the elevator pitch tells. The substrate advantage here is "the lib function encodes the formula", which is a step further from the product than "the lib function encodes a KG traversal over real filings".

**ChainEval is good but new.** Few replications outside the paper. Trusting the metric requires more validation than trusting accuracy on FinReflectKG-MultiHop.

### Risks shared across all candidates

**Frontier-model saturation is moving fast.** Claude Opus 4.7 already scores 79.3% on BrowseComp (down from 4.6's 84% — a regression that itself is interesting context for how fast the landscape moves). On structured QA, the easier tiers of all three candidates are likely already at or near ceiling. The hard tiers are where the substrate must be evaluated, which means the protocol must explicitly upweight hard cells, not average across tiers.

**The "agent bypasses crystallised helpers" finding generalises.** It applies to *any* benchmark where the agent can rederive the answer cheaper than calling the helper. This is structural, not benchmark-specific. The mitigation is to design the substrate such that the helper *encodes more than the agent can derive in tokens* — typically by precomputing schema knowledge, indexing structure, or validated query patterns. The benchmark choice influences whether this is exhibited but doesn't cause it.

**No benchmark in the candidate set was designed for substrate evaluation.** All were designed for static-model evaluation. The eval protocol has to be built on top, which is true regardless of pick. The candidate set is not "the right benchmark for substrate evaluation"; it's "the candidate benchmark whose underlying structure most closely matches what substrate evaluation needs".

### The most accurate single pick, restated with caveats

If the question is "which single existing public benchmark, if datafetch shows a strong cold/warm/hard separation on it, would constitute the most defensible proof of the substrate premise", the answer is **a hybrid centred on FinChain hard tier + FinReflectKG-MultiHop cross-company 3-hop subset**, with FinChain doing the heavy lifting on family structure and statistical power and FinReflectKG-MultiHop doing the heavy lifting on document-grounded realism and the paper-documented 24% gap.

If the question is "which single existing public benchmark from the original recommendation's list is most accurate for the premise", and a hybrid is not allowed, the answer changes from FinReflectKG-MultiHop to **FinChain** for these forcing reasons:

1. FinChain natively has the cell structure; FinReflectKG-MultiHop does not.
2. FinChain has published frontier baselines; FinReflectKG-MultiHop does not.
3. FinChain has a working eval harness; FinReflectKG-MultiHop does not.
4. FinChain's ChainEval metric measures intermediate steps; FinReflectKG-MultiHop's metric measures final answer + evidence span only.
5. FinChain's NC/license/engineering surface is smaller.

The single fact that pushes hardest in the *other* direction (toward FinReflectKG-MultiHop) is that the paper has already published a 24% correctness gap that the substrate could close. That is a uniquely valuable framing for the narrative — "the paper documented a gap; we filled it with a substrate" — and it is the strongest argument for keeping FinReflectKG-MultiHop in the primary slot if the experiment design can absorb the smaller sample size and the missing baselines. In the hybrid recommendation it occupies the realism-cap slot specifically to preserve this framing without being load-bearing for statistical power.

## Integration Analysis

### What to extract

From **FinChain**: the entire template + executable Python trace + ChainEval pipeline. The templates become candidate intent families. The Python traces become the gold-standard evidence labels. ChainEval becomes the derivation-visibility metric. This is approximately 80% of the eval-harness work done already by the repo.

From **FinReflectKG-MultiHop**: the cross-company 3-hop subset (~54 questions) as the realism-cap cells. The KG itself as the persistent dataset that the workspace mounts (which maps cleanly to the `df.db.kg` and `df.db.chunks` extension the original analysis already proposed). The KG path + chunk ID + page + triplet ID schema as the evidence label format for `result/answer.json`.

From **SkillsBench**: the three-condition experimental design (no-substrate / curated-substrate / auto-substrate), which is exactly the cold/warm/hard structure adapted for the substrate-presence question. Their 16.2pp curated-vs-none gap and their ~0pp self-generated-vs-none gap give us *external reference numbers* to position datafetch's result against.

From the existing **kb/br/06 BIRD+FinQA hybrid corpus** decision: keep the supply-chain micro-set as the demo spine; keep BIRD-SQL as the cross-collection polymorphism arm; keep FinQA as the within-document polymorphism arm. The new external benchmark slots in *alongside* this hybrid, not as a replacement.

### Bootstrap path

The minimal credible eval is:

```
Round 1 (cold):
  FinChain 3-step template family A, query 1  (substrate must crystallise)
  FinChain 3-step template family B, query 1
  FinChain 4-step template family C, query 1
  FinReflectKG cross-company family D, query 1 (3-hop, ORG→risk→event traversal)

Round 2 (warm sibling):
  Same families, sibling parameters (FinChain) or sibling tickers (FinReflectKG)
  → expect: warm-path agent finds the crystallised lib function and calls it

Round 3 (hard generalisation):
  FinChain: bump chain length 3→4
  FinReflectKG: bump from intra-sector to cross-sector
  → expect: crystallised lib function either generalises (tier 2 reuse) or
    over-specialises (tier 4 fallback, with new lib function crystallised
    for the harder family)
```

Run three arms per cell:
- **Substrate-OFF baseline**: `DATAFETCH_DISABLE_LEARNING=1`, same prompt skeleton (identical to P1 SkillCraft Arm B).
- **Substrate-ON cold**: clean tenant, no prior `lib/`.
- **Substrate-ON warm**: tenant with Round 1 cells already committed and `lib/` populated.

Use the existing `eval/skillcraft/` harness as the runner skeleton; swap the task scorer for ChainEval (FinChain) and KG-path evidence checker (FinReflectKG). Telemetry is already wired (`DATAFETCH_TELEMETRY=1`, `DATAFETCH_TELEMETRY_LABEL=<benchmark-id>`).

Score on the four datafetch verdict vector dimensions (correctness, effective tokens, wall-clock, σ-tokens) plus the two new dimensions the benchmarking doc lists that SkillCraft didn't surface (reuse rate, derivation visibility).

### Effort estimate

**Medium**, approximately matching the SkillCraft eval harness effort:

- FinChain integration: ~2-3 days (clone repo, write adapter for `df.tool` invocation, wire ChainEval into the task scorer, generate Round 1/2/3 cells from templates).
- FinReflectKG-MultiHop integration: ~3-5 days (mount KG as `df.db.kg`, mount chunks as `df.db.chunks`, write evidence-checker that compares cited triplet IDs against gold KG path, select the cross-company 3-hop subset, run substrate-OFF baseline from scratch since none is published).
- SkillsBench as external generalisation arm: ~1-2 days (clone harness, run substrate-ON on a curated subset of dataset-like tasks, compare to their published 16.2pp curated number).

Total: ~6-10 days for the full hybrid bootstrap. Compare to ~20+ days if FinReflectKG-MultiHop were the sole primary and you had to build the eval harness from scratch.

## Key Takeaways

1. **The original recommendation's pick of FinReflectKG-MultiHop as primary is structurally correct but practically underspecified.** The QA dataset publicly released is 555 questions, not "thousands"; cross-company queries are 9.7%; no Claude or GPT-5 baselines exist; the KG is CC-BY-NC-4.0; the QA repo has no evaluation harness. These are all manageable but they convert the pick from "off-the-shelf benchmark" to "build the eval, run baselines, then measure substrate delta", which doubles the calendar.

2. **For proving the premise as the elevator pitch states it, swap FinChain into the primary slot and demote FinReflectKG-MultiHop to "realism cap with cross-company 3-hop subset".** FinChain has the family structure natively (290 parameterised templates), published frontier baselines (GPT-5/Claude 4.5/Gemini 2.5 Pro), a working public repo with ChainEval, and the only intermediate-reasoning metric in the candidate set. The trade-off is weaker product narrative; mitigate by keeping FinReflectKG-MultiHop in the hybrid for the document-grounded story.

3. **SkillsBench (arXiv 2602.12670) is the closest existing benchmark to the datafetch premise and was missing from the original analysis.** Its headline result (curated Skills +16.2pp; self-generated Skills ~0pp) is the user's own jsonplaceholder finding restated at scale on 86 tasks × 7,308 trajectories. Use it as the external generalisation arm with a published reference number to position against; don't use it as primary because its task scope (general agent skills) is broader than datafetch's product scope (dataset interfaces).

4. **The third criterion the original analysis underspecifies is the load-bearing one: cost-to-derive-inline must exceed cost-to-call-helper, or the agent will bypass the substrate (as SkillCraft already demonstrated).** This filter ranks FinReflectKG-MultiHop's 3-hop cross-company queries as the highest-value cells (genuinely hard to inline a KG traversal), FinChain's 4-step templates as the medium-value cells (long-horizon symbolic reasoning where frontier models break), and FinChain's 2-step templates and FinAgentBench's doc-rank stage as the lowest-value cells (frontier models can solve these inline at low token cost). The eval protocol should explicitly upweight the high-value cells.

## Sources

- [arxiv.org/abs/2510.02906](https://arxiv.org/abs/2510.02906) — FinReflectKG – MultiHop: Financial QA Benchmark for Reasoning with Knowledge Graph Evidence (Arun, Harsh, Sarmah, Pasquali, Oct 2025).
- [arxiv.org/html/2510.02906](https://arxiv.org/html/2510.02906) — full HTML, used to verify QA sample sizes and cross-company percentage.
- [huggingface.co/datasets/domyn/FinReflectKG](https://huggingface.co/datasets/domyn/FinReflectKG) — underlying KG (17.5M triplets, 1.67 GB, CC-BY-NC-4.0), 16 likes, 621 downloads/month.
- [github.com/finreflectkg/finreflectkg-multihopqa](https://github.com/finreflectkg/finreflectkg-multihopqa) — QA repo (555 questions, 5.11 MB JSON, no eval scripts).
- [arxiv.org/abs/2508.14052](https://arxiv.org/abs/2508.14052) — FinAgentBench: A Benchmark Dataset for Agentic Retrieval in Financial Question Answering (Choi, Kwon, Lopez-Lira et al, ICAIF 2025).
- [huggingface.co/papers/2508.14052](https://huggingface.co/papers/2508.14052) — paper page with HF discussion.
- [arxiv.org/abs/2506.02515](https://arxiv.org/abs/2506.02515) — FinChain: A Symbolic Benchmark for Verifiable Chain-of-Thought Financial Reasoning (Xie, Sahnan, Banerjee et al, MBZUAI).
- [github.com/mbzuai-nlp/finchain](https://github.com/mbzuai-nlp/finchain) — public repo with templates, executable traces, ChainEval metric.
- [arxiv.org/abs/2602.12670](https://arxiv.org/abs/2602.12670) — SkillsBench: Benchmarking How Well Agent Skills Work Across Diverse Tasks (86 tasks, 11 domains, 7,308 trajectories, +16.2pp curated / ~0pp self-generated headline).
- [skillsbench.ai](https://skillsbench.ai) — published dataset and harness.
- [arxiv.org/abs/2604.20087](https://arxiv.org/html/2604.20087v1) — SkillLearnBench (continual learning for agent skill generation).
- [arxiv.org/abs/2604.17308](https://arxiv.org/html/2604.17308v1) — SkillFlow (166 tasks × 20 families, lifelong skill discovery; built on GDPval + SkillsBench).
- [arxiv.org/abs/2401.15391](https://arxiv.org/abs/2401.15391) — MultiHop-RAG (knowledge base + multi-hop queries + ground-truth evidence + null queries).
- [arxiv.org/abs/2406.04744](https://arxiv.org/pdf/2406.04744) — CRAG: Meta Comprehensive RAG Benchmark, KDD 2024 (4,409 QA pairs, 8 question types including multi-hop/set/aggregation).
- [github.com/facebookresearch/CRAG](https://github.com/facebookresearch/CRAG) — CRAG benchmark code.
- [arxiv.org/abs/2409.12941](https://arxiv.org/abs/2409.12941) — FRAMES: Fact, Fetch, and Reason (Google × Harvard, 824 multi-hop questions over 2-15 documents, 0.40 baseline without retrieval).
- [huggingface.co/datasets/google/frames-benchmark](https://huggingface.co/datasets/google/frames-benchmark) — FRAMES dataset on HF.
- [arxiv.org/abs/2411.07763](https://arxiv.org/abs/2411.07763) — Spider 2.0: Real-World Enterprise Text-to-SQL Workflows (632 problems, ~812 columns/db average, ~17% peak pass rate).
- [spider2-sql.github.io](https://spider2-sql.github.io/) — Spider 2.0 leaderboard.
- [arxiv.org/abs/2506.02404](https://arxiv.org/abs/2506.02404) — GraphRAG-Bench: Challenging Domain-Specific Reasoning for Evaluating Graph RAG (June 2025).
- [github.com/GraphRAG-Bench/GraphRAG-Benchmark](https://github.com/GraphRAG-Bench/GraphRAG-Benchmark) — GraphRAG-Bench repo (ICLR'26).
- [cdn.openai.com/pdf/.../browsecomp.pdf](https://cdn.openai.com/pdf/5e10f4ab-d6f7-442e-9508-59515c65e35d/browsecomp.pdf) — BrowseComp paper (1,266 problems, Claude Sonnet 4.5: 43.9%, Opus 4.7 regression from 4.6's 84% to 79.3%).
- Internal: [kb/docs/benchmarking.md](../docs/benchmarking.md) — datafetch benchmark requirements doc.
- Internal: [kb/elevator.md](../elevator.md) — substrate premise (cold/warm/hard interface flip).
- Internal: [kb/br/06-bird-finqa-corpus.md](./06-bird-finqa-corpus.md) — prior corpus decision (BIRD + FinQA + supply-chain spine).
- Internal: [experiments/STATUS.md](../../experiments/STATUS.md) — SkillCraft P1 result `{NEUTRAL, PASS, PASS, NEUTRAL}` and post-P1 fix history.
