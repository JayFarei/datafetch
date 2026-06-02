---
title: "feat: SaC-aligned proof-of-value PoC on SkillCraft (break-even amortisation + governed promotion)"
summary: "Land a runnable proof that datafetch's online per-tenant governed crystallisation amortises cross-session codegen cost below a realistic tenant reuse density, and that a held-out-replay gate declines instead of answering wrong, on the one in-house corpus where reuse already fires."
type: feat
status: proposed
date: 2026-06-02
related_research:
  - kb/br/20-perplexity-search-as-code.md
  - kb/br/19-skill-library-baseline-ladder-and-paired-eval-methodology.md
  - kb/br/16-post-skillcraft-benchmark-selection.md
  - kb/br/17-crag-shape-probe-findings.md
  - kb/plans/008-iter3-composition-density.md
---

# SaC-aligned PoC on SkillCraft

*Revision v2, 2026-06-02: hardened by a six-facet adversarial debate with Codex (run after the v1 design). The thesis, the SkillCraft corpus, and the blog-plus-demo landing survived; the experimental spine changed materially. The headline is now a pre-registered break-even, the win is isolated by an attribution ladder, governance is a co-pillar, and Arm-1 parity is a machine-checked invariant. The v1 single primary (Arm 4 vs Arm 1 on effectiveTokens) is demoted to a secondary, because three independent debate facets found it over-attributes the win.*

## Overview

Perplexity shipped Search as Code (SaC), our code-mode-over-a-data-plane thesis at production scale, and proved both that the substrate wins and that the amortisation axis is real and large (CVE case study, -85.1% tokens). SaC's published design keeps task helpers ephemeral: it re-pays codegen every trajectory, holds no cross-session persistence, and carries no governance contract for auto-generated code. This plan lands a small, runnable proof that datafetch's online per-tenant governed crystallisation amortises that recurring codegen cost below a realistic tenant reuse density, and that a held-out-replay gate declines instead of answering confidently wrong, by extending the existing SkillCraft harness with the arms no skill-memory paper has ever run. The deliverable is a technical blog plus an interactive demo, not a conference submission, timed to land while SaC is current. The headline proof object is a pre-registered results table; the cost-frontier visual is labelled intuition, not proof.

## Problem Frame

The substrate is proven to function (SkillCraft Goal 4 MET, 5 of 7 codeModeHarness layers proven) but its value is unproven: every proven layer rests on a corpus too easy to need it, and no external baseline has ever been run. Our own findings constrain the claim hard. On a frontier model, within-session reuse of a small re-derivable helper fires ~0 times (CRAG-finance, confirmed 0 of 2,706 substrate-on rows, reproducing SkillFlow Sonnet-4.6 0.00pp and SkillsBench self-gen -1.8pp). So a single-session correctness lift is not available and must not be claimed. The value lives on the axis SaC's published design leaves out: the per-family codegen and crystallisation cost is paid once per tenant and amortised across the session boundary that SaC's ephemeral helpers re-pay every trajectory, plus a held-out-replay gate that decides whether an auto-generated helper is allowed to answer. SaC's publication is the moment to make this claim, because it has just removed all doubt that the substrate and the amortisation axis are real, which lets us position datafetch as completing the online half of a loop SaC built the offline half of.

The corpus decision is load-bearing and was reversed from the earlier "pivot to telecom" direction after adversarial review. SkillCraft is the one in-house corpus where reuse structurally fires, because its tool calls have side effects the agent cannot reproduce, so the crystallised fan-out helper is necessary rather than optional (R7 = 0.846 conditional reuse is direct evidence). SkillCraft was chosen after observing R7, which is legitimate for an existence proof and disqualifying only for a generality claim; we disclose this. tau-2-bench telecom and WebArena are unbuilt (roughly 500 to 900 lines of harness each plus vendor data, 3 to 5 focused engineering days minimum), and the literature flags telecom policy-predicates as plausibly the same cheap-to-re-derive null cell CRAG-finance already demonstrated (kb/br/16 calls a policy predicate "the most compressible composition possible"). Betting the PoC on an unbuilt corpus that may not fire repeats the CRAG-finance mistake.

The debate's central correction: a naive "Arm 4 (persistent library) beats Arm 1 (inline-rewrite) on tokens" result is dismissible, because the saving could come from pure tool-result memoization, from a remembered natural-language recipe, or from a callable typed interface, and only the third is our claim. The design below isolates the third, and frames the headline as the reuse count at which the library pays for itself.

## Requirements Trace

- R1. The SkillCraft runner runs each arm under a pinned `DATAFETCH_INTERFACE_MODE=hooks-draft`, recorded in the run manifest. The production default `hooks-candidate-only` makes zero learned helpers callable (`src/hooks/mode.ts:35`, `src/hooks/registry.ts:529-555`). The run frames the candidate-only to callable promotion as the governed step itself (the quarantine/replay PASS is what flips callability), so hooks-draft is the surface under test, not a thumb on the scale.
- R2. Arm-1 parity is a machine-checked, published invariant. A single shared prompt renderer produces the Arm 1 and Arm 4 prompts; the only permitted difference is the binding target (Arm 1 writes an inline ephemeral helper, Arm 4 calls the persisted `df.lib` helper). Identical tools, context, retry budget, prompt-token budget, and opportunity to discover the abstraction. The runner logs both prompt hashes and token counts and fails the run if parity breaks; the hashes are published.
- R3. The arm set is: Arm 0 no-tools floor; Arm 1 tool-matched inline-rewrite no-persistence (the adversarial bar, instructed to write and reuse its own helper within that one session); Arm 2 datafetch governed library; Arm 3 ablation-without-governance (crystallise and make callable but skip the quarantine/replay promotion gate, decoupled from `DATAFETCH_DISABLE_LEARNING`); Arm 4 frozen-library cross-session (phase 1 builds and freezes, phase 2 is a fresh process with a cleared transcript); Arm 5a results-cache-only (carry forward cached tool-call results by strict name-plus-args key, no authored code, no callable helper); Arm 5b recipe-only (a short persisted natural-language or schema hint distilled from phase 1, no callable code).
- R4. The held-out siblings in phase 2 are new-argument, so nothing decisive is answerable from cache. The runner reports a per-question cache-hit rate and asserts zero decisive cache hits across arms; strict cache keys are identical across arms.
- R5. The confirmatory model-context token metric is `all input tokens + output tokens`, counting cached input at full weight (or with cache disabled). It is reported alongside a full lifecycle ledger (raw/cached/output tokens, tool calls, sandbox plus wall-clock, dollars, phase-1 build cost, governance-replay cost, warm marginal cost). It is scoped as "model-context token savings," never "cost savings," unless the full ledger is shown.
- R6. PRIMARY endpoint, a pre-registered lifecycle break-even. Define `M* = (build_cost + governance_cost) / (Arm1_inline_cost_per_q - Arm4_warm_call_cost_per_q)` over eligible warm reuses, with a clustered or bootstrap CI. Pre-register `M0` (the claimed tenant reuse density) before the run. Success = the 95% upper CI of `M*` is at or below `M0`. If `Arm1_inline_cost_per_q <= Arm4_warm_call_cost_per_q`, break-even is infinite, a clean fail. SaC's published design has infinite `M*` (it re-pays codegen every trajectory); the claim is that datafetch's is finite and below `M0`.
- R7. ATTRIBUTION ladder (co-primary): the callable-interface claim holds only if Arm 4 beats both Arm 5a (memoization floor) and Arm 5b (instruction-compression floor) on model-context tokens at non-inferior correctness. Arm 4 vs Arm 1 is retained as a SECONDARY marginal-cost endpoint (proves cross-session persistence is real), not the headline.
- R8. GOVERNANCE co-pillar (blog-grade qualitative). Arm 2 vs Arm 3 on the rate of confidently-wrong helper-mediated answers, plus three deterministic adversarial replay tests run against a frozen gate with a blind generator and held-out siblings: wrong-sibling clone, under-parameterised clone, and source-drift (mutate a numeric fixture, assert the frozen helper now returns a stale value that replay catches). Plus a roughly 20-plus-20 blind mutant/valid mini-suite reported as qualitative with wide (rule-of-three) uncertainty. No measured organic safety rate is claimed; the quantitative 50-plus-50 suite is paper follow-up.
- R9. Correctness is analysed clustered by question (k>=5 interleaved seeds aggregated to a per-question majority-vote label before the McNemar 2x2; never treating `(family,level,seed)` as independent pairs). Non-inferiority of Arm 4 vs Arm 1 is claimed only if the pre-registered clustered CI lower bound is above -5pp; otherwise the honest report is "observed delta X pp, formal non-inferiority not established." Family-level robustness and BH-FDR on slices are reported.
- R10. The published artifact carries the honest-limits section verbatim, including the pinned narrow claim sentence: "On a corpus selected because reuse is structurally necessary, a governed persistent library amortises cross-session codegen cost that SaC's ephemeral helpers re-pay every session, at non-inferior correctness." It discloses post-hoc corpus selection, the planner-neutralised slice, the `df.llm.*` gap as future work, the numeric-only governance scope, and cross-tenant transfer as out of scope. The headline proof object is the pre-registered results table; the cost-frontier demo is labelled intuition, not proof.
- R11. The reuse-density pre-flight probe is a defined requirement, not a permission slip. Before any new corpus is built, a roughly 20-task probe reports per-family repeat density (N>=2), crystallisation rate, held-out replay pass rate, and actual frozen-library reuse rate. A corpus is promoted to a full build only if it clears thresholds calibrated against SkillCraft's measured R7 = 0.846 (for example at least three families with N>=2 repeats and frozen-library reuse firing on at least 40% of eligible follow-ups); otherwise it is labelled null-risk and not built. The same probe is the productisable "reuse-density readiness score."

## Scope Boundaries

- No tau-2-bench telecom or WebArena corpus build before publication. Both are roadmap, gated behind the R11 reuse-density probe. This PoC lands on SkillCraft only.
- No `df.llm.*` first-class primitive. The substrate has no LLM-as-callable composable (`src/snippet/dfBinding.ts:49-55` is db/lib/tool/answer/run); matching SaC's strongest crystallisation shape (code plus embedded LLM extraction plus typed schema) is future work. The PoC's claim does not require it.
- No organic CRAG ON/OFF governance endpoint. CRAG governance is a confirmed p=0.41 noise null on a non-paired, 72%-timeout run with zero crystallised helpers. Governance is shown via the deterministic probes and the blind mini-suite only.
- No claim of a single-session correctness improvement over inline-rewrite. The null is pre-registered and reported as a finding.
- No quantitative organic governance miss-rate (the 50-plus-50 paper-grade suite is deferred). The blog claim is qualitative.
- No non-numeric / text replay contract. The quarantine validator is hardcoded to 1% numeric FAC tolerance (`src/observer/quarantineValidator.ts:51-58`); extending it is roadmap, except the numerically-constructible source-drift probe in R8.
- No fix to the SkillCraft `InternalToolFanoutPlan` eval stub (`src/eval/skillcraftFullDatafetch.ts:3587-3640`). We disclose it, log it as byte-identical across arms, and report a planner-neutralised slice; we do not generalise the planner here.
- No "structurally cannot" language. The honest claim is that SaC's published design keeps helpers ephemeral and carries no governance contract, not that it could never add them.

## Context & Research

- kb/br/20 (Perplexity SaC): the external validation and the foil. SaC is the same three-layer code-mode architecture; its helpers are ephemeral; its autoresearch loop is offline and shared. The CVE -85.1% is cited as external corroboration that the amortisation axis is real, never as our own number.
- kb/br/19 (baseline ladder plus methodology): the ladder, the inline-rewrite-no-persistence adversarial bar, the prediction that frontier single-session correctness delta is ~0, and the McNemar / k>=5-seed / pinned-snapshot / BH-FDR statistics, now extended with clustered analysis and the break-even framing.
- kb/br/16 (benchmark selection): the corpus reasoning, including the warning that a policy predicate is the most compressible composition possible (the reuse-density risk for telecom).
- kb/br/17 (CRAG shape probe): the silent-wrong-sibling landmine the governance probes are built around.
- Memory `project-crag-within-session-negative`: the confirmed within-session small-composition null.
- Workflow run `wf_b056d6e5-dc1` (design) and the six-facet Codex debate (2026-06-02, hardening): the source of this v2; ground-truth code findings are cited inline by file:line.

## Architecture

The thesis is two learning timescales over one code-mode substrate. SaC's offline shared autoresearch loop tunes the SDK everyone shares and re-pays per-trajectory codegen; datafetch's online per-tenant loop crystallises a converged family into a persistent, governed helper paid once. This plan instruments only the right-hand loop and isolates its value with an attribution ladder.

```text
+-----------------------------------------------------------------------+
|                  ONE CODE-MODE SUBSTRATE (SaC proved it)              |
+-----------------------------------------------------------------------+
        SaC: offline/shared, re-pays codegen each trajectory (M* = inf)
        datafetch: online/per-tenant, pays codegen once (M* finite)

  attribution ladder (phase-2 fresh process, new-argument siblings):
    Arm 5a  results-cache-only ......... memoization floor
    Arm 5b  recipe-only (NL/schema) .... instruction-compression floor
    Arm 4   callable typed helper ...... OUR CLAIM (must beat 5a AND 5b)
    Arm 1   inline-rewrite ............. SaC's regime (re-derives/session)

  governance co-pillar:
    Arm 2 governed (replay-gate PASS -> callable) vs Arm 3 ungoverned
    + 3 deterministic probes: wrong-sibling | under-parameterised | drift
```

Headline figure: the break-even, `M*` (reuse count to pay back build plus governance cost) with its 95% upper CI against the pre-registered `M0`, and SaC annotated at `M* = infinity`. Supporting visual: a cost frontier, x = session ordinal, y = model-context tokens, Arm 1 flat, Arm 4 bending down, with Arm 5a and Arm 5b as intermediate lines that show the callable-interface saving above memoization and recipe. Side panel: the governance contrast (Arm 3 emits the wrong-sibling or stale-drift answer, Arm 2 declines). One named exhibit for the SaC-engineer audience: "what SaC pays every session that we pay once, safely."

| Component | Responsibility |
|-----------|---------------|
| `src/eval/skillcraftFullDatafetch.ts` | Arm 1/2/3/4/5a/5b modes; hooks-draft pin; shared prompt renderer with the parity gate; two-phase fresh-process runner; cache-hit-rate reporting; lifecycle cost ledger |
| `eval/skillcraft/scripts/score-cross-arm.ts` (new) | Cross-arm scorer: break-even `M*` plus CI; Arm 4 vs 5a/5b and vs 1 on model-context tokens; clustered-by-question correctness McNemar with the pre-registered NI rule; BH-FDR slices |
| `eval/skillcraft/scripts/p1-paired-analysis.py` | Extend or fork for clustered NI and the `M*` bootstrap CI (existing McNemar at `:88-99`, paired-t at `:66-78`) |
| `skills/datafetch/SKILL.md` | Composition-pattern few-shot; name df.tool |
| `src/observer/quarantineValidator.ts` | Reuse the numeric FAC replay for the three deterministic probes and the blind mini-suite (no tolerance change) |
| `eval/skillcraft/` fixtures | Wrong-sibling, under-parameterised, and source-drift probe fixtures; the blind 20-plus-20 mutant/valid suite |

## Milestones

1. **hooks-draft per-arm wiring plus governance-as-callability framing**: env flag into the runner, pinned in the manifest; the replay PASS flips callability. *Effort: Quick (< 1h)*
2. **Shared prompt renderer plus the machine-checked Arm-1 parity gate**: one renderer for Arm 1 and Arm 4; log and publish prompt hashes; fail the run on parity break. *Effort: Short (< 4h)*
3. **Preseed rewrite**: at least one composition few-shot plus name df.tool. *Effort: Short (< 4h)*
4. **Arm 1 inline-rewrite-no-persistence** and **Arm 3 ablation-without-governance** modes. *Effort: Short (< 4h, ~300 lines)*
5. **Arm 4 cross-session two-phase runner** plus **Arm 5a results-cache-only** and **Arm 5b recipe-only** controls and the cache-hit-rate assertion. *Effort: Short to Medium (< 1d, ~400 lines, all cheap variants of the two-phase runner)*
6. **Cross-arm scorer** with the break-even `M*` plus CI, the Arm 4 vs 5a/5b attribution test, and clustered-by-question correctness NI. *Effort: Short (< 4h, ~200 lines)*
7. **Three deterministic governance probes plus the blind 20-plus-20 mini-suite** against a frozen gate. *Effort: Short (< 4h)*
8. **Pre-register and run k>=5 interleaved seeds**: pinned dated snapshot; pre-register `M0`, the attribution ladder, and the clustered correctness NI rule before the run. *Effort: Medium (< 1d, mostly wall-clock)*
9. **Blog plus interactive demo**: the pre-registered results table as the headline proof object, the cost frontier and governance side-panel as intuition, the SaC-engineer exhibit, lead with our category. *Effort: Medium (< 1d)*

## Files to Modify

| File | Changes |
|------|---------|
| `src/eval/skillcraftFullDatafetch.ts` | Arms 1/2/3/4/5a/5b; hooks-draft pin; shared prompt renderer plus parity gate; two-phase fresh-process runner reusing `persistFamilyLibCache`/`hydrateFamilyLibCache` (~2138+); cache-hit-rate reporting; lifecycle cost ledger |
| `eval/skillcraft/scripts/score-cross-arm.ts` | New cross-arm scorer (do not extend `score-r1-r9.ts`, intra-arm at `:431,781`): break-even `M*`, attribution tests, clustered NI |
| `eval/skillcraft/scripts/p1-paired-analysis.py` | Clustered-by-question NI plus `M*` bootstrap CI |
| `skills/datafetch/SKILL.md` | Composition few-shot; name df.tool |
| `eval/skillcraft/` (fixtures plus runbook) | Three probe fixtures; blind 20-plus-20 suite; pre-registration doc (M0, ladder, NI rule); arm matrix |
| `experiments/2026-06-sac-poc/` (new) | README/STATUS/PLAN/pre-registration following the canonical experiment layout |

## Verification

1. Run manifest records `hooks-draft` for every arm; a smoke run confirms a helper becomes callable only on a replay PASS (the governed flip).
2. The Arm 1 and Arm 4 prompts are byte-identical except the one binding line; the published hashes confirm it and the run fails if parity breaks.
3. Phase-2 siblings are new-argument; the per-question cache-hit rate confirms zero decisive cache hits across arms.
4. The cross-arm scorer emits `M*` with a clustered or bootstrap CI against the pre-registered `M0`; success is the 95% upper CI at or below `M0`.
5. Arm 4 beats both Arm 5a and Arm 5b on model-context tokens at non-inferior correctness (the attribution test); Arm 4 vs Arm 1 is reported as the secondary marginal-cost endpoint.
6. Correctness is clustered by question (majority vote over k>=5 seeds before the 2x2); non-inferiority is claimed only if the clustered CI lower bound is above -5pp, else reported descriptively. Within-arm noise floor reported in every table.
7. Governance: Arm 2 declines and Arm 3 emits the wrong value on all three deterministic probes (wrong-sibling, under-parameterised, source-drift); the blind 20-plus-20 suite is reported qualitatively with rule-of-three bounds.
8. The published artifact carries the pinned narrow claim sentence, the post-hoc-selection disclosure, the planner-neutralised slice, and scopes savings as "model-context tokens"; the results table is the headline and the demo is labelled intuition.
9. The R11 reuse-density probe is defined with thresholds calibrated to R7 = 0.846 and is referenced as the gate for any future corpus.
10. `pnpm typecheck` clean and `pnpm test` green after the harness additions.

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale |
|---|-------|----------|---------------|-----------|-----------|
| 1 | Scope | Land on SkillCraft, demote telecom/WebArena to roadmap behind R11 | Scope | Land where reuse fires | SkillCraft reuse is structurally necessary (R7=0.846); telecom is unbuilt and may be the same cheap-to-re-derive null cell as CRAG-finance. |
| 2 | Claim (v2) | Headline is the pre-registered break-even `M*` vs `M0`, not a token delta | Methodology | Falsifiable amortisation | Three debate facets found Arm 4 vs Arm 1 over-attributes the win; `M*` vs a pre-committed `M0` makes the two-timescales thesis falsifiable and maps onto SaC's infinite `M*`. |
| 3 | Claim (v2) | Isolate the win with the 5a/5b attribution ladder | Methodology | Rule out cheaper explanations | A positive Arm 4 collapses to memoization or instruction-compression unless it beats results-cache-only and recipe-only controls; only then is it a callable-interface win. |
| 4 | Claim (v2) | Governance is a co-pillar, blog-grade qualitative | Methodology | Show the part SaC lacks | Persistence is the part SaC could add; the replay gate is the part it has no equivalent for. Three deterministic probes plus a 20-plus-20 blind suite defeat circularity by structure; the quantitative 50-plus-50 suite is paper follow-up. |
| 5 | Design (v2) | Arm-1 parity is a machine-checked, published invariant | Architecture | Auditable, not asserted | Two facets warned that any Arm-1 asymmetry reads as benchmark construction; publishing byte-identical-except-one-line prompt hashes pre-empts the attack. |
| 6 | Statistics (v2) | Cluster by question; token metric counts cached input at full weight; NI from the pre-registered CI only | Methodology | Honest inference | `(family,level,seed)` independence is pseudo-replication; "non-cached" tokens re-import the cache confound; conditioning NI on realised discordance is a forking-paths defect. |
| 7 | Claim (v2) | Concede the single-session correctness null up front | Methodology | Honesty as credibility | Literature and our CRAG 0/2706 predict ~0; pre-registering the null converts it from a weakness into a credibility signal. |
| 8 | Scope | Disclose post-hoc SkillCraft selection; name df.llm.* and the non-numeric replay contract as future work | Scope | Informed respect, not overclaim | SkillCraft was chosen after observing R7 (legitimate for an existence proof); naming the gaps pointing back at SaC reads as informed rather than derivative. |
| 9 | Landing (v2) | Results table is the headline proof object; demo is intuition; lead with our category | Ops | Proof before persuasion | A 24-hours-later blog is smart timing rather than a derivative appendix only if the first serious section is a falsifiable paired result, not an animation. |
| 10 | Landing | Blog plus demo now, not a conference paper in the SaC window | Ops | Ride the validation wave | The demo lands while SaC is current; the fuller paper with the telecom/WebArena reproduction and the quantitative governance suite follows once R11 clears those builds. |
| 11 | Process | Verify any skill-governance prior-art citation before use | Scope | No unverified citations | Codex named two post-cutoff arXiv IDs (2605.18401, 2604.03964) our agent could not confirm; do a real literature check before citing the governance lane. |
