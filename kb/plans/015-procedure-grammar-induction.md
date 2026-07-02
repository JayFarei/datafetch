---
title: "feat: Procedure-Grammar Induction — a synthesis-only fork of CodeOpt's locked control half"
summary: "Same frozen substrate (df.db.*/df.compute.* = the alphabet) and the same SkillOpt-derived control half as plan 014 (held-out gate, bounded edit budget, rejected-edit memory, fast/slow split) — treated here as a LOCKED INVARIANT, not a design choice. The fork is at the SYNTHESIS half only: the trainable object becomes a compositional typed procedure GRAMMAR, and the optimizer becomes structured library INDUCTION (anti-unify → MDL-select → gate), because object class picks the optimizer and the object changed class. Decided by a pre-registered R-vs-C bake-off behind a depth floor."
type: feat
status: proposed
date: 2026-06-22
related_research:
  - kb/plans/014-codeopt-code-as-external-state.md
  - kb/plans/010-online-interface-synthesis-oracle-regret.md
  - kb/br/16-post-skillcraft-benchmark-selection.md
  - kb/br/19-skill-library-baseline-ladder-and-paired-eval-methodology.md
  - kb/br/08-asi-programmatic-skill-induction.md
---

# Procedure-Grammar Induction (015)

**The one-sentence thesis (the headline rule).** The control scaffold is object-agnostic; the optimizer is not. A prose object takes reflection; a program object takes induction. Running reflection on a typed call-graph is *editing a program with a prose tool*, and it bottoms out at thin shims by construction, not by tuning. 014's object changed class — from a flat set edited by reflection to a compositional grammar — so the optimizer must change with it. That is the entire justification for 015 as a fork of 014.

## 0. The frame (taken seriously)

A **frozen substrate** and a **trainable artifact** over it. `df.db.*` / `df.compute.*` are the **alphabet you never rewrite**. The **grammar is the state you train**. SkillOpt already paid the compute to establish that *bounded, gated text-space optimization is what keeps a learned artifact from drifting* — its ablations show gains are insensitive to batch and schedule but collapse without the gate and the slow update. We do not relitigate that. We inherit it and spend the novelty budget on the parts SkillOpt couldn't reach.

014 and 015 are **forks of one control half**. They differ only in synthesis and object.

## 1. Control half — INHERITED FROM 014, LOCKED AS AN INVARIANT

Ported verbatim from SkillOpt via 014. **Do not re-tune. A change to control is a change to BOTH forks.** The learning rate is defined here with full rigor — and for a program object it gains a structural step-size prose never had.

| Control | SkillOpt | 015 (induction over grammar G) | Default | Bounds / why |
|---|---|---|---|---|
| Parameter | `skill.md` | grammar **G** (typed compositional procedure library) | — | the trained state |
| **LR — count `L_t`** | max #edits/step | max #grammar mutations **accepted**/step | **4 → 2 cosine** | how far G may move per step |
| **LR — trust region `Δ_t`** | implicit (bounded by `L_t`) | max **structural magnitude**/op: max ΔDL, ≤1 abstraction-level raised/op | **≤1 level early, tighten late** | NEW for a program object — keep each revision near G_t so the rejected-buffer + proposer retain a meaningful optimization history (SkillOpt's exact rationale: revisions that jump too far destroy learnable history) |
| Schedule | const/linear/cosine/autonomous | same, over `(L_t, Δ_t)` | **cosine** | broad early, conservative late |
| Autonomous LR | LLM sizes its batch | LLM **proposes** count; **gate caps** → `min(proposed, gate-passing)` | gate-clamped | propose-never-dispose; authority sits with the gate |
| Rollout batch `B` | evidence/step | trajectories harvested/replayed per step | corpus-covering | insensitive per ablation — **do not tune** |
| Minibatch | success/failure groups | **the intent-cluster** (anti-unify unit) | `k ≥` depth-floor min | not a knob — the unit of generalization |
| Validation gate | held-out score ↑ strict | **corpus DL/cost ↓ strict ∧ process-stack pass ∧ no anecdotal regression** | strict | global + compositional, from commit 1 (§4) |
| Rejected buffer | failed edits + drop | **rejected-abstraction buffer**, keyed by abstraction `shapeHash` | per-corpus-epoch | proposer never re-offers a structural loser |
| Momentum / slow update | epoch slow/meta guidance | **refactoring slow-pass** (§5), same gate, own `(L_t,Δ_t)` + own buffer | per-corpus-boundary, smaller | load-bearing phase, not a leaf hint |
| Epoch | pass over data | fast admit-passes over all clusters + **one slow refactor-pass** at boundary | — | the fast/slow split |

**Inherited stance from SkillOpt's ablations:** preserve the gate + the slow update (load-bearing); do **not** tune batch/schedule (insensitive). The novelty budget is spent in §3–§5, never on control.

## 2. The object — a compositional typed procedure grammar

Not a flat set (014's fork-a) and not prose (SkillOpt). A growing, hierarchical, typed **grammar** where procedures compose procedures. Each member: a typed signature; a **deterministic skeleton** (a composition of `df.db.*` / `df.compute.*` / *other learned procedures*); **holes** parameterizing the LLM-leaf judgments; and a co-emitted process-verifier contract (the anecdotal stack of plan 014 §5 + the process-reward stack of §6 below). The structure earns three things a flat set cannot:

- **Composition = depth = the only regime with cost headroom** (your "DEPTH not width" finding — a top-level procedure calling 3 learned sub-procedures is genuinely expensive to inline, which is the only way the cost gate clears).
- **Composition = sample efficiency** (sub-procedures amortize across intents → no DreamCoder-scale corpus needed).
- **The type system = verifiability by construction** (abstract only the deterministic skeleton; hole out the leaves → every member is replay-verifiable). This is the deterministic-skeleton condition promoted to a type constraint.

## 3. The synthesis fork — structured library induction (LLM proposes, never disposes)

Three operations replace 014's single-trajectory reflective lift:

1. **Anti-unify** (least-general-generalization) over a same-`intentSignature` cluster of trajectories → a candidate parameterized procedure. *This is the operation that turns k anecdotes into one procedure.*
2. **Compress / select by MDL** over the whole corpus → keep a candidate iff it lowers corpus description length (recurs across ≥k trajectories, shortens future caller-programs). The MDL prior **is** "raw usage is noise; signal compounds across uses."
3. **Accept by the gate** (§4).

**The LLM is the proposer, not the disposer.** Neural: pick which clusters to anti-unify, name and type the holes, suggest splits/merges. Symbolic: compression + the gate decide. This dissolves data-hunger — the proposer supplies the prior, the compressor supplies the anti-anecdote discipline, sub-procedure reuse amortizes corpus cost across intents.

## 4. The gate — global, compositional, from the first commit

The local objective ("does this one lift beat inline") is already falsified; do not rebuild on it. The acceptance signal is **corpus description length as the proxy for expected cost across all future callers**:

```
score(G) = Σ_{x∈corpus} cost(caller-program_x | G)  +  λ·|G|
           └─ data cost (cost-aware token+TURN units, 014 §4) ─┘   └ library cost ┘

ACCEPT a mutation iff:  score(G_{t+1}) < score(G_t)  (strict)
                   AND  process-reward stack passes        (anti-Goodhart, §6)
                   AND  no anecdotal-verifier regression    (014 §5 stack)
```

This is the single place we are **strictly past SkillOpt**: its gate is whole-artifact validation and cannot see composition because its artifact doesn't compose. Ours can, so the gate *optimizes* compositional cost rather than merely *validating* a monolith. The process-reward guardrails are mandatory — they stop compression from "winning" by abstracting structure that doesn't track correctness.

## 5. The slow half — refactoring as a first-class gated pass (the momentum term)

Fast pass *proposes* abstractions; the slow pass *consolidates depth*. At each corpus boundary, a gated pass that:

- **merges** same-intent/different-shape procedures into one parameterized procedure;
- **splits** a procedure whose intent-signature spans families when a sibling regresses;
- **raises abstraction level** — rewrites top-level procedures to call newly-admitted sub-procedures;
- **retires** procedures the corpus stopped calling.

Each move goes through the **same gate** (§4), under its own conservative `(L_t, Δ_t)`, with its own **rejected-abstraction buffer** so the proposer never re-offers a failed anti-unification/merge. SkillOpt's slow update is its momentum; ours is a refactor phase. Without it the optimizer is under-built.

## 6. Optimize for distillation, not no-bloat — and instrument it

SkillOpt stays small by **rejecting** (passive: don't grow). 015 stays small by **compressing** (active: shrink). That is the actual differentiator and the only version where "improves the more you use it" is a measurement, not a hope. **Primary telemetry, three curves:**

1. **description-length-per-intent ↓**
2. **compositional depth ↑** (mean nesting / serial-dependency length of accepted procedures)
3. **inline-rederivation rate ↓** (fraction of episodes the agent re-derives instead of calling a procedure)

**Honesty clause:** if those three curves are flat, you have built SkillOpt with extra machinery and must say so. If they bend, that is the result.

**Process-reward stack (the anti-Goodhart filter + the dense gradient), computed not judged:** faithfulness (re-execute lineage, each step's output matches record), generality (genericity pass-fraction on k≥3 held-out same-intent siblings), parsimony (steps/redundant fetches from lineage), coverage/abstention (the coverage invariant), robustness (failure-branch fixtures). Calibrate weights against the manufactured-gold split; drop any dimension that doesn't predict held-out correctness. Each check must be *constraining* (remove the cited evidence and the answer changes), not decorative.

## 7. The experiment — R-vs-C bake-off behind a pre-registered depth floor

Isolates one variable: structured-algorithm-over-structured-object vs reflection-over-flat-set, with a clean kill.

- **Corpus:** one DEPTH/serial corpus passing the br/16 Criterion-3 pre-screen where sub-procedures plausibly recur across intents (the OpenTraces dark-store family, +13.5pp depth signal, or a constructed deep-search corpus). Harvest M trajectories.
- **Arm R (baseline = 014 fork-a):** single-trajectory `authorFromSource` lift → flat `df.lib` helpers.
- **Arm C (015):** cluster by `intentSignature` → **anti-unify** each cluster → **MDL-select** corpus-shortening abstractions → build a **2-level** library (sub-procedures + composing top-level procedures) → **slow refactor-pass** → accept via the gate.
- **Pre-registered, paired, k≥5 seeds.** Primary endpoint: **gate-pass rate** (procedure beats inline net of lifetime cost AND passes the process stack), Arm C − Arm R, paired by intent. Secondary: generality (genericity pass-fraction), **compositional reuse** (top-level procedures calling ≥1 learned sub-procedure), depth, and the three distillation curves (§6).

### The depth floor (both gates clear BEFORE the bake-off, or the kill is uninterpretable)
Transposes SkillOpt's quiet warning (1–4 accepted edits carried its gains — high-leverage structure was sparse). If our compressible cross-intent structure lives in 1–2 sub-procedures, a flat Arm R that lifts them captures most of the value and Arm C never separates **even with a correct mechanism** — a low-power false negative.

1. **Structural pre-scan** — a cheap static pass over the lineage forest must find **≥ D_min ≥ 3** recurring cross-intent sub-procedures.
2. **Power floor** — N (intents × seeds) sized for ≥80% power at a pre-registered minimum-detectable gate-pass gap, the gap anchored so it could reflect the +13.5pp depth signal.

If either fails → corpus underpowered → **pick a richer corpus, do not fire the kill.**

### Decision
- **KILL:** with both floors cleared, Arm C is no deeper, no more general, and no better at gate-pass than Arm R at k≥5 on the pre-registered endpoint → synthesis power was not the bottleneck, the structured take adds nothing over reflection, **stay with 014 fork-a.**
- **SUCCESS:** Arm C yields a compositional library whose sub-procedures are reused across ≥2 intents and whose top-level procedures clear the cost gate where Arm R's flat anecdotes don't, with the three distillation curves bending → **structure is what produces reusable procedures.**

## 8. Build scope

Build only the **two new pieces** — anti-unification over the typed lineage forest, and the MDL selector — plus the **refactor slow-pass** (§5). **Reuse as-is:** harvest, `authorFromSource` lift, the anecdotal verifier stack (014 §5), the cost-aware gate comparator (014 §4 / P2), the corpus pre-screen, the manufactured-gold selection split. The control half (§1) is inherited from 014 untouched.

## 9. Risks

- **Low-power kill** → the depth floor (§7) is the mitigation; do not run the bake-off until both floors clear.
- **No compressible skeleton** → if trajectories are mostly LLM-glue, compression finds nothing; that's the same kill firing honestly, surfaced by the structural pre-scan before any spend.
- **Goodhart on MDL** → the process-reward stack (§6) is the acceptance filter; checks must be constraining, calibrated against gold, dimensions that don't predict correctness are dropped.
- **Bigger build than 014 fork-a** → staged and experiment-first; the bake-off needs only the two new pieces + the slow-pass, not the full induction stack.
- **Premature-structure charge (the 014 falsification-skeptic's ghost)** → respected: same preconditions as 014 (gate exists, corpus pre-screened, reuse fires); the bake-off *is* the test of whether to go structured, not a prior commitment.
