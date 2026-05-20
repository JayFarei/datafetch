---
title: "Post-SkillCraft Benchmark Scouting: Where Substrate Value Becomes Visible Again"
date: 2026-05-18
mode: ultradeep
sources: 42
status: complete
---

# Post-SkillCraft Benchmark Scouting: Where Substrate Value Becomes Visible Again

## Executive Summary

The next datafetch substrate eval should run on **CRAG (Comprehensive RAG Benchmark, Meta KDD Cup 2024) as the primary surface**, with **τ³-bench (Sierra, 2025, the airline + retail + telecom + banking domains) as a paired multi-turn companion**. CRAG gives 4,409 questions across five real product domains (finance, sports, music, movie, open), built from **600+ question templates** that systematically produce sibling queries over a shared 2.6M-entity mock KG and mock-web corpus. Frontier-agent headroom is wide and durable: GPT-4-class systems clear ~34% LLM-only and ~44% with naive RAG; the 2024 winning team reached only **47.8%** on the hardest task. The bench exposes the four axes SkillCraft no longer can: correctness under noise (false-premise, low-popularity entities, dynamic facts), evidence grounding (mock-API provenance per answer), compositional reasoning (multi-hop, set, aggregation, post-processing), and durable reuse (templates that fire across the dataset). τ³-bench supplies the operational-narrative half (a customer-service agent acting against real policy docs and a transactional DB) where state-based eval and the pass^k reliability metric let substrate show calibration, not just accuracy.

The reframing answers the standing concern that SkillCraft (92.9% vs 95.2% pass on Sonnet 4.6, p=0.25; -41% tokens; cross-eval on jsonplaceholder revealed crystallised-helper thinness) is now near-saturated on frontier agents — correctness headroom collapsed because most tasks resolve in one competent episode, and the substrate's measurable advantage shrank to orchestration efficiency. CRAG and τ³-bench restore headroom on different axes: CRAG via dataset-grounded multi-hop and noisy retrieval; τ³ via multi-turn policy compliance and database-state evaluation. Crucially, both have **real product surfaces** (CRAG is structured like a product-analytics dashboard; τ³ is a literal customer-service desk). Both have **machine-checkable correctness** with native evidence trails. Both naturally produce **sibling queries over a shared corpus** — the SkillFlow paper's "Domain-Agnostic Execution Flow" abstraction is implicit in CRAG's question-template families and in τ³'s policy-bound task instances. Both have at least one independent scaling axis (CRAG: entity popularity head/torso/tail × temporal dynamism years-to-seconds; τ³: pass^k k value × user-simulator stochasticity × domain count).

The "obvious but wrong" candidates are rejected with explanation. **MuSiQue, FRAMES, FanOutQA, BrowseComp, HLE** have superb evidence labels but no family/reuse structure (each question is an independent puzzle, so a substrate that crystallises composition has nothing to amortise over). **GAIA original** is approaching saturation (h2oGPTe with Claude-3.7-Sonnet now scores ~74%, vs the ~92% human baseline). **HotpotQA / 2WikiMultihopQA / TriviaQA / NaturalQuestions** are explicitly rejected by the requirements (single-retrieval-hit). **SWE-bench / Spider 1.0 / BIRD-SQL** are saturated on the primary split (Agentar-Scale-SQL reaches 81.67% on BIRD test). **Spider 2.0 and BIRD-Critic** retain headroom (17–39%) but a 2026 VLDB paper benchmarked annotation error rates at **52.8% on BIRD Mini-Dev and 62.8% on Spider 2.0-Snow**, with rank-position changes ±9, which would mask a substrate-driven correctness delta. **SkillCraft itself** has served its purpose. **SkillFlow (arXiv:2604.17308)** is the closest peer to what we want — 20 families × 8–9 tasks, executable Docker verifiers, explicit lifelong-skill protocol — but its own paper reports a strict-NEUTRAL on Sonnet 4.6 (56.63% vanilla → 56.63% with skills, Δ=0), which means we would inherit the SkillCraft-Sonnet-saturation problem one ring out from the campfire. **SkillsBench (84 tasks × 11 domains, Feb 2026)** is the cleanest "did skills help?" eval, with Claude Code Opus 4.5 showing +23.3pp, but it tests *provided* skills against curated alternatives, not substrate-discovered ones, and the per-domain n is small (~7 tasks per domain, just at the requirements floor). **AppWorld (Princeton, 750 tasks, 9 apps, state-based unit tests)** and **WebArena (812 templated tasks, 4 self-hosted sites)** are the strongest fallbacks if CRAG fails the no-public-leaderboard sanity check; both have task variations built in, both have execution-based eval, and WebArena has documented substrate-style wins from Agent Workflow Memory (+51% relative) and SkillWeaver (+31.8% relative) that the datafetch eval could reproduce.

## Overview

This brief scouts candidate benchmarks for the next substrate evaluation phase. It is the response to the post-iter164/post-P2 strategic question: *where do we measure next*, now that SkillCraft has been ridden out and the matched-arm P1 paired comparison closed with `{NEUTRAL, PASS, PASS, NEUTRAL}` on Claude sonnet-4-6 (substrate-ON pass 92.9% vs OFF 95.2%, McNemar p=0.25; effective tokens -41%; wall-clock -17%; token σ -20%).

Three forces converge to make a benchmark switch necessary. First, **SkillCraft is close to ceiling on frontier agents** — Claude 4.5-Sonnet hits 96% with Skill Mode in the original paper (Chen et al., arXiv:2603.00718, Table 2), and on iter164 we measured 92.9% pass with substrate-ON over the same 126 tasks. Pass-rate headroom on a strong agent backend is too narrow for the substrate to express correctness gains; the remaining advantage is the cost/wall-clock half, which becomes a "useful but not the story" claim if pushed alone. Second, the **cross-evaluation on jsonplaceholder.typicode.com** (closed 2026-05-17, revised 2026-05-18) found that auto-crystallised helpers like `toolFanout` were thinner than the agent's inline 5-line `Promise.all` rewrite, so the substrate's *crystallisation policy* — not just the measurement surface — needs a benchmark that rewards durable, rich, composable structure. Third, the academic landscape has produced **2025–2026 benchmarks explicitly built around reusable skill libraries** (SkillFlow, SkillsBench, SkillRet, SkillRouter, the Tool Decathlon, the SkillClaw / SkillFoundry / Graph-of-Skills cluster), giving us peer constructs to align against.

The brief enumerates and scores candidates against the seven hard requirements specified in the scouting question:

1. **Repeated intent families over a shared corpus** (≥3 families × ≥3 sibling queries each), supporting cold-creation, warm-reuse, and hard-generalization regimes.
2. **Public correctness labels AND public evidence labels** — machine-checkable answers plus row/document/span/trace provenance.
3. **High compositional complexity** — first retrieval should rarely contain the final answer; joins, aggregation, iterative search, refinement, evidence synthesis, cross-document reasoning.
4. **Noise, ambiguity, and missing evidence** — incomplete, conflicting, noisy, partial-answer scenarios, so safe abstention and calibration can be measured.
5. **Reusable structural patterns** — recurring joins, aggregations, trace traversals, schema navigation, evidence patterns that the substrate could realistically crystallise.
6. **Real product surface area** — analytics, enterprise logs, support tickets, traces, finance tables, observability, infrastructure telemetry, operational dashboards.
7. **Independent scaling axis** — at least one controllable dimension besides task count (model strength, corpus size, retrieval noise, schema growth, context-window pressure, evidence sparsity) so the same harness extends to a follow-up paper without complete reinstrumentation.

The brief reasons about candidates in two tiers (primary / tier-2) and then enumerates the "obvious but wrong" rejections explicitly, which the meta-expectation asked for. The final Integration Analysis answers three project-specific questions: what to extract from the candidate, bootstrap path, and effort estimate.

The recommendation is two-corpus: **CRAG (primary)** + **τ³-bench (companion)**. The combination is motivated by complementarity. CRAG carries the structured-data composition story (mock APIs over a 2.6M-entity KG); τ³-bench carries the conversational product-flow story (real airline / retail / telecom / banking policy docs over a transactional database). Together they cover both halves of the datafetch positioning brief — "virtualizes the dataset interface" (CRAG-shaped) and "improves that interface from accepted, evidence-backed work" (τ³-shaped). Neither alone is sufficient; the SkillCraft single-corpus design is part of why that bench saturated on Sonnet 4.6.

## How It Works

### The comparison framework

This section walks the seven hard requirements across the candidate pool. The table below scores each candidate on each dimension (✓✓✓ strong, ✓✓ good, ✓ adequate, △ partial, ✗ fails). The two right-most columns are tie-break dimensions: visible correctness headroom on Sonnet 4.6 / GPT-5.2 / Gemini-3-Pro tier (where measured), and engineering integration cost into the existing datafetch harness (Q = quick < 1h, S = short < 4h, M = medium < 1d, L = large > 1d). Engineering cost is the *least* important tie-break per the scouting spec.

| Candidate | Intent families | Public correctness | Evidence labels | Compositional | Noise / ambiguity | Reusable patterns | Real product surface | Scaling axis | Frontier headroom | Eng cost |
|---|---|---|---|---|---|---|---|---|---|---|
| **CRAG** | ✓✓✓ 5 dom × 8 types × 600+ templates | ✓✓ rule + LLM eval (+1/0/-1) | ✓✓ mock API + KG provenance | ✓✓ multi-hop, set, aggregation, post-processing | ✓✓✓ false-premise, popularity tail, dynamic facts | ✓✓✓ templated by construction | ✓✓ finance / sports / music / movie | ✓✓ popularity × dynamism | ✓✓✓ 34-47% SOTA | M |
| **τ³-bench** | ✓✓ 4 domains × 50-114 tasks | ✓✓✓ DB-state diff | ✓✓ DB-state delta | ✓✓ multi-turn API + policy compliance | ✓✓ user-sim stochasticity, ambiguous policy | ✓✓ policy-bound recurring shapes | ✓✓✓ airline / retail / telecom / banking | ✓✓ pass^k × k | ✓✓ ~46-69% Sonnet 3.5 | M |
| **SkillFlow** | ✓✓✓ 20 fams × 8-9 tasks (DAEF) | ✓✓✓ container verifier | △ trajectory + rubric only | ✓✓ workflow flow | △ format + scale + noise axes | ✓✓✓ explicit DAEF | ✓✓ office + data + supply chain | ✓ skill library size | △ 56.63%→56.63% Sonnet 4.6 | L |
| **SkillsBench** | △ 84 tasks × 11 domains (~7-8 per) | ✓✓✓ deterministic verifier | △ trajectory only | ✓ depends on domain | △ | ✓✓ skills are provided artefacts | ✓✓ SE / finance / healthcare / energy | ✓ no-skills / curated / self-gen | ✓✓ +23.3pp Opus 4.5 | M |
| **Toolathlon** | △ 108 tasks across 32 apps | ✓✓ execution scripts | △ trajectory | ✓✓✓ 20-turn average | ✓ MCP failure modes | △ implicit | ✓✓✓ Canvas / Notion / K8s / BigQuery | ✓ task count | ✓✓ 38.6% Sonnet 4.5 | L |
| **Spider 2.0** | ✓ 632 tasks across BigQuery / Snowflake / DBT / Lite | ✓✓ exact match + execution | △ | ✓✓✓ enterprise, 100+ line SQL | ✗ annotation error 62.8% on Snow split | ✓ DBT layered models | ✓✓✓ enterprise analytics | ✓ dialect, scale | ✓✓✓ 17-27% SOTA | M |
| **BIRD-Critic** | ✓ 600 dev + 200 OOD across 4 dialects | ✓ test cases | △ | ✓ debug-style fixes | ✓ real user issues | ✓ recurring SQL bug patterns | ✓✓ DB applications | ✓ dialect | ✓✓ ~39% o3-Mini | M |
| **AppWorld** | ✓✓ 750 tasks + variations | ✓✓✓ state-based unit tests with collateral-damage check | ✓✓ DB-state changes | ✓✓✓ multi-app, 50+ LoC | ✓✓ distractors, hurdles | ✓✓ recurring API patterns | ✓✓✓ Amazon / Gmail / Venmo / Splitwise | ✓✓ normal / challenge | ✓✓ ~49% normal / 30% chall | L |
| **WebArena** | ✓✓ 812 templated tasks × 4 sites | ✓✓ functional correctness | △ DB-state | ✓✓ multi-page, long-horizon | ✓ | ✓✓✓ templated by construction | ✓✓✓ e-commerce / forum / git / CMS | ✓ task count, model | ✓ ~14-50% (AWM +51% rel) | L |
| **ConvFinQA** | ✓✓ 3,892 conversations × 14,115 QAs | ✓✓ exec accuracy | ✓✓ program supervision + gold facts | ✓✓✓ chained reasoning | △ | ✓✓ Type II hybrid = sibling | ✓✓ S&P 500 filings | △ | ✓✓ ~21pt gap to human | Q |
| **MultiHiertt** | ✓ ~10K QAs over hierarchical tables | ✓✓ exec accuracy | ✓✓✓ supporting fact annotations | ✓✓ multi-step | △ | ✓ hierarchical patterns | △ financial reports | △ | ✓ MT2Net far from human | Q |
| **FinReflectKG-MultiHop** | ✓✓ 2-3 hop subgraph patterns × S&P 100 × 3 years | ✓✓ correctness + KG | ✓✓✓ KG-linked evidence | ✓✓ multi-hop, cross-company | ✓ S3 distractor scenario | ✓✓ subgraph patterns | ✓ S&P 100 filings | ✓✓ S1/S2/S3 retrieval regime | ✓ KG +24% / -84.5% tokens | M |
| **FanOutQA** | ✓✓ 1,034 questions × 7,305 decompositions | ✓ string acc + ROUGE + BLEURT | ✓✓ human decomposition | ✓✓ wide reasoning, large context | △ | ✓ entity-aggregation | △ Wikipedia | △ | ✓ <50% GPT-4 | Q |
| **MuSiQue** | △ chain-of-sub-questions | ✓✓ exec match | ✓✓ N-hop chains + intermediates | ✓✓✓ enforced connected reasoning | ✓ | △ | △ Wikipedia | ✓ hop count | ✓ ~32 F1 on Ans split | Q |
| **FRAMES** | △ 824 multi-hop questions | ✓✓ accuracy | ✓✓ 2-15 Wikipedia docs | ✓✓ multi-doc, temporal | ✓ | ✓ multi-doc pattern | △ Wikipedia | ✓ doc count | ✓✓ 40% (no RAG) → 66% (multi-step) | Q |
| **GAIA / GAIA2** | △ 466 / Gaia2 | ✓✓ short answer | △ | ✓✓ multi-step real-world | ✓✓ Gaia2: async, time-sensitive | △ | ✓ general assistant | △ Gaia2: temporal | △ Gaia ~74% h2o / Gaia2 42% GPT-5 | M |
| **CRAG (HotpotQA-class baselines)** | ✗ | ✓ | ✓ | △ | △ | ✗ | △ | △ | ✗ saturated | — |
| **BrowseComp** | △ 1,266 web research Qs | ✓ short answer | ✓ textual evidence required of trainers | ✓✓ persistent navigation | ✓✓ hard-to-find | ✗ one-shot | △ general web | ✓ task count | ✓✓ 51.5% Deep Research / 9.9% o1 | M |
| **HumanityLastExam (HLE)** | ✗ 2,500 expert questions | ✓ MC + short | △ | ✓✓✓ multi-discipline chained | ✓✓ uncalibrated overconfidence | ✗ | ✗ academic | ✓ subject count | ✓✓✓ 41% Gemini 3.1 Pro | Q |

### Tie-break ordering (from the scouting question)

1. **Correctness headroom over strong-agent baselines** — CRAG 34-47%, τ³ ~46-69%, AppWorld ~49% normal / 30% challenge, Spider 2.0 17-27% (but annotation noise), WebArena varying.
2. **Evidence / citation labels** — CRAG ✓✓ (mock API provenance), MultiHiertt ✓✓✓ (fine-grained), FinReflectKG-MultiHop ✓✓✓ (KG-linked), τ³ ✓✓ (DB-state).
3. **Existing reusable family structure** — CRAG ✓✓✓ (600+ templates), SkillFlow ✓✓✓ (DAEF), WebArena ✓✓✓ (812 templated tasks), τ³ ✓✓ (50-114 instances per policy).
4. **Real-product realism** — τ³ ✓✓✓ (airline / retail / telecom / banking with real policies), AppWorld ✓✓✓ (Amazon / Gmail / Venmo / Splitwise), Toolathlon ✓✓✓ (Canvas / Notion / K8s / BigQuery), CRAG ✓✓ (mock APIs but real-domain questions).
5. **Engineering implementation cost** — Q for ConvFinQA / MultiHiertt / FanOutQA / MuSiQue / FRAMES (drop-in datasets), M for CRAG / τ³ / SkillsBench / Spider 2.0 / GAIA (some adapter work), L for AppWorld / WebArena / Toolathlon / SkillFlow (Docker / multi-server / new harness).

CRAG wins on dimensions 1, 3, and is acceptable on 2 and 4. τ³-bench wins on 4 and supplies multi-turn coverage that CRAG lacks. The two-corpus recommendation is the result of treating dimension 4 (product realism) as a hard requirement after the jsonplaceholder finding, not as a tie-break.

### The two-corpus strategy

The datafetch substrate is positioned in `kb/mission.md` as a system that *virtualizes the dataset interface, not the dataset*, and *improves that interface from committed, evidence-backed work*. This is a two-sentence statement, and the second sentence is operationally distinct from the first. The first sentence is testable on any structured-data benchmark with composition: CRAG, Spider 2.0, MultiHiertt, FinReflectKG-MultiHop. The second sentence is testable only where there is a *meaningful sense of an accepted, evidence-backed answer*, which requires either (a) a strong notion of "the user committed this" (i.e., a transactional surface with state) or (b) a strong notion of "the answer was right and the evidence supported it" (i.e., a benchmark with both correctness and evidence labels). Of the candidates, only CRAG, τ³, and FinReflectKG-MultiHop satisfy both halves cleanly.

CRAG is the natural primary because it most closely matches the existing datafetch demo arc: a typed surface (`df.db.*`) of primitives (mock APIs and KG queries are exactly the typed primitives), questions over a fixed dataset, evaluation by correctness + cost / token. The Q1→Q2 cold-to-warm flip generalises trivially to "first question in a CRAG template's family pays cold cost; second question in the same template runs the crystallised helper warm." The compile-to-pipeline (Tier 3) story has a natural fit because mock APIs are RPC-shaped and an Atlas-aggregation-pipeline equivalent for the CRAG KG would compile a multi-call composition into a single typed primitive.

τ³-bench is the companion because the dataset surface is not the whole story when the user pivot is "the substrate behaves on real product flows rather than benchmark slices, with the agent as both consumer and implicit developer of its own interface" (STATUS.md, line 109). τ³ has all of: a real product surface (airline / retail / telecom / banking, with policy documents the agent must respect), multi-turn (the substrate's `df.lib.*` helpers can be called across turns), DB-state evaluation (so an accepted answer is one that produced the right DB delta, which is the closest published analog to the `df.answer(...)` envelope), and a pass^k reliability metric that exactly matches the project's existing concern about whether substrate-ON gains are robust across reruns (the iter164 caveat: "Anthropic API health is the dominant variable").

The two-corpus design also matches the existing pattern in `kb/br/06-bird-finqa-corpus.md`, where the AtlasFS corpus was split into "BIRD subset (cross-collection polymorphism, published baseline) + FinQA full (within-document polymorphism, compilable program) + supply-chain micro-set (demo narrative spine)." Here the same logic produces CRAG (cross-template polymorphism, published baseline) + τ³ (within-policy polymorphism, transactional state) + the existing demo (FinQA Q1→Q2, narrative spine that can stay as the README example).

## Strengths

### CRAG — primary recommendation

**Sibling-query structure is the headline.** CRAG was constructed from 600+ question templates, each instantiated across multiple entities, so a single template like "what was X's revenue in year Y" produces dozens of sibling instances across the 2.6M-entity mock KG. This is *exactly* the structure that exposes substrate value: if the first call rediscovers a helper, the next twelve hit warm. By contrast SkillCraft's 126 tasks across 21 families have at most 6 sibling instances per family (the difficulty buckets E1-E6, M1-M6, H1-H6), and the variation between siblings is dominated by entity-count scaling rather than the question shape, which is why the substrate's family-cache hit rate maxed at the 5-helper-template ceiling.

**Evidence labels are native.** Each question is grounded in the mock KG plus up to 50 retrieved HTML pages per question; the schema of a retrieved page includes `page name`, `page url`, `page snippet`, `page last modified`, `page result`. The mock API outputs are themselves JSON-structured per-entity records — querying for "Microsoft" returns the structured KG record with provenance. Correctness scoring is a tri-state (+1 correct / 0 missing / -1 incorrect), which already encodes safe-abstention as a measurable behaviour. The combination is the rare benchmark where *both* the correctness rubric and the evidence trail are machine-checkable without LLM-as-judge variance — though LLM-as-judge is also supported.

**Real product surface area, by design.** The five domains were chosen to represent "heavy-traffic applications (financial data, live sports)" and "stable, encyclopedic queries". A demo built on CRAG looks like a product-analytics tool, not a benchmark harness. The finance domain in particular plugs directly into the existing FinQA demo narrative — "the user asks finance questions, the substrate amortises the recurring sub-skills across the session" — but at 4,409 questions of scale rather than 8,281 isolated FinQA examples.

**Frontier-agent headroom is large and structurally protected.** GPT-4 with naive RAG hits 44% on CRAG; the KDD Cup 2024 winning solution (NovelSolver, multi-stage routing + dynamic adaptive RAG) hit 47.8% on the hardest task. The remaining 50%+ headroom is not artificially preserved — it lives in the question types CRAG was designed to be hard on: dynamic facts (sub-15% on rapidly-changing data even with retrieval), low-popularity entities (sub-35% on tail), set queries, post-processing, false premises. These are the question shapes where a substrate that builds typed helpers should win, because each shape requires recurring composition (recur-style traversal for set queries, defensive validation for false premises, aggregation for post-processing).

**The popularity × dynamism stratification is a free independent scaling axis.** CRAG already labels entities head / torso / tail (661 / 658 / 665 questions) and facts by temporal dynamism (years / months / days / seconds). The substrate can be evaluated longitudinally as "does the substrate's advantage grow as we move from head to tail?" without re-instrumenting the harness. This satisfies requirement 7 by construction.

**Adoption is already wide.** The KDD Cup 2024 attracted thousands of participants in the first 50 days; published solutions are available with full system descriptions, so the substrate's results land in a context judges already understand. The eval methodology (correctness + missing + hallucinated + cost) parallels the existing R1 / R2 / R3 / R7 metrics, so the substrate's ledger maps onto CRAG's ledger almost line-for-line.

### τ³-bench — multi-turn product-flow companion

**Real product surface with real policies.** τ³-bench's airline / retail / telecom / banking domains each include a domain policy document (the rules the agent must respect, e.g., "you cannot modify a basic economy booking"), a database (passenger / order / account state), and an API surface (book / refund / cancel / lookup). The agent is evaluated by whether the database state at the end of the conversation matches the annotated goal state — this is the closest published analog to the project's `df.answer(...)` envelope notion. Notably the 2026-05-17 STATUS pivot explicitly named "real product flows rather than benchmark slices" as the next-focus framing; τ³ is the benchmark realisation of that pivot.

**Multi-turn with stochastic users.** The user simulator is itself an LLM with a goal description, which means the same task instance can produce different conversation paths. This is the pass^k reliability metric that Anthropic adopted from τ-bench into their model cards: a task is `pass^k` if k independent reruns all succeed. Substrate value should be measurable as both (a) higher pass^1 *and* (b) flatter degradation across pass^k for k > 1, because crystallised helpers cap the variance of execution. This is a richer correctness signal than SkillCraft's binary task-mean and addresses the "Anthropic API health is the dominant variable" caveat from iter164.

**Policy-compliance is reuse-shaped.** The structural insight is that domain policies are themselves *reusable libraries* — "the rules of refund eligibility" is a typed predicate, and crystallising it as `df.lib.airlineRefundEligibility(passengerId)` is precisely the kind of helper a substrate should produce. The fact that policy documents are stable across task instances within a domain means crystallised policy-helpers are perfectly amortisable. τ³ is the only candidate where *policy compliance itself* is a benchmarked dimension; SkillCraft's tasks have no comparable structure.

**Frontier headroom is meaningful, not narrow.** Anthropic reports Claude 3.5 Sonnet at 69.2% retail / 46.0% airline, which is the SOTA at the time. Even with Claude 3.7 (early 2025 SOTA), gpt-4o is reported at <50% airline. τ³ also has an active known-issue-fix track: τ³-bench fixes 50+ tasks across domains (basic-economy disambiguation, impossible payment constraints, cabin-upgrade loopholes), which means the benchmark is being actively curated — a substrate that lands a paper using τ³ will be referencing a maintained surface rather than a frozen one.

**Banking is the newest domain and minimally instrumented.** The τ³ banking domain is in v3 and is the cleanest place for a new substrate evaluation to land — no published baselines specific to the substrate hypothesis exist there yet. This is the rare benchmark where being early is still possible.

### SkillFlow — the closest peer, with one fatal caveat

SkillFlow (arXiv:2604.17308, ZhangZi-a/SkillFlow on GitHub) is the closest construct to what we want: 20 task families × 8–9 tasks each, each task family defined by a Domain-Agnostic Execution Flow (DAEF) that fixes the operation sequence and dependency topology while varying only domain entities, file format, data scale, noise, constraint regime, instruction wording, and difficulty. Operations come from a controlled 12-word vocabulary (read, extract, retrieve, normalize, filter, align, compute, compare, detect, update, validate, output) which is essentially a typed primitive language at the workflow level. Tasks are containerized (Docker / Harbor) with executable verifiers producing binary pass/fail plus a rubric. The lifelong-skill protocol — start with empty skill library, generate or repair skills after each task, evaluate on subsequent tasks — is exactly the cold-to-warm cycle the datafetch demo expresses.

**Strengths:** explicit family structure (the strongest in the candidate pool — DAEF is operationally equivalent to the project's shape-hash notion of "two trajectories with the same canonical step sequence share a hash"), real product surface (finance / SEC 13F / supply chain / healthcare / OCR / sales pivots), executable correctness, scaling axis (skill library size).

**Caveat:** Claude Sonnet 4.6 on SkillFlow shows vanilla 56.63% → evolved 56.63% (Δ = 0.00), with Opus 4.6 at 62.65% → 71.08% (Δ = +8.43). The fact that Sonnet 4.6 — the project's measurement default — shows zero skill-evolution gain on a benchmark specifically designed to elicit skill evolution is a significant warning. It says either (a) Sonnet 4.6 lacks the skill-coordination capability (the "creation-reuse coordination gap" the paper identifies in weaker stacks), or (b) the benchmark's skill mechanism is over-aligned with the model's existing internal-rewrite reflex (the same pattern we saw on jsonplaceholder). Either reading means SkillFlow would not separate substrate-ON / substrate-OFF on Sonnet 4.6 any better than SkillCraft did, and possibly worse. SkillFlow is therefore the right *peer* to cite in Related Work, but the wrong *primary* surface to measure on.

### Tier-2 candidates (kept on radar)

**AppWorld** (Trivedi et al., arXiv:2407.18901, 750 tasks across 9 apps with 457 APIs and ~100 fictitious users) is the strongest fallback. State-based unit tests with collateral-damage check are the gold standard for product-surface correctness. Task variations are built in (different initial conditions and instruction perturbations) which structurally provides the cold-creation / warm-reuse / hard-generalization distinction. GPT-4o solves ~49% normal tasks and ~30% challenge, so headroom is wide; an RL-trained Qwen2.5-32B (LOOP, Feb 2025) reaches 71% TGC, which is the published ceiling for a substrate-style training approach. The cost is engineering: a full AppWorld harness is 60K LoC of execution environment plus 40K LoC of benchmark, which is ~10x the integration cost of CRAG.

**WebArena** (812 templated tasks across 4 self-hosted sites — e-commerce, social forums, gitlab, content management) is the *original* sibling-query-templated benchmark, and the published substrate-style wins are stunning: Agent Workflow Memory (AWM) reports +51% relative gain, SkillWeaver +31.8% relative. These results validate the substrate hypothesis on this surface directly. The downside is engineering cost (self-hosted Docker environments per site) and the rapidly-evolving SOTA — WebArena-Verified is the maintained fork now, and the leaderboard has 20+ active agents, so the differentiation story compresses by the day.

**Spider 2.0 and BIRD-Critic** are the SQL-shaped wedge for an enterprise-analytics demo. Spider 2.0 has 632 tasks across BigQuery / Snowflake / DBT / Lite settings; SOTA is 17% (o1-preview) to 27% (best agent). BIRD-Critic has 600 dev + 200 OOD across MySQL / PostgreSQL / SQL Server / Oracle; SOTA is 38.87% on PG (o3-Mini). The headroom is enormous. **But** the 2026 VLDB paper benchmarked annotation error rates at 52.8% (BIRD Mini-Dev) and 62.8% (Spider 2.0-Snow), with rank-position changes ranging -9 to +9 once those errors are corrected. A substrate-driven correctness delta in the single-digit-pp range would be unmeasurable against this annotation noise floor. Spider 2.0-DBT (68 repository-level tasks, a code-agent benchmark since May 2025) escapes the annotation issue because evaluation is dbt-build-pass / dbt-build-fail, and is the most credible SQL-flavor fallback if CRAG is rejected.

**Toolathlon** (Junlong Li et al., arXiv:2510.25726, ICLR 2026, 32 MCP servers, 604 tools, 108 tasks, ~20-turn average) is the long-horizon agent benchmark with the widest product-surface coverage (Canvas / Notion / WooCommerce / Kubernetes / BigQuery). Claude 4.5 Sonnet hits 38.6%; open-weight DeepSeek-V3.2-Exp at 20.1%. The 108-task scale is the floor for sibling structure (just above the ≥3 × ≥3 requirement if you partition by app), but the tasks are explicitly "diverse, realistic, and long-horizon" rather than family-structured, so substrate value would come from cross-app reuse rather than within-family amortisation.

**SkillsBench** (arXiv:2602.12670, Feb 2026, 84 tasks across 11 domains) is the cleanest "did Skills help?" evaluation. Three conditions per task (no Skills / curated Skills / self-generated Skills) and deterministic verifiers eliminate LLM-as-judge variance. Claude Code with Opus 4.5 shows +23.3pp pass-rate gain with curated Skills; self-generated Skills provide no benefit on average, which mirrors the jsonplaceholder finding. This is the *right shape* of evaluation for substrate value, but the per-domain task count (~7-8) is just at the requirements floor, and the benchmark is positioned around the Skills artefact specifically (markdown files + scripts + resources), not around a typed-callable surface. A datafetch eval on SkillsBench would have to declare whether `df.lib.*` helpers count as "Skills" in their nomenclature, which is a positioning decision.

**ConvFinQA** (Chen et al., 2022, 3,892 conversations × 14,115 QA pairs) is the existing fit's natural successor. Type II hybrid conversations are exactly the "sibling queries with cross-aspect reasoning" structure the requirements call for. The 21-point gap between best fine-tuned model (68.90%) and human expert (89.44%) is meaningful headroom, and program-supervised evaluation gives intermediate-step verification. The drawback: it's a conversational *dataset* not an *agentic* environment, so the substrate would be measured at the LLM-output level rather than the tool-call composition level. Integration cost is Q (drop-in dataset).

**MultiHiertt** (Zhao et al., 2022, ACL 2022) and **FinReflectKG-MultiHop** (Arun et al., arXiv:2510.02906, 2025) are the two strongest fine-grained-evidence benchmarks. MultiHiertt has annotated supporting facts at the cell level across hierarchical tables. FinReflectKG-MultiHop has 2-3 hop subgraph patterns with KG-linked evidence labels, S&P 100 filings (2022-2024), and three controlled retrieval scenarios (S1 KG-linked precise / S2 page-window / S3 page-window + distractors). Both are excellent for an evidence-quality demo specifically — FinReflectKG reports +24% correctness and -84.5% tokens with KG-guided retrieval vs page-window — but neither has the family-structure or product-surface depth to be a primary substrate eval.

## Limitations & Risks

### CRAG-specific risks

**Static-snapshot dynamism.** CRAG's "facts changing within seconds" axis was instrumented against the 2024 data state. By 2026, the temporal-dynamism stratification is calcified — a substrate eval running today is measuring against the 2024 ground-truth, which means questions about "live sports scores" and "current stock prices" are measuring memorisation against a frozen oracle rather than handling true dynamism. Mitigation: run the eval against the "stable facts" + "slow-changing facts" subset only, or accept the static-snapshot caveat in the methodology section. This is a known issue in the CRAG paper itself.

**Mock APIs are a simplification.** The mock KG with 2.6M entities is realistic but it is a *single* corpus; CRAG does not exercise the multi-tenant overlay story (different tenants developing different helpers over the same data plane). The Dimension 1 (L_n library divergence) part of the AtlasFS thesis cannot be exercised on CRAG without running multiple synthetic tenant configurations, which is a research design decision rather than a benchmark property. Mitigation: instrument two synthetic tenants on the same CRAG corpus — one weighted toward finance + sports questions, one toward music + movie — and report L_n divergence as an additional metric.

**Question templates are not always sibling-amortisable.** "What is X's revenue in Y" is a clean sibling family. "Is the statement 'X is Y's husband' true given that X actually married Z" (false-premise) is a sibling-family of a different shape — the helper is "defensive validation" rather than "data fetch." The substrate must crystallise helpers that span across the question-type axis, not just across entities. This is a strength for measuring richer crystallisation, but a risk if the substrate's current policy only authors `toolFanout`-shape helpers. Mitigation: pre-register a per-question-type analysis so that the substrate's wins are decomposable, not aggregated into one number.

**License is CC BY-NC.** Not commercially redistributable, which constrains downstream productization stories but is fine for a research paper or open-source eval.

**LLM-as-judge variance.** The evaluator combines rule-based matching with LLM-as-judge. For non-trivial questions, the LLM-as-judge component introduces grading variance that can dominate small effect sizes. Mitigation: report rule-based-only scores as the primary metric for the paired comparison, and LLM-judge-augmented scores as a secondary.

### τ³-bench-specific risks

**User simulator stochasticity is a feature and a confounder.** Pass^k is a great reliability metric but it requires k reruns per task, which inflates eval cost roughly k-fold. The substrate-ON / substrate-OFF paired comparison at k=4 costs 4× what a single-shot benchmark costs. Mitigation: run pass^1 as the primary metric and pass^4 as the reliability check.

**Active issue fixes mean the benchmark moves.** τ³-bench has rolled forward through τ-bench → τ²-bench → τ³-bench with 50+ task fixes. A substrate paper measuring on τ³ today is measuring on a different surface than τ-bench papers from 2024. Mitigation: pin a specific commit hash and document the version explicitly.

**Multi-turn evaluation amplifies non-substrate confounders.** A failed turn early in the conversation cascades; substrate-OFF and substrate-ON arms can diverge for reasons unrelated to the substrate (e.g., one arm asks a clarifying question, one doesn't). Mitigation: use the dual-control (τ²-bench) evaluation mode where the agent and user both modify the database state, and report per-turn substrate contributions in addition to end-state correctness.

**Banking is the newest domain — fewest published baselines.** This is also a strength (room to claim novelty) but means the reviewer-expected baseline-comparison story is weaker than for airline / retail. Mitigation: report on airline + retail + telecom + banking with explicit per-domain breakdowns.

### SkillFlow-specific risks (why we reject it as primary)

The headline risk is the published Sonnet 4.6 result: vanilla 56.63% → evolved 56.63% (Δ = 0.00). On the project's measurement default, SkillFlow's own skill-evolution mechanism does not move the correctness needle, which directly mirrors the SkillCraft Sonnet-saturation problem we are trying to escape. A substrate paper that lands a measurable correctness delta on a benchmark where the *peer* skill mechanism shows zero would be a positive result, but it requires the substrate to outperform a paper-grade skill-induction baseline on a benchmark designed around skill induction — a high bar to clear on a fresh implementation cycle. Better to use SkillFlow's DAEF construction *pattern* (the 12-word controlled vocabulary, the seed-task expansion into difficulty-graded siblings) as an *internal* eval template for follow-up work, rather than as a primary measurement surface.

### Cross-cutting risks

**Annotation-error contamination.** The 2026 VLDB paper on Spider 2.0 / BIRD annotation errors (52.8% / 62.8%) generalizes: any benchmark with hand-authored ground truth has an error floor. CRAG was hand-verified for 4,409 QA pairs; the published error rate is much lower than Spider's but not zero. Pre-registering the metric as "delta vs. matched-arm baseline on the same eval pipeline" (the same pattern as P1) controls for this — the substrate-ON vs substrate-OFF *difference* is measured against the same noisy oracle, so annotation noise cancels.

**Saturation drift.** Frontier models from 2026 will saturate any 2024-vintage benchmark within months. The recommendation here assumes the substrate eval lands within ~6 months. Beyond that, GAIA-style saturation will hit (Gaia2 was released to escape Gaia saturation; HLE was released to escape MMLU saturation; the pattern repeats). Mitigation: build the harness so the corpus and the metrics are decoupled — CRAG-the-corpus can be swapped for CRAG-v2 / GAIA3 / Toolathlon-v2 without rewriting the eval scorer.

**LLM-as-judge concentration risk.** Every contemporary RAG benchmark relies on LLM-as-judge for grading complex questions. The substrate-ON / substrate-OFF runs share the same LLM-judge, so the comparison is internally valid, but the absolute numbers are only as good as the judge model. The mitigation matches the P1 design: report paired-t / McNemar on per-instance pass/fail, not on absolute pass rates.

## Integration Analysis

### What to extract

**From CRAG:**

1. **The 600+ question templates themselves.** Use the template structure to define intent-families directly. A template like "what was {company}'s {metric} in {year}" generates dozens of sibling queries; the substrate's family-cache should hit warm on the second instance.
2. **The mock-API surface.** Map CRAG's mock APIs onto the existing `df.db.*` namespace. A CRAG call like `get_company_info("Microsoft")` becomes `df.db.cragFinance.findEntity("Microsoft")` — the substrate's typed-callable model is a near-drop-in fit for CRAG's API design.
3. **The popularity × dynamism stratification labels.** Use them as an independent scaling axis. Substrate value should grow as we move head → torso → tail, because tail-entity helpers are the rarest and therefore the highest-leverage to crystallise.
4. **The tri-state correctness rubric.** Adopt +1 / 0 / -1 into the project's R1 metric. This makes safe-abstention a first-class measurable rather than a binary failure.

**From τ³-bench:**

1. **The pass^k reliability metric.** This is the closest published analog to the project's "is the substrate's win robust across reruns" concern.
2. **The policy-document-as-library framing.** Crystallise domain policies as `df.lib.<domain>Policy.*` helpers — this is a Tier-3 compile-to-pipeline candidate of a kind that doesn't exist in SkillCraft.
3. **The DB-state-as-correctness framing.** Adopt this for the `df.answer(...)` envelope's structural validation — if the DB delta matches the goal state, the answer is structurally valid regardless of the natural-language phrasing.
4. **The banking-domain template.** Use it as a new-domain test ground; no published substrate baselines exist there yet.

**From the rejected candidates (for the related-work section):**

1. **SkillFlow's DAEF (Domain-Agnostic Execution Flow)** as the formalisation of "intent family" — useful vocabulary for the methodology section.
2. **SkillFlow's 12-word controlled operation vocabulary** (read, extract, retrieve, normalize, filter, align, compute, compare, detect, update, validate, output) as a candidate typed-primitive vocabulary for the substrate's manifest, generalising the current `db.findExact|search|findSimilar|hybrid` set.
3. **SkillsBench's three-condition design** (no skills / curated skills / self-generated skills) as an additional ablation alongside the substrate-ON / substrate-OFF dichotomy. Curated skills correspond to "seeded library"; self-generated corresponds to "observer crystallisation only"; no skills is the existing OFF arm.
4. **MultiHiertt's supporting-fact annotation** as the schema for the substrate's evidence-trail emission.
5. **The Tool Decathlon's 32-MCP / 604-tool scaling** as the existence proof that long-horizon, broad-tool eval is now feasible at the substrate level.

### Bootstrap path

The minimal integration path is:

```
Phase 1 (Quick, ~1d):
  - Pull CRAG dataset from facebookresearch/CRAG.
  - Write a CRAG-to-datafetch adapter:
    * Mock APIs → typed primitives under df.db.crag.<domain>.*
    * Question templates → intent signatures
    * Tri-state correctness rubric → R1 scorer extension
  - Run a 100-question smoke on substrate-OFF (baseline) and verify the harness composes correctly.

Phase 2 (Short, ~3d):
  - Run the matched-arm paired comparison: substrate-ON vs substrate-OFF on the full 2,706 public CRAG examples
    (validation + public test combined; the 1,703 private test stays held-out).
  - Score on R1 (correctness), R2 (effective tokens), R3 (cache), R6 (compositional clusters), R7 (helper reuse),
    R8 (cross-family transfer), R9 (FANOUT-tool transfer).
  - Slice by domain × question type × popularity × dynamism, report per-slice McNemar / paired-t.

Phase 3 (Medium, ~5d):
  - Build a τ³-bench adapter: airline + retail + telecom + banking, all four domains.
  - Run pass^1 paired comparison on a 50-task subset per domain (~200 tasks total).
  - If pass^1 is significant, run pass^4 on a 25-task per-domain subset.

Phase 4 (Medium, ~3d, optional):
  - Instrument two synthetic tenants on the same CRAG corpus (finance-heavy, music-heavy).
  - Report L_n library divergence between the two tenants over a 500-question run each.
  - This is the first published demonstration of the AtlasFS Dimension 1 (per-tenant emergence) thesis.

Phase 5 (Large, ~7d, stretch):
  - Build a SkillFlow harness alongside, run substrate-ON vs the SkillFlow native skill-evolution
    mechanism as the *adversarial* baseline (rather than no-skills).
  - The result is the strongest possible "substrate vs published-skill-mechanism" headline.
```

Total estimated effort for the recommended primary path (Phases 1-3): **Medium**, on the order of 10 person-days. Phases 4-5 are stretch goals for a follow-up paper.

### Effort estimate

| Phase | Subject | Effort | Critical-path? |
|---|---|---|---|
| 1 | CRAG adapter + smoke | Quick (~1d) | Yes |
| 2 | CRAG full paired comparison | Short (~3d) | Yes |
| 3 | τ³-bench adapter + paired comparison | Medium (~5d) | Yes |
| 4 | Multi-tenant divergence on CRAG | Medium (~3d) | No |
| 5 | SkillFlow adversarial baseline | Large (~7d) | No |

**Primary recommendation** (CRAG + τ³ paired comparison): **Medium, ~10 person-days**. This produces a publishable result aligned with the project's existing P1 methodology.

**Maximum recommendation** (all phases): **Large, ~18 person-days**. This produces a substantially stronger result that addresses the multi-tenant Dimension 1 thesis and the SkillFlow adversarial peer comparison.

The substrate code itself does not need modification for Phase 1-3; the work is harness adaptation and metric extension. Phases 4-5 may surface substrate gaps (the multi-tenant overlay isn't fully exercised today; an adversarial skill-evolution baseline may expose crystallisation-policy thinness similar to the jsonplaceholder finding), which is fine — those gaps are the kinds of issues a research paper benefits from naming.

### Substrate primitive mapping

The CRAG mock-API namespace maps cleanly onto the existing `df.db.*` model:

```
CRAG: mock_kg.finance.get_company_info(ticker)        → df.db.crag.finance.companyInfo({ticker})
CRAG: mock_kg.movies.get_movie_by_id(id)              → df.db.crag.movies.movieById({id})
CRAG: mock_kg.sports.get_player_career(name)          → df.db.crag.sports.playerCareer({name})
CRAG: mock_web.search(query)                           → df.db.crag.web.search({query})
CRAG: mock_kg.music.get_artist_discography(artist)    → df.db.crag.music.artistDiscography({artist})
```

Crystallised helpers in `lib/<tenantId>/` are the next layer:

```
After 1st run of "what was X's revenue between 2014 and 2018":
  lib/demo-tenant/rangeFinanceMetric.ts crystallised.
After 2nd run on Y instead of X:
  lib.rangeFinanceMetric({company:Y, metric:'revenue', start:2014, end:2018}) → 1 client-visible call.

After 1st run of "compare Y1 and Y2 on metric M":
  lib/demo-tenant/compareFinanceMetric.ts crystallised.

After 1st run of "is statement S true given evidence E":
  lib/demo-tenant/falsePremiseCheck.ts crystallised (defensive validation pattern).
```

The shape-hash dedup mechanism already in place will treat the substring-permuted entities (X vs Y) as the same shape, so the second call hits warm. The challenge is the *cross-type* crystallisation — a helper that spans "compare" and "range" question shapes within the finance domain — which the current crystallisation policy may not author. This is exactly the kind of test the CRAG benchmark forces.

τ³-bench's policy documents map onto a different `df.lib.*` shape:

```
τ³: airline_policy_document.basic_economy_modification_rule → df.lib.airlinePolicy.canModifyBasicEconomy(bookingId)
τ³: retail_policy_document.return_eligibility_rule         → df.lib.retailPolicy.isReturnEligible(orderId)
τ³: telecom_policy_document.troubleshooting_decision_tree  → df.lib.telecomPolicy.diagnose(deviceId, symptom)
τ³: banking_policy_document.fraud_dispute_eligibility      → df.lib.bankingPolicy.canDisputeFraud(transactionId)
```

These are typed predicates over transactional state, which is structurally the cleanest fit for the substrate's compile-to-pipeline (Tier 3) story — a policy predicate is the most compressible composition possible.

### Metrics

The substrate's existing R1-R9 metric ledger extends to both benchmarks without re-instrumentation:

| Metric | SkillCraft (current) | CRAG (proposed) | τ³-bench (proposed) |
|---|---|---|---|
| R1 (pass rate) | per-task task-mean | per-question tri-state (+1/0/-1) | per-task pass^1 |
| R2 (effective tokens) | per-task delta | per-question delta | per-conversation delta |
| R3 (cache) | per-task cache fraction | per-question cache fraction | per-turn cache fraction |
| R4 (errors) | per-task runtime errors | per-question API errors | per-conversation policy violations |
| R6 (clusters) | family-level cluster count | template-level cluster count | policy-level cluster count |
| R7 (helper reuse) | family-cache hit rate | template-cache hit rate | policy-cache hit rate |
| R8 (cross-family transfer) | mean cost ratio | head/torso/tail cost ratio | airline/retail/telecom/banking cost ratio |
| R9 (FANOUT-tool transfer) | tool transfer count | template-shape transfer count | policy-shape transfer count |

Three new metrics specific to the new benchmarks:

- **R10 (calibration)** — Brier score on the +1/0/-1 tri-state correctness rubric. Substrate-ON should have lower Brier (better calibrated) because crystallised helpers carry their own confidence bands. CRAG-only metric.
- **R11 (pass^k degradation slope)** — (pass^4 - pass^1) / 4. Substrate-ON should have flatter degradation because helpers cap execution variance. τ³-only metric.
- **R12 (L_n divergence)** — KL-divergence between two synthetic tenants' crystallised library distributions, run on the same corpus. CRAG-only metric, optional Phase 4.

The matched-arm paired comparison methodology from P1 carries forward as-is: McNemar's test on per-instance pass/fail for R1, paired t-test on per-instance log-token-count for R2, paired t-test on per-instance log-wall-clock for the latency dimension. The protocol is well-rehearsed and the new benchmarks only require harness changes, not methodology changes.

## Key Takeaways

1. **Run on CRAG as primary + τ³-bench as multi-turn companion.** CRAG's 4,409 questions × 5 product domains × 8 question types × 600+ templates supply the structured-data composition story; τ³'s airline / retail / telecom / banking policy-bound DB-state evaluation supplies the multi-turn product-flow story. Together they cover both halves of the datafetch "virtualize the interface + improve it from accepted answers" positioning, which a single-corpus eval cannot.

2. **Reject MuSiQue / FRAMES / FanOutQA / GAIA / HLE / BrowseComp as primary substrate evals**, even though they have excellent evidence labels. Each is a benchmark of *independent* multi-hop questions, not of *families* of sibling queries over a shared corpus; the substrate has nothing to amortise. They are useful as Related Work comparisons and as evidence-quality probes, not as primary surfaces.

3. **Spider 2.0 / BIRD-Critic retain headroom but suffer documented annotation noise** (52.8–62.8% per the 2026 VLDB paper), which would mask a single-digit-pp substrate effect. Spider 2.0-DBT (68 repository-level tasks with dbt-build pass/fail eval) escapes the annotation issue and is the right SQL-flavor fallback. AppWorld is the strongest infrastructural fallback if CRAG fails a no-published-leaderboard sanity check.

4. **SkillFlow is the closest published peer to the project's mechanism**, but Claude Sonnet 4.6 — the project's measurement default — shows Δ = 0.00 between vanilla and evolved skills on SkillFlow, which would inherit the SkillCraft Sonnet-saturation problem we are trying to escape. Cite SkillFlow's DAEF construction pattern in Related Work, but do not measure on it as the primary surface. Same logic applies to SkillsBench (small per-domain n, Skills-as-artefact framing) and Toolathlon (long-horizon but not family-structured).

5. **The substrate's typed-primitive surface maps onto CRAG's mock-API namespace and τ³'s policy-document predicates almost line-for-line.** Bootstrap is a Medium-effort (~10 person-day) adapter project that produces a publishable matched-arm paired comparison aligned with the project's existing P1 methodology. The substrate codebase itself does not need modification for the primary path; the work is harness adaptation and metric extension (add R10 calibration / R11 pass^k slope / optional R12 multi-tenant L_n divergence to the existing R1-R9 ledger).

## Sources

### Primary candidates

- **CRAG (Meta KDD Cup 2024, Comprehensive RAG Benchmark)** — Yang et al., arXiv:2406.04744, June 2024. Dataset: [github.com/facebookresearch/CRAG](https://github.com/facebookresearch/CRAG/), CC BY-NC. KDD Cup 2024 winning solution: Ouyang et al., arXiv:2409.15337. Competition portal: [aicrowd.com/challenges/meta-comprehensive-rag-benchmark-kdd-cup-2024](https://www.aicrowd.com/challenges/meta-comprehensive-rag-benchmark-kdd-cup-2024). Headline: 4,409 QAs, 5 domains, 8 question types, 600+ templates, 2.6M-entity mock KG, ≤50 HTML pages/question, SOTA 34-47%.
- **τ-bench / τ²-bench / τ³-bench (Sierra)** — Yao et al., arXiv:2406.12045, June 2024 (original); arXiv:2506.07982, June 2025 (τ²); τ³ repo: [github.com/sierra-research/tau2-bench](https://github.com/sierra-research/tau2-bench). Leaderboard: [taubench.com](https://taubench.com). Headline: 50/114/etc tasks per domain, 4 domains (airline / retail / telecom / banking), DB-state evaluation, pass^k reliability metric, Claude 3.5 Sonnet 46-69%.

### Tier-2 candidates (deep-dived)

- **SkillFlow** — ZhangZi-a et al., arXiv:2604.17308, April 2026. Code: [github.com/ZhangZi-a/SkillFlow](https://github.com/ZhangZi-a/SkillFlow). Headline: 166 tasks across 20 families, DAEF flow, Docker/Harbor verifiers, Sonnet 4.6 vanilla 56.63% → evolved 56.63%.
- **SkillsBench** — arXiv:2602.12670, February 2026. Headline: 84 tasks × 11 domains, three conditions (no/curated/self-gen), deterministic verifiers, Claude Code Opus 4.5 +23.3pp with curated Skills.
- **Toolathlon (Tool Decathlon)** — Junlong Li et al., arXiv:2510.25726, ICLR 2026. Code: [github.com/hkust-nlp/Toolathlon](https://github.com/hkust-nlp/Toolathlon). Headline: 32 MCP servers, 604 tools, 108 tasks, Claude 4.5 Sonnet 38.6%, ~20-turn average.
- **Spider 2.0** — xlang-ai, ICLR 2025 Oral, [spider2-sql.github.io](https://spider2-sql.github.io/). Code: [github.com/xlang-ai/Spider2](https://github.com/xlang-ai/Spider2). Headline: 632 tasks across BigQuery / Snowflake / DBT / Lite, o1-preview 17.1%, GPT-4o 10.1%. Spider 2.0-DBT (68 repository-level tasks, May 2025) is the clean code-agent split.
- **BIRD-Critic (SWE-SQL)** — bird-critic.github.io, accepted NeurIPS 2025. Code: [github.com/bird-bench/BIRD-CRITIC-1](https://github.com/bird-bench/BIRD-CRITIC-1). Headline: 600 dev + 200 OOD across 4 dialects, o3-Mini 38.87% on PG.
- **AppWorld** — Trivedi et al., arXiv:2407.18901, ACL 2024. Site: [appworld.dev](https://appworld.dev/). Leaderboard: [hal.cs.princeton.edu/appworld_test_challenge](https://hal.cs.princeton.edu/appworld_test_challenge). Headline: 750 tasks × 9 apps × 457 APIs, GPT-4o 49% normal / 30% challenge.
- **WebArena / WebArena-Verified** — Zhou et al., 2023. Site: [webarena.dev](https://webarena.dev/). Verified fork: [github.com/ServiceNow/webarena-verified](https://github.com/ServiceNow/webarena-verified). Headline: 812 templated tasks × 4 self-hosted sites, AWM +51% rel / SkillWeaver +31.8% rel.
- **ConvFinQA** — Chen et al., arXiv:2210.03849, EMNLP 2022. Headline: 3,892 conversations × 14,115 QA pairs, Type II hybrid = sibling structure, 21-pt gap between best fine-tuned model (68.90%) and human expert (89.44%).
- **MultiHiertt** — Zhao et al., arXiv:2206.01347, ACL 2022. Headline: ~10K QAs over hierarchical financial tables, supporting-fact annotations, MT2Net model.
- **FinReflectKG-MultiHop** — Arun et al., arXiv:2510.02906, October 2025. Headline: 2-3 hop subgraph patterns over S&P 100 filings (2022-2024), KG-linked evidence labels, three retrieval scenarios (S1/S2/S3), +24% correctness and -84.5% tokens with KG-guided retrieval.
- **FanOutQA** — Zhu et al., arXiv:2402.14116, ACL 2024. Code: [github.com/zhudotexe/fanoutqa](https://github.com/zhudotexe/fanoutqa). Headline: 1,034 questions × 7,305 decompositions, three settings (closed/open/evidence-provided), best models <50%.
- **MuSiQue** — Trivedi et al., 2021. Headline: multi-hop chains with intermediate-answer annotations, ~32 F1 on Ans split (vs ~65 F1 on HotpotQA).
- **FRAMES (Google + Harvard)** — arXiv:2409.12941, September 2024. NAACL 2025. Headline: 824 multi-hop questions, 2-15 Wikipedia documents, 40% no-RAG → 66% multi-step / 73% oracle.

### Rejected with explicit reasoning

- **GAIA / GAIA2 (Meta)** — Mialon et al., arXiv:2311.12983 (original); arXiv:2602.11964 (Gaia2). Headline: original GAIA approaching saturation (h2oGPTe + Claude 3.7 ~74%); Gaia2 introduces async dynamic environments (GPT-5 high 42% pass@1).
- **BrowseComp (OpenAI)** — Wei et al., arXiv:2504.12516, April 2025. Headline: 1,266 hard-to-find web research questions, Deep Research 51.5% vs o1 9.9%; one-shot navigation, no family structure.
- **Humanity's Last Exam (HLE) / Center for AI Safety** — [agi.safe.ai](https://agi.safe.ai/). Headline: 2,500 expert questions, Gemini 3.1 Pro 41% (current SOTA), no family structure.
- **SealQA / BLUR** — arXiv:2506.01062 / arXiv:2503.19193. Headline: SealQA tests reasoning under noisy search (o3 17.1% on Seal-0); BLUR is tip-of-the-tongue (573 questions, best system ~56% vs human 98%); both are one-shot puzzle benchmarks.
- **SkillCraft** — Chen et al., arXiv:2603.00718. Headline: 21 task families × 6 difficulty buckets = 126 tasks; the project's current measurement surface, now near-saturated on Sonnet 4.6.

### Methodology and meta references

- **OSWorld** — arXiv:2404.07972. Headline: 369 real computer-use tasks; Claude Opus 4.6 ~72.7%, approaching the 72.36% human baseline; saturation pattern.
- **Spider 2.0 / BIRD annotation-error study** — VLDB 2026, [vldb.org/cidrdb/papers/2026/p5-jin.pdf](https://www.vldb.org/cidrdb/papers/2026/p5-jin.pdf). Headline: 52.8% error on BIRD Mini-Dev, 62.8% on Spider 2.0-Snow, rank-position changes ±9.
- **Project STATUS** — `/Users/jayfarei/src/tries/2026-05-01-hackathon/experiments/STATUS.md` (2026-05-18). Defines the post-iter164 / post-P1 / post-P2 strategic pivot to "real product flows."
- **Project mission** — `/Users/jayfarei/src/tries/2026-05-01-hackathon/kb/mission.md`. The "virtualize the dataset interface" framing the recommendation aligns to.
- **Existing kb/br/04-skillcraft** — the SkillCraft deep-dive that established the auto-induction baseline.
- **Existing kb/br/06-bird-finqa-corpus** — the BIRD + FinQA hybrid that established the precedent for a two-corpus eval strategy.

### Related-work pointers (cite but do not measure on)

- **SkillRet** (arXiv:2605.05726, large-scale skill retrieval, 17,810 skills with 2-level taxonomy)
- **SkillRouter** (arXiv:2603.22455, skill routing for LLM agents at scale)
- **"How Well Do Agentic Skills Work in the Wild"** (arXiv:2604.04323)
- **"Organizing, Orchestrating, and Benchmarking Agent Skills at Ecosystem Scale"** (arXiv:2603.02176, 280K+ public skills as of February 2026)
- **Frontier-Eng** (arXiv:2604.12290, self-evolving agents on real-world engineering tasks)
- **ECom-Bench** (arXiv:2507.05639, e-commerce customer support, 53 multimodal tasks)
- **OlaMind / OlaBench** (arXiv:2510.22143, real-world customer service dialogue)
- **TraceBack / CITEBENCH** (arXiv:2602.13059, multi-agent decomposition for table attribution at the cell level)
- **RCAEval** (arXiv 2025, root cause analysis for microservices with multi-source telemetry; the closest published observability benchmark)
- **LogEval** (arXiv:2407.01896, comprehensive log analysis benchmark for LLMs)
- **OTT-QA / HybridQA** (open-domain table + text QA, 45K questions; the precursor to FinReflectKG-MultiHop)
- **Sierra τ-bench blog** — [sierra.ai/blog/tau-bench-shaping-development-evaluation-agents](https://sierra.ai/blog/tau-bench-shaping-development-evaluation-agents). Sierra's own framing of why τ-bench matters.
- **Anthropic Claude 3.5 Sonnet computer-use launch** — [latent.space/p/claude-sonnet](https://www.latent.space/p/claude-sonnet). The post that put τ-bench on Anthropic's official model card.
