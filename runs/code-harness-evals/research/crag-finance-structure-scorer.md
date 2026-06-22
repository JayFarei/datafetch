# CRAG-Finance: Call Structure, Mock-API Surface, Scorer, Baselines

**Research brief (deep-research, focused mode) — 2026-05-29.** Resolves the Stage-0 modeling fork and H0/H1 for the CRAG match/beat experiment. Sources: CRAG paper (arXiv:2406.04744), facebookresearch/CRAG repo, KDD Cup 2024 writeups. Focused mode: markdown only, no HTML/PDF deck generated (budget discipline; the goal needs the findings, not a report artifact).

## 1. Finance call structure (decides H0)

CRAG Finance has **1,039 questions**. Question-type distribution [1]:

| Type | Count | % | Typical call shape |
|---|---|---|---|
| Simple | 466 | 45% | `get_ticker_by_name(name) → get_<metric>(ticker)` — **2-call same-category chain** |
| Simple w. Condition | 113 | 11% | ticker resolve → conditioned fact lookup — **2-call chain** |
| Comparison | 146 | 14% | 2 entities × lookups — **fan-out** |
| Multi-hop | 86 | 8% | chained lookups |
| Aggregation | 69 | 7% | 1 lookup + fan-out + reduce |
| False Premise | 85 | 8% | lookup + local validation |
| Set | 48 | 5% | set-returning lookup |
| Post-processing | 26 | 3% | lookup + compute |

**The crux:** **~56% of Finance (Simple + Simple-w-Condition) is the 2-call entity-resolution→fact-lookup chain** — `finance_get_ticker_by_name` then `finance_get_pe_ratio`/`get_market_capitalization`/`get_eps`/`get_price_history` [1][3]. A finance question "would typically call 1–3 APIs"; the flow for a stock-price query is `finance_get_ticker_by_name → finance_get_price_history` [1].

This directly confirms the Stage-0 H0 risk (logged Attempt 54): the substrate's **category-only intent signature** (`template.ts`: any ≥2 consecutive same-category calls → `FANOUT(category)`) collapses these 2-call chains to one bucket and authors a single literal-clone helper that hardcodes one metric API — the P1 correctness landmine (reuse it for a different metric → wrong answer → CRAG `-1` hallucination). The dominant Finance shape is exactly the collapse-prone case.

**Favorable nuance:** the remaining **~34%** (comparison 14% + multi-hop 8% + aggregation 7% + set 5%) are genuinely *composable* — fan-outs and multi-hops that the substrate's record-rooted render functions (`recordToolLookup = FANOUT(db)→FANOUT(tool)`, `recordToolFanout = db→FANOUT(tool)→lib`) are designed to handle, AND these are the slices CRAG reports as hardest (**<20% auto-score** for finance/real-time/tail/set/aggregation/false-premise [1]). So substrate value, if it exists, should appear on the composite 34%, not the simple 56%.

## 2. Mock-API surface (Finance)

38 mock APIs total; KG ~2.6M entities; ≤50 Brave-search HTML pages/question; signal-to-noise <1/30 [1]. Finance endpoints [1]:

`finance_get_company_name(query)`, `finance_get_ticker_by_name(query)`, `finance_get_price_history(ticker)`, `finance_get_detailed_price_history(ticker)`, `finance_get_dividends_history(ticker)`, `finance_get_market_capitalization(ticker)`, `finance_get_eps(ticker)`, `finance_get_pe_ratio(ticker)`, `finance_get_info(ticker)`. Most APIs take an entity, return entity info as JSON [4]. Server code in `mock_api/`; the canonical agent flow is entity-match → time-extract → API-select (decision tree) → JSON-to-markdown [4].

**Modeling implication (df.tool vs df.db fork resolved):** the APIs are RPC-shaped over a KG. The repo scouting (`kb/br/16`) maps them to `df.db.crag.finance.*`. The **hybrid** that best fits the substrate: ticker/entity resolution as a **`df.db`** corpus lookup, metric APIs as **`df.tool`** — turning the dominant Simple chain from `tool→tool` (collapses) into `db→tool` (mixed → `extractSubGraphTemplates` fires, db-rooted). But note: a single `db→tool` 2-call is still not one of the substrate's *fanout* render shapes, so even hybrid modeling does not guarantee a correct intent-shaped helper for the 2-call case without a substrate fix.

## 3. Scorer (pin for Stage 1 — port faithfully, no relaxation)

Scorer code: `local_evaluation.py` [2]. Auto-eval is **3-way**: `+1 accurate` (human "Perfect"+"Acceptable" merged), `0 missing` ("I don't know"/no answer), `-1 incorrect` (wrong/hallucinated) [1][2]. **Truthfulness (auto) = accuracy% − hallucination%** [1].

Two-step grading: **exact string match first; if no match, LLM-as-judge** [1]. Two judges to avoid self-preference bias: `gpt-3.5-turbo-0125` and `llama-3-70B-instruct`; judge outputs JSON with an `"Accuracy": "True"/"False"` field; **false-premise questions require the model to output exactly `"invalid question"`** to be scored accurate [1]. Judge F1 vs human eval: 94.7% (ChatGPT), 98.9% (Llama 3) [1]. Hybrid = "rule-based matching and LLM assessment" [2].

**Constraint note:** porting the LLM-judge requires a judge model; the paper recommends rule-based-only as the primary paired-comparison metric to avoid judge variance (and our P3 forbids any relaxation). Plan: implement the exact-match path + the `"invalid question"` rule faithfully; use an LLM judge only if needed and report rule-based as primary.

## 4. Baselines (pin — public test set)

LLM-only [1]: GPT-4 Turbo **33.5% acc / 13.5% halluc / 53.0% missing** (truthfulness 20.0%); Llama-3-70B 32.3% / 28.9% / 38.8%.

Straightforward RAG, web+KG 50 pages [1]: GPT-4 Turbo **43.6% acc / 30.1% halluc / 26.3% missing** (truthfulness 13.4%); Llama-3-70B 40.6% / 31.6% / 27.8%. "Adding RAG in a straightforward manner improves accuracy only to 44%."

SOTA industry (human eval) [1]: Copilot Pro 50.6% truthfulness / 17.9% halluc; Gemini Advanced 49.3%; "SOTA RAG only answers 63% without hallucination." These are aggregate, not Finance-specific; Finance is among the hardest domains (<20% on real-time/fast-changing) [1].

**H1 verdict (headroom):** SUPPORTED by literature before we run anything — cold arms sit at ~33% (LLM-only) to ~44% (RAG) accuracy with 14–30% hallucination, far below ceiling. This is the opposite of FinChain saturation. So the precondition gate is very likely to pass; the experiment's risk is **not** headroom (H1) but the substrate learning loop (H0/H2).

## 5. Bottom line for the experiment

- **H1 (headroom): PASS (literature).** CRAG-Finance has large, durable headroom; the cold arm will not saturate.
- **H0 (substrate readiness): AT RISK for the dominant shape.** 56% of Finance is 2-call same-category chains that collapse under the category-only signature → single literal-clone helper (P1 landmine). The learned arm can only honestly add value via either (a) a **generic finer-intent-signature fix** (distinguish dependent-chain from fan-out; refuse literal-clone authoring on tool-only 2-call trajectories — the kb/br/17 recommendation), proven non-regressing on SkillCraft (P2); and/or (b) **focusing the learned arm on the composable ~34%** (comparison/multi-hop/aggregation/set) where the substrate's existing fan-out/record render shapes apply and the cold arm genuinely struggles (<20%).
- **Modeling fork: resolve to hybrid `df.db` (entity/ticker corpus) + `df.tool` (metric APIs)**, reconciling the goal text and `kb/br/16`; this maximizes the chance a question lands on a substrate-handled mixed shape.

## Sources

- [1] Yang et al. (2024). "CRAG — Comprehensive RAG Benchmark." arXiv:2406.04744 (HTML v2). https://arxiv.org/html/2406.04744v2
- [2] facebookresearch/CRAG repo (README, `local_evaluation.py`, `mock_api/`, `docs/dataset.md`). CC BY-NC 4.0. https://github.com/facebookresearch/CRAG
- [3] CRAG dataset/API overview (mock finance APIs, entity-match→API-select flow). https://www.aicrowd.com/challenges/meta-comprehensive-rag-benchmark-kdd-cup-2024
- [4] Ouyang et al. (2024). "Revisiting the Solution of Meta KDD Cup 2024: CRAG" (winning-solution API-use description). https://arxiv.org/html/2409.15337v1
