---
title: "Skill-Library Value Claims: The Adversarial Baseline Ladder and Paired-Evaluation Methodology"
date: 2026-06-01
mode: ultradeep
sources: 33
status: complete
---

# Skill-Library Value Claims: The Adversarial Baseline Ladder and Paired-Evaluation Methodology

## Executive Summary

The honest bar for a datafetch value claim is **not** "no tools" and it is **not** "no library". It is **a tool-matched agent that writes its own helper inline on every question with no persistence** — and the 2025-2026 literature now contains the single most important data point for us: that bar is the one almost everybody else *avoids testing*, and the two recent benchmarks that *do* test it (SkillsBench, arXiv 2602.12670; SkillFlow, arXiv 2604.17308) both find that **one-shot self-generated skills give roughly zero gain on a frontier model** — SkillsBench reports a mean **-1.8pp** for self-generated skills vs no-skill across 7 configurations, and SkillFlow reports **exactly 0.00pp** for Claude Sonnet 4.6 and *negative* deltas for 5 of 11 models. This is a near-verbatim restatement of our own jsonplaceholder finding and the CRAG shape-probe finding in [`17-crag-shape-probe-findings.md`](17-crag-shape-probe-findings.md), where an auto-crystallised helper was a literal data-shape clone that returned a silently-wrong answer on a sibling query. The classic skill-library wins everyone cites (Voyager, AWM +51% relative on WebArena, SkillWeaver +31.8%, ICAL +58.7%) were all measured against a **no-library / from-scratch** baseline — *none* of them ran the inline-rewrite-no-persistence arm. That omission is precisely the gap we can claim, and precisely the bar we must clear.

The consequence for the paper is structural: a single-session correctness lift over inline-rewrite on a frontier model is **not** a defensible value story, because the frontier literature predicts it will be ~0. Value for a governed, learned library lives in three places the inline baseline structurally cannot reach, and the paper must measure each as a *separate* endpoint: **(i) amortisation** — cost/latency/token reduction at equal-or-better correctness as reuse density rises (SkillCraft already showed -41% tokens at neutral correctness; this is the live edge); **(ii) cross-session / cross-tenant persistence** — SkillFlow's "history-injection" control (raw prior context, no skill abstraction) reached only 51.04% vs skills-evolve 71.08% on Opus 4.6, so the gain is *not* explained by longer context, which is the cleanest published evidence that persistence-as-abstraction beats persistence-as-transcript; and **(iii) governance** — SkillsBench, SkillFlow, SkillGenBench and Skill Shadowing all show that *ungoverned* self-generated skills actively regress (negative transfer, error propagation, library shadowing), so a quarantine/replay-validation contract that prevents the silent-wrong-answer landmine is itself a measurable, publishable effect via an ablation-without-governance arm.

The recommended value-defining ladder is five arms: (0) no-tools floor, (1) **inline-rewrite, tool-matched, no persistence** — the adversarial bar, (2) datafetch governed library — the treatment, (3) ablation-without-governance, (4) frozen-library-replay vs inline to isolate amortisation from mere artifact-presence; with an optional (5) curated/human-skill ceiling (SkillsBench's curated arm lifts +16.2pp, locating where the real headroom is). For the statistics: a paired **McNemar** design needs ~**236 paired questions** to detect a 10pp delta at 80% power (vs ~3,900 for an unpaired test), so CRAG's 2,706 public questions are well-powered for correctness *if* a correctness delta exists; report **rule-based exact-match as the primary lower bound** and judge-augmented as an upper bound with Cohen's κ ≥ 0.80; run **k≥5 seeds** with arms interleaved in one session against pinned dated model snapshots to separate substrate effect from the documented ±15pp API-stochastic noise floor; pre-register the overall test as the single confirmatory endpoint and apply **Benjamini-Hochberg FDR** to all head/torso/tail and question-type slices. Bottom line, stated precisely at the end of this document: *to claim genuine value, datafetch must beat a tool-matched inline-rewrite-no-persistence baseline — on amortised cost at neutral-or-better correctness, on cross-session persistence, and on governance-prevented regressions — across ≥236 paired CRAG questions under McNemar with k≥5 seeds; the literature shows this is achievable for **governed, verified, amortised** libraries and shows it is **not** achievable for one-shot self-generated skills on a frontier model, which is exactly why the baseline choice is the crux.*

## Overview

This document answers two questions the team posed for a datafetch proof-of-value paper. **Deliverable A**: what baseline must we beat for a skill-library value claim to be genuine and reviewer-proof, derived from what the actual skill-induction literature compared against. **Deliverable B**: the statistical methodology for the paired evaluation. It builds on the benchmark survey already scouted ([`16-substrate-benchmark-scouting.md`](16-substrate-benchmark-scouting.md), [`16-post-skillcraft-benchmark-selection.md`](16-post-skillcraft-benchmark-selection.md)) — which recommends CRAG (Meta KDD Cup 2024, arXiv 2406.04744) as the primary corpus and τ³-bench as a companion — and on the empirical CRAG shape-probe in [`17-crag-shape-probe-findings.md`](17-crag-shape-probe-findings.md). It does not re-survey benchmarks; it goes deep on baselines and methodology.

The core worry, restated: in the jsonplaceholder experiment our auto-crystallised helpers were *thinner and weaker* than the model rewriting an inline 5-line helper each time. So the adversarial baseline is "the model writes its own helper inline on every question, with no persistence". If our library cannot beat that, the value story collapses *unless* the value lives in amortisation, cross-session persistence, or governance. The literature confirms this worry is well-founded and tells us exactly where to stand.

A caveat on provenance: several of the most decision-relevant papers (SkillFlow 2604.17308, SkillsBench 2602.12670, SkillGenBench 2605.18693, SkillLearnBench 2604.20087, Skill Shadowing 2605.24050, CoEvoSkills 2604.01687, ReliabilityBench 2601.06112) postdate the assistant's January 2026 training cutoff and were verified live by web-search research agents on 2026-06-01. Their existence and headline numbers are reported as the agents found them; treat the exact per-model figures as **agent-verified, not author-verified**, and re-confirm the load-bearing ones against the PDFs before the paper cites them. The pre-2026 systems (Voyager, AWM, SkillWeaver, ICAL, ExpeL, CodeAct, LILO, ReGAL, CRAFT, TroVE) are author-confirmed.

## Deliverable A: The Baseline Question

### A.1 What each system actually beat, and against which baseline-type

The pattern across a decade of skill/tool-library work is stark once you sort by *baseline type*. The overwhelming majority of the famous wins are measured against a **no-library / from-scratch** agent, and a smaller set of program-induction papers compare against **per-instance code generation** (which is the closest published analog to "inline rewrite, no persistence"). The systems that win biggest are exactly the ones with the weakest baselines.

| System | arXiv | Benchmark | Baseline (type) | Effect size (metric) | Inline-no-persist arm? |
|---|---|---|---|---|---|
| Voyager | 2305.16291 | Minecraft | AutoGPT / ReAct / Reflexion (no-library) + w/o-skill-library ablation | 3.3× unique items; up to 15.3× faster tech-tree; w/o-skill-library *plateaus* (no exact Δ in text) | No (ablation ≈ regenerate-each-episode, but no % reported) |
| Code-as-Policies | 2209.07753 | Tabletop / HumanEval | CLIPort, NL-Planner (no-library) | 71.0% vs 0.7% (unseen attrs); HumanEval +3.8pp | N/A (episode-level, no library) |
| CodeAct | 2402.01030 | M3ToolEval / API-Bank | text-actions / JSON-actions (action-format, no persistence) | **+20.7pp** abs (74.4 vs 53.7, GPT-4); JSON *beats* CodeAct on API-Bank (82.0 vs 75.4) | Partial — code-vs-text *actions*, both per-episode |
| LILO | 2310.19791 | REGEX/CLEVR/LOGO | DreamCoder; **LLM-Solver (no library)** | LOGO +16.8pp vs no-library; **REGEX +0.47pp (≈0)** | **Yes** — LLM-Solver is per-task, no library |
| ReGAL | 2401.16467 | LOGO/Date/MATH/TabMWP | **Primitive-Programs (inline, no abstraction)** | Date +26.1pp; LOGO +11.5pp; **TabMWP -1.2pp (regress)**; MATH -0.9pp on Lemur-70B | **Yes** — exact inline-no-persistence analog |
| CRAFT | 2309.17428 | VQA/TabMWP/MATH | **Vanilla per-instance codegen**; retrieval-only | VQA +43% rel F1; **TabMWP below BM25 (88.4 vs 89.2)** | **Yes** — Vanilla = inline per-instance |
| TroVE | 2401.12869 | 11 datasets | **Primitive; Instance (fresh tool/episode)** | wins/ties all 11; Instance *underperforms* Primitive on GQA (0.16 vs 0.37) | **Yes** — Instance = inline per-episode |
| AWM | 2409.07429 | WebArena / Mind2Web | BrowserGym (no-memory) | **+51.1% rel** (35.5 vs 23.5); Mind2Web +24.6% rel | **No** |
| SkillWeaver | 2504.07079 | WebArena | GPT-4o **no-skill** | **+31.8% rel** (29.8 vs 22.6); GPT-4o-mini +53% rel; transfer +54.3% | **No** |
| ICAL | 2406.14596 | VisualWebArena / TEACh | no-abstraction; HELPER | +58.7% rel (22.7 vs 14.3); Qwen +182.7% rel; TEACh +17.5pp GC | **No** |
| ExpeL | 2308.10144 | ALFWorld/HotpotQA | ReAct; **Reflexion (intra-task, non-persistent)** | ALFWorld 59.0 vs 40.0; matches Reflexion-R3 at R0 | **Partial** — vs Reflexion isolates *cross-task* persistence |
| AutoGuide | 2403.08978 | ALFWorld/WebShop/WebArena-Reddit | ReAct; k=0 ablation | ALFWorld 79.1 vs 54.5 | Partial — k=0 = no-memory |
| ASI | 2504.06821 | WebArena | static no-skill; **text-skill** | +23.5% rel vs static; **+11.3% rel vs text-skill**; 10.7-15.3% fewer steps | No (text-skill is closest) |
| ReasoningBank | 2509.25140 | WebArena | **No-Memory** | +8.3/+7.2/+4.6 abs across 3 backbones | Partial — No-Memory, not inline |
| SkillFlow | 2604.17308 | SkillFlow (166 tasks) | vanilla; **history-injection (raw context)** | Opus 4.6 +8.43pp; **Sonnet 4.6 0.00pp; GPT-5.3-Codex -6.02pp**; 5/11 ≤0 | **Yes** — history-injection ≈ persistence-without-abstraction |
| SkillsBench | 2602.12670 | 86 tasks ×11 domains | no-skill; **self-generated (inline one-shot)** | curated **+16.2pp**; **self-generated -1.8pp mean** (only Opus 4.6 +2.0) | **Yes, directly** — self-gen = inline-and-discard |
| SkillGenBench | 2605.18693 | 187 tasks | no-skill floor | multiple methods **below** floor (-6.5 to -7.3pp); "negative transfer" | **Yes** |
| Skill Shadowing | 2605.24050 | (library-size study) | oracle-subset | **-21pp at 202 skills**; shadowing = 68% of degradation | n/a (size study) |
| CoEvoSkills | 2604.01687 | (skill-gen) | self-gen baseline ~32% | **71.1% after verified rounds 3-5** | Yes — flips the loss to a win via verification |

Three readings of this table are load-bearing for our paper.

**First, the famous web-agent wins all used the weak baseline.** AWM (+51%), SkillWeaver (+31.8%), ICAL (+58.7%), ReasoningBank (+20%) every one compares "agent with the library" against "agent with *nothing*". None constructs a tool-matched agent that writes its own reusable helper inline each episode and then throws it away. A reviewer who asks "is the gain from the *library* or just from *having reusable code at all*?" is unanswered by any of these papers. **This is the single cleanest gap we can claim**: we will be among the first skill-memory papers to run the inline-rewrite arm and attribute the residual to persistence and governance rather than to code-presence.

**Second, the program-induction papers that *did* run the inline arm show the gain is real but narrow and sometimes negative.** LILO beats no-library by +16.8pp on LOGO but only **+0.47pp on REGEX** the per-episode LLM is nearly as good when the task is cheap to derive inline. ReGAL *regresses* on TabMWP (-1.2pp) and on Lemur-70B/MATH. CRAFT falls *below* retrieval-only on TabMWP. TroVE's per-episode "Instance" arm underperforms even the no-tool "Primitive" arm on GQA. The lesson is identical to our jsonplaceholder finding: **when the structure is cheap to re-derive inline, a persistent library does not help and a badly-scoped one hurts.** Our own CRAG probe ([`17`](17-crag-shape-probe-findings.md)) is the same phenomenon at the substrate level — the auto-authored `toolFanout` helper is a frozen data-shape clone that returns a wrong answer on a sibling.

**Third, the 2026 frontier benchmarks that test self-generation directly confirm the null and locate the win.** SkillsBench (7,308 trajectories) is the decisive citation: curated skills lift **+16.2pp** average while self-generated one-shot skills land **-1.8pp** — a regression. SkillFlow shows the same with a lifelong-learning twist: Claude Sonnet 4.6, our own primary model, lands *exactly 0.00pp*, and 5 of 11 models flatline or regress; the failure is not skill-*writing* but skill-*repair*. CoEvoSkills shows the flip condition: the same ~32% self-gen baseline reaches **71.1%** once a co-evolving *verifier* gates which skills enter the library. The win is conditional on governance, not on generation.

### A.2 Did anyone run our exact adversarial baseline?

**The famous web-agent skill-memory papers (AWM, SkillWeaver, ICAL, ReasoningBank, ASI): no.** They run no-library/no-memory baselines only. ASI comes closest by comparing program-skills against a *text-skill* counterpart (+11.3% rel), which isolates the *executability* of the skill but not its *persistence*.

**The program-induction lineage (LILO, ReGAL, CRAFT, TroVE): yes, and this is where to anchor methodology.** ReGAL's "Primitive Programs", CRAFT's "Vanilla", and TroVE's "Instance" arms are all "the model writes its own code per query with no cross-episode reuse". Their results are mixed-to-negative on cheap-to-derive tasks and positive on compositional tasks — exactly the regime distinction we need.

**The 2026 skill benchmarks (SkillsBench, SkillFlow, SkillGenBench): yes, directly, and they report the null/negative.** SkillsBench's "self-generated" condition is one-shot inline pre-task generation with no persistence — its -1.8pp mean is the most direct published refutation of naive self-crystallisation. SkillFlow's "history-injection" control (prepend raw prior trajectories, no abstraction) reaching only 51.04% vs 71.08% skills-evolve on Opus 4.6 is the most direct published evidence that *abstraction-as-persistence* beats *transcript-as-persistence*.

**The gap we can claim, precisely:** no skill-memory paper has run a *tool-matched inline-rewrite-no-persistence baseline against a governed, replay-validated, cross-session library* and decomposed the gain into amortisation, persistence, and governance components. SkillsBench gets the baseline right but tests *general* agent skills with no governance contract; SkillFlow gets lifelong dynamics right but no quarantine/rollback. datafetch's governed `df.lib` with replay-validation and quarantine is the missing arm.

### A.3 When skill memory wins, and when it shows no gain or regresses

**Won when:** (1) the structure is *expensive to re-derive inline but cheap to call* — compositional/long-horizon tasks (Voyager tech-tree, LOGO graphics, 3-hop KG traversal), not symbolic formulas a model re-derives in tokens; (2) *reuse density is high* — many siblings per crystallised shape, so creation cost amortises (the entire amortisation thesis); (3) *persistence is across episodes/sessions* — ExpeL beats stateless Reflexion specifically on cross-task insight, SkillFlow's abstraction beats raw history; (4) *weaker models* benefit most — SkillWeaver GPT-4o-mini +53% rel vs GPT-4o +31.8%, ICAL Qwen +182.7% vs GPT-4V +58.7%, cross-model transfer +54.3%; (5) *a verifier gates the library* — CoEvoSkills 32%→71.1%, curated skills +16.2pp.

**No gain / regressed when:** (1) the task is *cheap to derive inline* — LILO REGEX +0.47pp, FinChain symbolic formulas (our [`16`](16-post-skillcraft-benchmark-selection.md) Criterion-3 analysis); (2) *self-generated, one-shot, ungoverned* — SkillsBench -1.8pp, SkillFlow Sonnet 4.6 0.00pp; (3) *the model is already strong* — SkillFlow's frontier models show the smallest or negative deltas (GPT-5.3-Codex -6.02pp), which is exactly the Sonnet-4.6-correctness-saturation problem SkillCraft hit ([`16`](16-post-skillcraft-benchmark-selection.md)); (4) *the library is large and indiscriminate* — Skill Shadowing -21pp at 202 skills from wrong-selection, not context overhead; (5) *no repair mechanism* — SkillFlow's central finding is "the model gap lies in repairing bad skills, not in writing skills"; bad skills propagate errors across an entire task family; (6) *the helper is a frozen clone* — our own CRAG probe, the silent-wrong-answer landmine.

The regime that matters for us: **frontier model + correctness metric + low reuse density → expect ~0.** That is the SkillFlow-Sonnet-4.6 cell and the SkillCraft NEUTRAL cell. Any honest paper must either move off that cell (weaker model, or amortisation/cost endpoint, or high-reuse-density corpus) or accept a null correctness result and make the value case elsewhere.

### A.4 The recommended value-defining baseline ladder

Five arms, each isolating one alternative explanation for a gain. Run them paired, on the same questions, same model snapshot, interleaved.

**Arm 0 — No-tools floor.** Agent answers from parametric knowledge + reasoning only. Establishes the corpus is non-trivial and that tools matter at all. Sanity check, not the value bar.

**Arm 1 — Inline-rewrite, tool-matched, no persistence (THE adversarial baseline).** Identical tool exposure to the treatment (same `df.tool.*`/`df.db.*` primitives), identical prompt *modulo* the library block, but the agent must write any helper inline each question and the workspace is wiped between questions. This is the strongest-engineered version of "the model rewrites its own 5-line helper each time". The value claim is defined relative to *this* arm, not Arm 0. The literature (SkillsBench, SkillFlow, ReGAL, CRAFT) predicts the treatment will tie or lose to Arm 1 on single-session frontier-model correctness — so beating it on correctness would be a genuinely novel positive; tying it on correctness while winning on cost/persistence/governance is the realistic and still-publishable result.

**Arm 2 — datafetch governed library (treatment).** Full `df.lib` with observer crystallisation, replay-validation, quarantine/rollback, cross-session persistence.

**Arm 3 — Ablation-without-governance.** Treatment with replay-validation and quarantine *disabled* — helpers crystallise and are reused without the safety gate. Isolates the governance contribution. The literature predicts this arm *regresses below Arm 1* via the silent-wrong-answer landmine (CRAG probe) and negative transfer (SkillGenBench), which would make governance a *measurable positive* — possibly the cleanest correctness win available, because it shows up as *avoided hallucinations* on CRAG's -1-scored cells.

**Arm 4 — Frozen-library replay (amortisation/persistence isolator).** Take the crystallised library from Arm 2, freeze it, and run it (a) within a single session and (b) across sessions, comparing against Arm 1. Because Arm 1 *also* has reusable code within a session (it just rewrites it), the contrast between Arm 4 and Arm 1 isolates *persistence and amortisation* from *mere artifact presence* — the decomposition no prior paper has published.

**Arm 5 (optional ceiling) — Curated/human-written library.** A small hand-written `df.lib` of the same shapes. SkillsBench shows this is where the real headroom is (+16.2pp). Reporting the gap between Arm 2 (auto-crystallised) and Arm 5 (curated) honestly bounds how much of the curated ceiling our observer captures, and pre-empts the reviewer question "why not just write the skills by hand?"

The defensible claim structure: **beating Arm 1 on at least one pre-registered endpoint (cost-at-equal-correctness, cross-session persistence, or governance-prevented regression) while not regressing on correctness, with Arm 3 showing governance is load-bearing and Arm 4 showing persistence (not artifact-presence) is the source.** Beating Arm 0 alone is not a value claim. Beating Arm 1 on single-session frontier correctness would be a bonus the literature says is unlikely.

## Deliverable B: Statistical Methodology

### B.1 Power and sample size — paired McNemar

The design is paired: the same question runs through both arms, so the correct test is **McNemar's test** on discordant pairs, not a two-proportion z-test. Concordant pairs (both arms right, or both wrong) carry zero information about the differential effect; McNemar conditions on the discordant pairs only. With `p10 = P(baseline right, library wrong)`, `p01 = P(baseline wrong, library right)`, discordant rate `p_d = p10 + p01`, and effect `δ = p01 - p10` (the marginal pass-rate difference), Connor's (1987, *Biometrics* 43:207, DOI 10.2307/2531961) asymptotic sample size at α=0.05 two-sided, power 0.80 is:

```
n = (z_{1-α/2} + z_{1-β})^2 · p_d / δ^2  =  7.849 · p_d / δ^2
```

Two drivers: a larger discordant rate `p_d` means more informative pairs (but more total samples needed to accumulate a given δ signal), and δ² in the denominator means small effects cost quadratically. Worked table (n = paired questions):

| δ (pp) | p_d=0.20 | p_d=0.30 | p_d=0.40 | p_d=0.50 |
|---|---|---|---|---|
| 5pp | 628 | 942 | 1,256 | 1,570 |
| 10pp | 157 | 236 | 314 | 393 |
| 15pp | 70 | 105 | 140 | 175 |
| 20pp | 39 | 59 | 79 | 98 |

For CRAG's 2,706 public questions (or 4,409 full set), a **10pp delta is well-powered at any plausible discordance** (~236 at p_d=0.30); a **5pp delta needs the full subset** (~942 at p_d=0.30). The paired design's efficiency is the headline: detecting δ=10pp at p_d=0.30 needs ~236 paired questions vs ~3,886 total for an unpaired two-proportion z-test at the same marginal rates — a ~6.8× reduction, because the within-pair correlation (same question, same difficulty) is differenced out.

Two practical cautions. **Estimate p_d from a pilot** — underestimating discordance undershoots n; if the two arms agree on most questions (high concordance, which is *likely* given the SkillFlow/SkillsBench prediction of ~0 correctness delta), the realised discordant count `b+c` can be small even at n=500. **When `b+c < 25`, use the mid-p McNemar** (Fagerland, Lydersen, Laake 2013, DOI 10.1186/1471-2288-13-91) rather than the χ² approximation; the exact conditional binomial is valid but conservative (structurally cannot reach significance when `b+c < 6`). **Always report the realised `b`, `c`, `b+c`** in the paper — a near-zero correctness delta will manifest as a small discordant count, and that itself is the finding.

Because the literature predicts the correctness delta on a frontier model is ~0, **do not stake the paper on the correctness McNemar alone**. Pre-register a *cost/efficiency* primary endpoint (paired difference in tokens or wall-clock at matched correctness; SkillCraft already showed -41% tokens at neutral correctness) using a paired test on a continuous outcome (Wilcoxon signed-rank), and treat correctness McNemar as a co-primary or secondary. This matches where the value actually is.

### B.2 Run-to-run variance — the dominant nuisance

Our prior runs found "model/API health is the dominant variable", and the literature agrees emphatically. Setting temperature=0 does **not** give determinism: Atil et al. (arXiv 2408.04667) document accuracy swings up to **15pp** across identical runs and best-vs-worst gaps to 70pp, driven by API-level batching, prefix caching, and floating-point non-associativity, not weights; a 2026 follow-up (arXiv 2601.19934, agent-verified) reports larger models are *more* variable (a 120B model gave identical output in only 12.5% of runs). The differential we are chasing (≤10pp) is *inside* the documented single-arm noise band, so variance control is not optional.

Adopt τ-bench's reliability framing (Yao et al., arXiv 2406.12045, ICLR 2025). **pass^k** (note the superscript) = probability that *all* k independent trials succeed = p^k under independence; it decays exponentially (p=0.9 → pass^8=43%) and is the right *reliability* metric, distinct from the optimistic **pass@k** (at least one of k succeeds). τ-bench shows GPT-4o dropping from <50% pass^1 to <25% pass^8 in retail — that 25pp gap is pure stochasticity and must be partitioned away from the treatment effect.

Protocol: **k≥5 seeds per arm per question as a floor, k=8 to match τ-bench reporting.** **Interleave arms within one calendar session** — never all-baseline-then-all-treatment, which lets temporal model drift masquerade as effect. **Pin dated model snapshots** (e.g. `claude-sonnet-4-6-20260601`), never rolling aliases, and log the returned model version from every response. **Measure the noise floor explicitly**: run the same question twice under the *same* arm; the same-arm disagreement rate is the null variance, and the inter-arm signal must materially exceed it. Report `pass@1 mean ± std (k seeds)`, `pass^k`, and the within-arm noise floor in every table. Aggregate the k seeds to a per-question label by majority vote before building the McNemar 2×2.

### B.3 LLM-as-judge variance — report two bounds

CRAG (arXiv 2406.04744) scores each answer into four bins — Perfect (+1), Acceptable (+0.5), Missing (0), Incorrect/Hallucinated (-1) — and reports **Accuracy** (fraction scoring ≥0.5), **Hallucination Rate** (fraction at -1), and **Truthfulness = Accuracy − Hallucination**. The -1 penalty means abstention (Missing, 0) is strictly safer than a confident wrong answer, which is exactly the property that makes our *governance* arm visible: a quarantined helper that declines beats an un-governed helper that confidently returns the frozen-clone wrong answer.

Report **two bounds in every results table.** Primary lower bound: **rule-based exact-match counting only Perfect** — zero judge variance, fully reproducible. Upper bound: **judge-augmented counting Perfect+Acceptable** — alongside judge reliability stats. The gap between bounds is the judge's contribution; when it exceeds ~5pp, adjudicate a stratified sample of 50-100 disputed items against human labels.

Quantify and mitigate judge bias. Use **two judges from different provider families**, randomize answer-presentation order per call (position bias; Zheng et al. arXiv 2306.05685 showed GPT-4 verdicts flip on swap), and use reference-guided grading (give the judge the CRAG gold answer) to suppress verbosity and self-enhancement bias. Report **Cohen's weighted κ between judges** against a ≥200-item human-labeled set: κ≥0.80 good, κ≥0.60 acceptable; below 0.60, fall back to rule-based only or add a third adjudicating judge. Report the **hallucination-class F1 separately** — it is the highest-stakes call and the one our governance arm most directly affects.

### B.4 Multiple comparisons — one confirmatory endpoint, FDR on the rest

CRAG slices richly: 5 domains × 3 popularity tiers (head/torso/tail, ~661/658/665) × 4 dynamism levels × 8 question types = 100+ potential slice tests. Nine simultaneous McNemar tests inflate family-wise error to ~37% uncorrected.

**Pre-register exactly one confirmatory primary endpoint** before any run — the overall paired test (correctness McNemar and/or the cost endpoint of B.1) at uncorrected α=0.05. All "library significantly beats baseline" claims rest on this. Pre-registration (OSF or equivalent; arXiv 2302.10086 on NLP pre-registration) prevents HARKing across the slice space. **Label every per-slice test exploratory** and apply **Benjamini-Hochberg FDR at q=0.05** — not Bonferroni, because CRAG slices are positively correlated (same-domain questions share retrieval characteristics), making Bonferroni (which would demand p<0.0056 at m=9) excessively conservative and BH the correct, more-powerful choice for positively-correlated tests. Rule of thumb: <3 secondary tests → Bonferroni; 3-20 → BH-FDR; >20 → BH-FDR plus per-test power check. The head/torso/tail decomposition is the most scientifically interesting slice (it tests the tail-entity hypothesis where retrieval/persistence should help most), so call it out as the *primary exploratory* axis but still correct it.

### B.5 Confound taxonomy and the controls that isolate the library

The causal claim "the library caused the gain" is invalidated by six principal confounds. Each maps to a specific arm or control already in the ladder (§A.4).

| Confound | Mechanism | Control / arm |
|---|---|---|
| Unmatched tool exposure | Treatment has tools the baseline lacks; gain is tool access, not library | **Arm 1 tool-matched**: identical `df.tool.*`/`df.db.*` to treatment, no library block |
| Prompt non-parity | Treatment prompt is richer independent of the library | Blind-diff both system prompts; difference must be *only* the library block at a fixed token budget |
| Online-learning leakage | Library updates during eval; early questions shape late ones | **Arm 4 frozen-library replay**: freeze snapshot before eval; randomize order; interleave arms |
| Model / version drift | Arms run at different times / rolling aliases | Pinned dated snapshots; both arms same session; verify returned version per response |
| Train/test contamination | Library built on test-split patterns → lookup table | n-gram overlap audit (arXiv 2310.18018) between library content and CRAG test set; report contamination rate; build library only on held-out splits |
| Retrieval/context budget disparity | Treatment uses more tokens/passages/calls | Budget-matched baseline; vary Arm 1 token budget and plot accuracy vs budget; treatment must beat the budget-matched point (context length alone can *hurt*, arXiv 2510.05381) |

Second-order controls: randomize judge presentation order across arms (B.3); make Arm 1 the *strongest-engineered* inline agent (equal engineering effort — a weak baseline is the most common way skill-memory papers inflate effect size); pre-commit all prompts for both arms in the pre-registration. The **ablation battery in order**: (1) Arm 2 vs Arm 1 primary; (2) tool-matched (confound 1); (3) frozen-replay (confound 3); (4) budget-matched (confound 6); (5) **ablation-without-governance = Arm 3** (does skill *semantics+governance* or mere tool availability drive the gain); (6) shuffled-order replay (order-independence). A residual gap surviving (2)-(6) under McNemar is strong evidence the library itself is causal.

## Integration Analysis

**What to extract.** The five-arm ladder and the six-confound control table are directly portable into the CRAG harness the team is already building. The single highest-value change versus a naive plan: **add Arm 1 (tool-matched inline-rewrite) and Arm 3 (no-governance) as first-class arms**, because they are the two arms that convert an expected-null correctness result into a publishable positive (governance-prevented hallucinations) and pre-empt the two killer reviewer questions ("is it just tool access?" and "is it just having reusable code?").

**Bootstrap path.** (1) Resolve the [`17`](17-crag-shape-probe-findings.md) substrate blockers first — the `FANOUT(tool)` signature collapse and the data-shape-clone fallback — because Arm 2 cannot honestly run while every CRAG helper is a frozen clone; the recommended `df.db.*` remapping is the cheaper fix. (2) Implement CRAG's tri-state +1/0/-1 grader with rule-based exact-match as primary and a two-judge augmented upper bound. (3) Build the paired runner with k≥5 seeds, interleaved arms, pinned snapshots, per-response version logging. (4) Pilot ~100 questions to estimate `p_d`, then size to the §B.1 table. (5) Pre-register the cost-at-equal-correctness primary endpoint plus correctness co-primary on OSF before the full run.

**Effort estimate.** Substrate fixes from [`17`](17): Medium-to-Large (the signature/remap work). Harness + paired runner + grader: Medium. Stats + pre-registration + analysis: Short. The dominant cost and risk is the substrate fix, not the methodology.

## Key Takeaways

1. **The adversarial baseline is tool-matched inline-rewrite-with-no-persistence (Arm 1), not no-tools.** Every famous skill-memory win (AWM, SkillWeaver, ICAL, ReasoningBank) used a no-library baseline and *never ran this arm* — that omission is the gap we claim, and clearing it is the bar. The literature (SkillsBench -1.8pp, SkillFlow Sonnet-4.6 0.00pp, ReGAL/CRAFT regressions) predicts a frontier-model single-session *correctness* tie-or-loss against Arm 1, so the value claim must rest on amortisation, cross-session persistence, and governance — not raw correctness.

2. **Governance is the most likely correctness win, via avoided hallucinations.** Ungoverned self-generated skills regress (SkillsBench, SkillGenBench negative transfer, our CRAG silent-wrong-answer probe). On CRAG's -1-scored hallucination cells, a quarantine/replay-validation contract that declines instead of confidently-wrong should produce a *measurable Truthfulness gain* that Arm 3 (no-governance) lacks. Make this a pre-registered endpoint.

3. **Persistence-as-abstraction beats persistence-as-transcript, and Arm 4 proves it.** SkillFlow's history-injection control (51.04% vs 71.08% skills-evolve on Opus 4.6) is the published evidence; our frozen-library-replay-vs-inline contrast (Arm 4 vs Arm 1) is the decomposition no prior paper has reported — it isolates amortisation from mere artifact presence.

4. **The statistics are tractable and the corpus is sized.** Paired McNemar needs ~236 questions for a 10pp delta (CRAG's 2,706 are ample); report rule-based exact-match as primary lower bound, k≥5 interleaved seeds against pinned snapshots to beat the ±15pp API noise floor, one pre-registered confirmatory endpoint, and BH-FDR across head/torso/tail and question-type slices. Expect a small discordant count on correctness — report `b,c,b+c` honestly; the null is itself a finding that motivates the cost/persistence/governance endpoints.

5. **Bottom line.** *To claim genuine value, datafetch must beat a tool-matched inline-rewrite-no-persistence baseline (Arm 1) — on amortised cost at neutral-or-better correctness, on cross-session persistence (Arm 4), and on governance-prevented regressions (Arm 3) — across ≥236 paired CRAG questions under McNemar with k≥5 interleaved seeds and the six confound controls. The literature shows this is achievable for **governed, verified, amortised** libraries (curated +16.2pp; CoEvoSkills 32%→71.1% with a verifier; AWM/SkillWeaver/ICAL on weak baselines) and shows it is **not** achievable for one-shot self-generated skills on a frontier model (SkillsBench -1.8pp; SkillFlow Sonnet-4.6 0.00pp). The baseline choice is the crux precisely because the value lives entirely in the governance-and-amortisation gap that separates those two outcomes.*

## Sources

Skill/tool-library systems (author-verified, pre-2026):
- Voyager — arXiv 2305.16291 (Wang et al. 2023). Minecraft lifelong skill library; w/o-skill-library ablation plateaus.
- Code-as-Policies — arXiv 2209.07753 (Liang et al. 2022). Episode-level code generation; no persistent library.
- CodeAct — arXiv 2402.01030 (Wang et al. 2024). Code vs text/JSON actions; +20.7pp M3ToolEval (GPT-4), JSON beats it on API-Bank.
- LILO — arXiv 2310.19791 (Grand et al. 2023). LLM-Solver (no-library) arm; REGEX +0.47pp, LOGO +16.8pp.
- ReGAL — arXiv 2401.16467 (Stengel-Eskin et al. 2024). Primitive-Programs (inline) arm; TabMWP -1.2pp regression.
- CRAFT — arXiv 2309.17428 (Yuan et al. 2023). Vanilla per-instance arm; below BM25 on TabMWP.
- TroVE — arXiv 2401.12869 (Shi et al. 2024). Primitive + Instance (per-episode) arms; Instance < Primitive on GQA.
- AWM — arXiv 2409.07429 (Wang, Mao, Fried, Neubig 2024). WebArena +51.1% rel; no inline arm.
- SkillWeaver — arXiv 2504.07079 (Zheng et al. 2025). WebArena +31.8% rel; GPT-4o-mini +53%; transfer +54.3%.
- ICAL — arXiv 2406.14596 (Sarch et al. 2024/2025). VisualWebArena +58.7% rel; Qwen +182.7%.
- ExpeL — arXiv 2308.10144 (Zhao et al. 2023). Cross-task persistence vs stateless Reflexion.
- AutoGuide — arXiv 2403.08978 (Fu, Kim et al. 2024, NeurIPS 2024). Conditional guidelines; k=0 ablation.
- ASI (Agent Skill Induction) — arXiv 2504.06821. Program-skills vs text-skill (+11.3% rel) vs static (+23.5% rel).
- ReasoningBank — arXiv 2509.25140 (Google Cloud AI 2025). No-Memory baseline; +4.6-8.3pp across backbones.

Skill/tool-library systems (agent-verified live 2026-06-01, postdate training cutoff — re-confirm before citing):
- SkillFlow — arXiv 2604.17308 (Apr 2026). 166 tasks; history-injection control; Sonnet 4.6 0.00pp, GPT-5.3-Codex -6.02pp, 5/11 ≤0; "repair, not writing, is the gap".
- SkillsBench — arXiv 2602.12670 (Feb 2026). 86 tasks ×11 domains ×7,308 trajectories; curated +16.2pp, self-generated -1.8pp.
- SkillGenBench — arXiv 2605.18693 (May 2026). 187 tasks; methods below no-skill floor; negative transfer.
- SkillLearnBench — arXiv 2604.20087 (Apr 2026). Per-task regressions up to -23.3pp.
- Skill Shadowing — arXiv 2605.24050. -21pp at 202 skills; shadowing = 68% of degradation.
- CoEvoSkills — arXiv 2604.01687. Verifier-gated; 32% → 71.1% rounds 3-5.
- WebXSkill — arXiv 2604.13318. Executable+guided dual-mode skills.

Statistical methodology:
- CRAG / Meta KDD Cup 2024 — arXiv 2406.04744. +1/0/-1 scoring; Truthfulness = Accuracy − Hallucination; head/torso/tail tiers.
- τ-bench — arXiv 2406.12045 (Yao et al. 2024, ICLR 2025). pass^k reliability metric.
- Connor R.J. (1987). Sample size for paired proportions. *Biometrics* 43(1):207-211. DOI 10.2307/2531961.
- Fagerland, Lydersen, Laake (2013). Mid-p McNemar. *BMC Med Res Methodol* 13:91. DOI 10.1186/1471-2288-13-91. (PMC3716987)
- Benjamini & Hochberg (1995). FDR control. *JRSS-B* 57(1):289-300.
- MT-Bench / LLM-as-judge — arXiv 2306.05685 (Zheng et al. 2023, NeurIPS). Position/verbosity/self-enhancement bias.
- LLM determinism — arXiv 2408.04667 (Atil et al. 2024). ±15pp swings at temperature=0.
- Non-deterministic drift — arXiv 2601.19934 (agent-verified). Larger models more variable.
- Benchmark contamination — arXiv 2310.18018. n-gram overlap audit method.
- NLP pre-registration — arXiv 2302.10086.
- Judge reliability — arXiv 2412.12509.
- Context length alone can hurt — arXiv 2510.05381.

Internal:
- [`16-substrate-benchmark-scouting.md`](16-substrate-benchmark-scouting.md), [`16-post-skillcraft-benchmark-selection.md`](16-post-skillcraft-benchmark-selection.md) — benchmark survey (CRAG primary, τ³-bench companion; FinChain Criterion-3 cost-to-derive-inline analysis).
- [`17-crag-shape-probe-findings.md`](17-crag-shape-probe-findings.md) — empirical substrate readiness; the data-shape-clone silent-wrong-answer landmine; `FANOUT(tool)` signature collapse; `df.db.*` remapping recommendation.
- [`05-agent-workflow-memory.md`](05-agent-workflow-memory.md), [`08-asi-programmatic-skill-induction.md`](08-asi-programmatic-skill-induction.md), [`04-skillcraft-tool-skill-acquisition.md`](04-skillcraft-tool-skill-acquisition.md) — prior internal scouting of AWM, ASI, SkillCraft.
