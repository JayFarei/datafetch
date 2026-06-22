---
title: "feat: CodeOpt — code as the trainable external state of a frozen agent"
summary: "Re-target SkillOpt's text-space optimizer discipline (held-out gate, edit budget, rejected buffer, slow update) onto a per-tenant library of typed callable df.lib.* helpers the agent INVOKES rather than prose it READS; the load-bearing novelty is a cost-aware, executed, oracle-free replay gate plus a second (governance/retrieval) optimizer SkillOpt structurally lacks. Headline value is governance-under-staleness correctness, NOT cost-amortisation (our own k=5 run falsified that on shallow fan-outs)."
type: feat
status: proposed
date: 2026-06-22
related_research:
  - kb/br/16-post-skillcraft-benchmark-selection.md
  - kb/br/19-skill-library-baseline-ladder-and-paired-eval-methodology.md
  - kb/br/20-perplexity-search-as-code.md
  - kb/br/08-asi-programmatic-skill-induction.md
  - kb/plans/010-online-interface-synthesis-oracle-regret.md
  - kb/plans/013-substrate-observer-evolution.md
---

# CodeOpt — Code as the Trainable External State of a Frozen Agent

## Provenance

Produced from a full scout of **SkillOpt** (Microsoft, *SkillOpt: Executive Strategy for Self-Evolving Agent Skills*, arXiv:2605.23904, repo `github.com/microsoft/SkillOpt`, incl. the `skillopt_sleep/` deployment companion) and our own `datafetch` SaC substrate, synthesised under adversarial review (a 4-lens skeptic panel: novelty, falsification, verifier, learning-algorithm — all four "survive WITH mandatory patches", patches folded into the plan below). The four load-bearing code claims were verified directly against the tree on 2026-06-22 (anchors in §7).

## 1. Thesis and the reframe

SkillOpt treats a natural-language **skill document** as the trainable external state of a frozen agent and trains it like a neural net: parameter = `skill.md`, gradient = trajectory-derived reflection edit, learning-rate = bounded edit budget, validation = held-out selection gate, momentum = epoch-wise slow/meta update. Its deployment companion **SkillOpt-Sleep** already runs the offline loop we were about to reinvent: harvest Claude Code / Codex transcripts → mine recurring tasks → replay offline → consolidate (reflect → bounded edit → **gate on held-out tasks**) → stage → human adopts.

**We are not building "SkillOpt for code."** We are changing *what the external state is*: from **prose the frozen agent reads** to **typed callable code the frozen agent invokes** (`return await df.lib.someIntentInterface(...)`), discovered via progressive disclosure (`apropos` / `man` / `df.d.ts`). That single substitution is what makes the project a system delta, not a reskin — see §2.

**The headline reframe (mandatory, from the falsification panel).** The product claim is **NOT cost-amortisation**. Our own valid k=5 paired run (PokeAPI+h1x, commit `0665d5a27`) *falsified* that: warm crystallised helpers came out **more expensive in every token unit AND less correct** than inline re-derivation against a frontier baseline. A quality-only gate would have **promoted those losers**. So the cost-aware gate does not *rescue* amortisation — it **ratifies the falsification** by correctly rejecting the arm4 class. The headline is therefore **verifier-gated, cost-aware, governance-under-staleness promotion of an executable library**: the gate's job is to correctly **reject** confidently-wrong / more-expensive helpers and **promote** only equally-correct-cheaper ones, and the value regime where `reward > 0` is reachable for a *real* (non-infinite break-even) helper is **staleness-governed correctness on a tri-state grader** (CRAG's −1 hallucination penalty), where a governed helper that **declines** under detected drift strictly beats an ungoverned clone that confidently returns a stale-sibling wrong answer.

## 2. The genuine delta vs SkillOpt-Sleep (so it is not a reskin)

Sleep optimizes PROSE the agent READS; CodeOpt optimizes TYPED CALLABLE CODE the agent INVOKES. Three irreducible differences follow, and the survival argument lives at the **gate**:

1. **Validation signal (load-bearing).** A prose skill — however retrieved — is "validated" by the model *re-reading* it and completing a held-out task: the artifact is never executed, so its signal is the model judging its own prose (circular, oracle-bound). A typed callable is validated by **running it** on promoted literals and asserting `answerEquals` against the agent's prior committed answer — a **deterministic, model-independent, oracle-free** signal that prose categorically cannot produce because prose has no execution semantics. (Sleep's only "execution" is text-completion `attempt()`; nothing in Sleep ever executes the artifact.)
2. **Learning signal.** Sleep's gradient is LLM reflection over text → an English rule. CodeOpt's signal is **structured `df.*` call lineage** (typed I/O, scope/depth nesting, replay-executable bodies) — the only thing that makes merge/split/widen synthesis possible at all.
3. **A second optimizer Sleep has no analog for.** Sleep has **one** parameter (one doc, one scalar objective). A library is **combinatorial**: which helpers exist, their boundaries, and crucially *when to retrieve/reuse vs synthesize fresh*. That governance/retrieval optimizer (§5) is the genuine combinatorial frontier and is absent from Sleep by construction.

> Honesty note (novelty panel): the **invoke-vs-read** distinction is **cosmetic everywhere except the gate**. Drop the "different asymptotics" framing — a retrieved prose library has the same on-demand top-k tax as a retrieved code library. Claim the delta precisely: *prose is validated by the model re-reading it (circular); code is validated by deterministic execution (oracle-free).*

## 3. SkillOpt → CodeOpt mapping

| SkillOpt primitive | CodeOpt analogue | Transfer |
|---|---|---|
| **Parameter** = `skill.md` (one prose doc) | A **library** of typed `fn()` modules `lib/<tenant>/<name>.ts` (`{intent, examples, valibot I/O schema, body}`, `src/sdk/fn.ts`), **invoked** not read | must-build-new |
| **Gradient / edit** = JSON patch of English rules; `merge_patches` | A **library mutation** `{emit, merge, split, widen-params, deepen-body, demote, delete}`, emitted as CODE via the deterministic authoring cascade (`src/observer/author.ts` + `authorFromSource.ts`: promote top-of-`main` literals → typed params, `df.answer`→`return`, content-addressed by `shapeHash`+`intentSignature`) | must-build-new (reuses cascade) |
| **Learning rate** = max #edits/step, cosine→2 (`optimizer/scheduler.py`) | max #library mutations/offline step (L=4 cosine→2) | **reuse-as-is** (`build_scheduler`, `decide_autonomous_learning_rate`) |
| **Validation gate** = strict-improve on held-out, `cand_score > current` (quality-only) | **Cost-aware** gate: `reward = Δquality − amortised_lifetime_cost` (§4) | **adapt** (port `gate.py` shape, swap score projection) — *the single load-bearing change* |
| **Rejected buffer** = per-epoch list of failed edits rendered back into optimizer prompts | Same, keyed by `shapeHash`, persisted `observer/<tenant>/rejected-shapes.jsonl` | **reuse-as-is** |
| **Momentum** = epoch slow/meta update, `build_comparison_pairs` bucketing | **Two-loop** (§6): Loop A = fast per-tenant gate; Loop B = slow cross-tenant base-abstraction reshape over a frozen regression suite | adapt |
| **Adapter** = `EnvAdapter` (`build_*_env`, `rollout()`) | One `CodeEnvAdapter.rollout()` = run frozen agent (`claude_code_exec` target) on a mounted dataset with the current library on `df.d.ts`, then execute; result dict gains `{tokens, turns, llmCalls, libUsedShape}` | adapt (reuse `BatchSpec`/`SplitDataLoader`/`split_manifest.json`) |
| **Verifier** = per-env `evaluate()` (gold handed to every benchmark) | **Three-tier oracle-scarcity-graded** verifier (§5) with executed replay as the wall | adapt |
| — (**absent**: one parameter, one scalar objective) | **Second optimizer**: retrieve-vs-synthesize + merge/split/promote/demote over the combinatorial library | must-build-new |

## 4. The cost-aware gate (the falsification insurance)

Per candidate helper `H` over the held-out **selection** split, paired against the inline-rewrite adversary on the **same** questions:

```
reward(H) = Δquality(H) − amortised_lifetime_cost(H)

Δquality(H)               = passrate(library_with_H) − passrate(inline_baseline)   # PAIRED (McNemar discordant cells; mid-p when b+c<25); pass = officialPassed if oracle exists else replay-equal via answerEquals (FAC rel-tol 1e-2)
amortised_lifetime_cost   = build_cost/E[reuses]  +  per_call_cost  +  staleness_risk_penalty  −  inline_cost_saved
  per_call_cost           = discovery/signature_context_tax (df.d.ts + man, charged once/session then amortised) + invocation_cost (tokens + TURNS to write df.lib.H(...) + H's own execution cost)
  staleness_risk_penalty  = λ_stale × P(drift via @source-hash fingerprint vs live dataset) × hallucination_cost   # the term that makes a DECLINING helper beat a stale-clone under CRAG's −1 grader
  inline_cost_saved       = tokens + TURNS the caller would spend re-deriving H inline   # in TURNS not just tokens — the falsified +66,521 gap was a turn-count tax; the only lever that moved cost ~3.5x was helper DEPTH not width

ACCEPT iff:  reward(H) > 0 strictly
        AND  per-pair cost-win fraction ≥ 0.70   AND  mean paired ratio reuseCost/baselineCost ≤ 0.70   # R8 dual-gate, anti-gaming (score-r1-r9.ts:805-822)
        AND  Δquality ≥ −ε   # non-inferiority floor; we do NOT require a correctness lift, only non-regression
```

**Vs SkillOpt:** `select_gate_score` returns `Δquality` alone and accepts on `Δquality > 0`. CodeOpt subtracts a fully-instrumented lifetime cost and requires a paired cost-win — so *equally-correct-cheaper* PROMOTES (SkillOpt can't see it) and *equally-correct-more-expensive* REJECTS (SkillOpt would promote it — the falsified arm4). All cost units are already collected (`ReplayResult.tokens/.latency`, normalize-results `effectiveTokens`/`wallClockMs`, `src/sdk/fn.ts` Cost block); the wiring change is feeding them to the gate (Sleep collects `multi_objective_reward` but its gate ignores it).

**Honesty patch (novelty + falsification panels):** the baseline that exists today is `cleanBaseline` = an earlier same-`intentSignature` episode with `helpersCalled.length === 0` (`score-r1-r9.ts:558`) — the substrate's **own** no-helper path, **not** the frozen-frontier inline-rewrite adversary the prose asserts. P2 either **builds the true paired frontier-inline adversary** or restates the comparator to the weaker existing thing and labels it.

## 5. Three-tier verifier (oracle-scarcity-graded)

- **Tier 1 — executed replay (oracle-free, always available).** Re-execute `H` on the originating trajectory's promoted literals; `answerEquals` vs the agent's own prior committed answer (`replayOnTrajectory`, **already executing** at `quarantineValidator.ts:326/338`), PLUS genericity replay on a held-out same-intent sibling. **Demote Tier 1 from "oracle" to a determinism / non-regression check** — `expected = trajectory.answer.value` is a *fixed point*, not gold; never promote on Tier 1 alone in the no-oracle regime (verifier panel).
- **Tier 2 — structural (oracle-free).** R6/R7/R9 convergence/reuse/transfer + the R8 paired cost ratio, computed from `intentSignature`s + call graphs, no gold. This is the actual value claim ("got reused AND lowered cost").
- **Tier 3 — oracle-bound (correctness FLOOR, not the gate).** SkillCraft `evaluation/main.py`, OpenTraces deterministic solvers, **CRAG tri-state grader** (the −1 penalty is what makes governance a measurable correctness win).

Promotion = Tier-1 replay-equal AND Tier-2 cost-win (R8 dual-gate) AND Tier-3 non-regression where an oracle exists. **Verifier-gated, not usage-gated** — never merely "called N times".

**Two required verifier fixes (P1, ~20 LoC core):** (a) fix genericity sibling selection — `quarantineValidator.ts:183-188` filters only on different `sourceHash` (no intent predicate, contradicting its own header at line 11); require `sibling.intentSignature === helper.intentSignature` AND distribution-shifted literals AND N ≥ k ≥ 3 siblings, else stay quarantined (honest abstention > coin-flip pass). (b) Add `@source-hash` **drift detection as a hard pre-replay gate**: under drift the committed answer is no longer a valid fixed point → skip idempotency, force re-derive-or-decline. This is what stops a memorised stale clone from tautologically passing Tier 1.

## 6. The two-loop story

- **Loop A (tenant, fast = SkillOpt per-step gate):** nightly per-tenant cycle proposing ≤L mutations via the deterministic cascade, gated by §4 on the tenant's held-out split, rejects to the `shapeHash`-keyed buffer. Output: an updated `lib/<tenant>/`, staged for human adopt.
- **Loop B (provider, slow = SkillOpt `slow_update`/`meta_skill`, made cross-tenant):** periodic reshape of the shared `lib/__seed__/` base abstractions by mining cross-tenant `intentSignature` clusters; accept a reshape ONLY IF no regressed bucket grows **for any tenant** AND aggregate cross-tenant lifetime cost drops AND drift fingerprints still validate. Catastrophic-forgetting protection becomes **catastrophic-cross-tenant-regression** protection. **Explicitly future-work (P5)** — zero multi-tenant data exists, and the one live governance run *inverted* (arm3 ungoverned best, gate fired 0/22).

## 7. Verified code anchors (the linchpins, checked 2026-06-22)

| Claim | Anchor | Status |
|---|---|---|
| Executed replay path EXISTS | `src/observer/quarantineValidator.ts:326` `replayed = await helperFn(promoted)`; `:338` `answerEquals(replayed, expected)` | ✅ executes |
| `buildReplayTest` is INERT | `src/cli/workspace.ts:538-569` returns a metadata fingerprint (status/value/evidence flags); no re-mount, no re-execute, no `answerEquals` | ✅ inert — **P0 build target** |
| No cost-aware gate yet | `grep -rl "amortis\|inline_cost\|costAware" src/` → 0 hits | ✅ must build |
| Genericity sibling bug | `quarantineValidator.ts:186` filters on `sourceHash` only, not `intentSignature` (header line 11 says it should) | ✅ P1 fix |

## 8. Phased plan (kill criteria pre-registered)

**Learning-algorithm choice (mandatory, learning-algorithm panel):** path **(a) reflection-in-discipline FIRST and only** — the optimizer-LLM reads structured lineage + the rejected-shape buffer and proposes the next mutation, emitting CODE via the deterministic cascade. **Never call this "a learning algorithm"** — the honest term is *"SkillOpt's reflection optimizer re-targeted to emit executable code under a cost-aware executed gate."* Novelty is claimed at the **gate** and the **second optimizer**, never at optimizer-as-reflection. **Fork (b)** (DreamCoder / ReGAL / Stitch compression-driven library learning) is **deferred, out-of-scope-for-v1**; its graduation trip-wire **cannot even be read** until the gate, the executed runner, and **non-zero reuse** all exist (`libUsed > 0` — with zero reuse there is no library to learn over and (b) is vacuous). Only then, if across ≥3 tenants ×≥200 trajectories fork-a stalls at R7 < 0.6 AND ≥30% of cost-gate rejections are "helper too thin / boundary wrong", graduate.

### P0 — Smallest falsifiable experiment (kill-or-continue, ~3–4 days)
**Goal:** prove the gate's accept-set is non-empty for a **live-synthesised** helper on ≥1 DEPTH/serial corpus while correctly staying empty on the PokeAPI shallow-fan-out control.
**Build:** (1) the executed snippet runner behind `buildReplayTest` (`workspace.ts:538`) by generalising the working `replayOnTrajectory` executor (`:326`) — re-mount pinned snapshot, re-execute `commits/<id>/source.ts`, `answerEquals` fresh vs expected, measure re-run cost. (2) a ~50-line pure cost-aware gate comparator (PORT `skillopt_sleep/gate.py` `evaluate_gate`+`GateResult`, swap `select_gate_score` for §4 reward + R8 dual-gate). (3) an offline driver running both over a frozen paired corpus at k ≥ 5.
**Run:** PokeAPI k=5 (`0665d5a27`) as **negative control** (gate MUST stay empty) + one DEPTH corpus (OpenTraces dark-store family, armL +13.5pp, or a br/16-Criterion-3 deep-helper task) as candidate-positive.
**KILL:** across the depth corpus at k≥5, ≥~120 paired Qs, **zero** live-synthesised helpers satisfy `reward>0 ∧ per-pair≥0.70 ∧ Δquality≥−ε` AND PokeAPI control stays empty ⇒ concede the amortisation null and **stop before any milestone spend**. *Escape-hatch guard:* a **hand-authored** deep helper passing the gate does **not** save the thesis (that is shipping a curated SDK, no optimiser) — only a helper emitted by `author.ts`/`authorFromSource.ts` from a harvested trajectory counts.

### P1 — Make "oracle-free" honest (~2–3 days; ~20 LoC core)
De-circularise Tier 1 (determinism check, never an oracle); fix genericity sibling selection (intent-keyed, distribution-shifted, N≥k≥3, else quarantine); add `@source-hash` drift as a hard pre-replay gate forcing abstention. **Success:** a known stale-clone is REJECTED in a unit test; a correct helper passes on ≥k distinct same-intent args; drift forces abstention. **Kill:** answer space too low-cardinality for FAC to discriminate even at k≥3 → switch corpus or go Tier-3-only.

### P2 — Cost-aware gate v1 + honest baseline + corpus pre-screen (~4–6 days)
Build the **true paired frontier-inline adversary** (or restate the comparator); expand `amortised_lifetime_cost` to the full §4 spec (discovery tax + invocation TURNS + staleness penalty − inline saved); pre-register the **br/16 Criterion-3 corpus pre-screen as a HARD ENTRY gate** (cost-to-inline INCLUDING per-session discovery re-read tax MUST exceed cost-to-call) — **forbid PokeAPI/SkillCraft-shaped shallow fan-outs as value demos** (valid only as falsification controls). **Success:** gate PROMOTES an equally-correct-cheaper helper and REJECTS an arm4-class equally-correct-more-expensive helper in a paired test at k≥5, mid-p McNemar, BH-FDR on slices, ONE pre-registered cost endpoint. **Kill:** rejects everything even on the pre-screened depth corpus on the honest adversary → pivot to governance-only (P4) or concede.

### P3 — Fork-a synthesis loop + retrieval/governance second optimizer (~1.5–2 weeks)
Offline Loop A (deterministic cascade, cost-gated, `shapeHash`-keyed rejects); the **retrieve-vs-synthesize** decision (surface a helper ranked-first ONLY if cost-gate-estimated reuse cost < estimated inline cost — bootstrap the estimator from the paired Arm-1 baseline per intent cluster); **merge** same-intent/different-shape helpers (cure for the silent-wrong-sibling landmine), **split** a fat helper on sibling regression, **promote/demote** on the existing PSN ladder keyed on cost-gate wins (`score-r1-r9.ts:393-409`). **Success:** reuse FIRES (`libUsed>0`), R7 rises, net lifetime cost drops; merge collapses two clones into one parameterised helper passing intent-keyed genericity. **Kill:** `libUsed=0` even with ranked-first mandate + deep helpers (CRAG failure mode recurs) → no operating regime, concede.

### P4 — Governance-under-staleness as the HEADLINE (~1–2 weeks)
Run the full loop on **CRAG** (tri-state, −1 grader) and/or OpenTraces dark-store; **calibrate λ_stale only here**, where a declining governed helper beats a confident stale clone. **Success:** governed library beats ungoverned on the truthfulness-graded score (fewer −1s) net of cost — the verifier-gated-not-usage-gated win. **Kill:** governance inverts even on the tri-state grader (as it did on PokeAPI) → product reduces to cost-only, P0–P3 must carry it alone or the thesis is boundary-only.

### P5 — Cross-tenant Loop B (explicitly future-work, gated behind ≥2 real tenants)
Provider-side seed reshape with a per-tenant **no-regression veto** + human-adopt + full backup-before-adopt. Defer until Loop A + governance are proven.

## 9. Reuse from SkillOpt (PORT-FROM — the Python is not vendored here)

`gate.py` (`evaluate_gate`+`GateResult`+`select_gate_score`, ~50 lines pure stdlib) · `mine.py` `assign_splits` + `split_manifest.json` format (REAL-only in val/test) · `build_scheduler` + `decide_autonomous_learning_rate` (as "max library mutations/step") · `trainer.py` `step_buffer` (key by `shapeHash`) · `cycle.py` `run_sleep_cycle` (the Loop-A/B driver) · `harvest.py`+`harvest_codex.py` (read `~/.claude/projects/*.jsonl` + `~/.codex/archived_sessions/*.jsonl`, secret-redaction) · `slow_update.py` `build_comparison_pairs` (Loop-B reshape acceptance) · `rollout.py` `multi_rollout`+`contrastive_reflect` (k≥5 paired discipline) · `dream.py` `recall_similar` (top-k experience replay) · `staging.py` human-adopt contract · `budget.py` + `MockBackend` ($0 CI ceiling probe before live spend). **Cannot reuse:** the second optimizer — SkillOpt has no library to govern; build it on `shapeHash`/`intentSignature`/PSN-ladder/`apropos`/`df.d.ts`.

## 10. Risks (ranked)

1. **Falsification recurs (highest).** The gate's accept-set restricted to *live-synthesised* helpers may be provably empty across every corpus in evidence: where synthesis works the work is cheap-to-inline (CRAG `libUsed=0`, PokeAPI break-even infinite), and where the cost gate would accept (OpenTraces dark-store) the live synthesiser couldn't produce the helper (emergence was killed, a human authored it). **P0 detects this in ≤4 days; the corpus pre-screen excludes the falsified regime by construction.**
2. **Novel parts aren't built / built parts aren't novel.** As-implemented today CodeOpt = "Sleep emitting tools" (`buildReplayTest` inert, no cost gate, Sleep not vendored). Mitigation: the roadmap builds the executed gate FIRST; novelty claimed only at gate + second optimizer; re-label reuse as PORT-FROM and fork-a as "reflection re-targeted".
3. **Reuse doesn't fire** (a measured constant, not a tuning bug): frontier model re-derives inline regardless. P3 hard-gates on `libUsed>0`.
4. **Verifier circularity/thinness** → P1 fixes (demote Tier 1, intent-keyed multi-sibling genericity, drift-gated abstention).
5. **Fork-b premature attraction** → out-of-scope-for-v1; trip-wire unreadable until gate+runner+reuse exist.
6. **Cost-to-inline estimator is hard** → bootstrap from paired Arm-1 baseline, refresh as cheap secondary rollout.
7. **Statistical power** (n=6 negative; ±15pp noise) → enforce the br/19 spine (k≥5 seeds, pinned snapshots, ~236 paired Qs for 10pp, mid-p McNemar, BH-FDR, ONE pre-registered cost endpoint).
8. **λ_stale uncalibrated + Loop-B blast radius** (lowest) → calibrate λ_stale only on CRAG; Loop B future-work with per-tenant veto.

## 11. Adversarial verdict summary

All four skeptics returned **survives = true, with mandatory patches** (folded in above). The convergent finding across all four: *the parts that are novel aren't built, the parts that are built aren't novel, and the part that is both novel and built (the cost-aware executed gate) sits exactly on the regime where we already have a falsification* — which is why the build order is **executed runner → cost-aware gate → corpus pre-screen → governance headline**, and why the value claim is re-anchored from amortisation to governance-under-staleness. The irreducible, unrefuted delta: **prose can only be validated by the model re-reading it (oracle-bound, circular); code is validated by deterministic execution (oracle-free, model-independent).**
