# Plan: prove the learning loop learns generic intent, not data shape

> Living document. Update when direction shifts. Companion files:
> [EXPERIMENTS.md](./EXPERIMENTS.md) (curated results) and
> [EXPERIMENT_NOTES.md](./EXPERIMENT_NOTES.md) (chronological scratchpad).
> See [STATUS.md](./STATUS.md) for the achievements + remaining work
> snapshot at the start of this iteration cycle.

## Goal 5 (current, 2026-05-18): cross-benchmark generality — FinChain alongside SkillCraft

> Direction set by the user 2026-05-18 via `/goal`. Supersedes the
> Next-phase B1/B2/B3 queue below (B1 reproducibility re-eval remains a
> sub-deliverable inside Goal 5's bilateral non-regression check; B2
> insight layer and B3 cold-to-warm product flow are deferred until Goal
> 5 closes met). The framing is that Goal 4's iter164 MET, while real,
> stands on a single public benchmark; the substrate's commercial story
> requires demonstrating that the same substrate (no benchmark-specific
> code) lifts the published baseline on a *second*, structurally
> different public benchmark, while preserving the SkillCraft iter164
> result. FinChain (arxiv:2506.02515) is the chosen second benchmark —
> see `kb/br/16-post-skillcraft-benchmark-selection.md` for the
> selection rationale and the verified shape probe.

### Why Goal 5 exists (the cross-benchmark generality argument)

Goal 4's iter164 proved the learning loop fires under a learning-honest
rubric (R1-R9 all PASS, framework-bounded cache) on SkillCraft. The P1
matched-arm paired comparison (`{NEUTRAL, PASS, PASS, NEUTRAL}`) showed
the substrate's measurable contribution is cost efficiency (-41%
tokens, -17% wall-clock) under a strong agent backend, not correctness
(SkillCraft's pass-rate headroom on Claude sonnet-4-6 at low effort is
too narrow for a correctness signal). The P2 product-flow cross-eval
on jsonplaceholder revealed the substrate's *crystallisation policy* is
the open issue: agents pick helpers iff
`effort-to-call < effort-to-derive`. Thin auto-crystallised wrappers
(e.g. `toolFanout`) get bypassed in favour of inline 5-line
`Promise.all`; hand-authored rich helpers (`userPostSummary`) get
reused via the same skill-progressive-disclosure pipeline.

Together these say: the substrate's infrastructure (observer, snippet
runtime, hook registry, df.d.ts, lib/ overlay, AGENTS.md) works
generically; the *correctness story* needs a benchmark with more
compositional headroom AND a substrate that crystallises helpers above
the agent's inline-rewrite threshold. FinChain — 290 parameterised
templates × 10 seeds = 2,900 instances across 12 financial domains × 58
topics, with the paper documenting that frontier models still exhibit
"systematic weaknesses in long-horizon, compositional reasoning" on
advanced (4-step) templates — is the right second benchmark.

The commercial-release argument the project must support is: "the same
substrate code, with no benchmark-specific identifiers, lifts the
published baseline on *two* unrelated public benchmarks while
respecting Goal 4's learning-honest rubric on both." Goal 5 is the
experiment that produces that evidence.

### What proves Goal 5

A **bilateral rubric** combining iter164's R1-R9 (carried forward
verbatim from Goal 4) with three FinChain-specific gates. All
conditions evaluated from two paired runs (FinChain harness + SkillCraft
regression check) on the same substrate commit:

**Carried forward verbatim from Goal 4 (apply to BOTH benchmarks
where the gate is defined):**

- R1 `passRate ≥ 0.92` (substrate-ON arm on both benchmarks).
- R2 `avgEffectiveTokens ≤ 8,000` (both).
- R3 `runtimeErrorRate ≤ 0.05` (both).
- R4 `quarantine rate ≤ 0.03` (both).
- R5 novel-tenant smoke passes — zero substrate edits for a new tenant
  (single check, not per-benchmark).
- R6 **Convergence rate** ≥ 0.80 (of intent clusters with ≥ 2
  qualifying successful trajectories, ≥ 80% crystallise exactly one
  callable helper). Per-benchmark; cross-benchmark transfer measured
  separately in R9.
- R7 **Conditional reuse** ≥ 0.60 (of warm episodes where a
  same-intent crystallised helper is available, ≥ 60% call it;
  excludes the `per_entity` seed from the numerator). Per-benchmark.
- R8 **Conditional cost-drop** (dual gate) — paired same-intent reuse
  vs non-reuse episodes: `mean ≤ 0.70 AND per-pair pass-fraction ≥
  0.70`. Per-benchmark.
- R9 **Cross-shape transfer** — at least one `intentSignature`
  crystallises a helper reused across ≥ 2 SkillCraft families with
  different data shapes (Goal 4 R9 carried as-is). Goal 5 adds a
  stronger variant FC4 below for cross-*benchmark* transfer.

**Added (FinChain-specific gates):**

- **FC1** — FinChain Final Answer Correctness (ChainEval FAC) on
  substrate-ON Claude Sonnet 4.6 ≥ the paper's published Claude Sonnet
  4.5 score per difficulty tier (Basic/Intermediate/Advanced) from
  `https://mbzuai-nlp.github.io/finchain/leaderboard.html`. The
  per-tier breakdown is the right granularity because frontier models
  saturate Basic templates and break on Advanced; the substrate's
  expected lift is concentrated in Intermediate and Advanced.
- **FC2** — ChainEval step-alignment (the joint semantic + numerical
  intermediate-step scorer) ≥ the paper's published Claude Sonnet 4.5
  baseline on each tier. This is the *derivation visibility* gate —
  did the substrate help the agent get not just the answer right but
  the reasoning chain right.
- **FC3** — **Substrate-ON > Substrate-OFF** on FinChain, paired by
  template instance (same template + same seed across arms):
  paired-t-test p < 0.05 on FAC AND ≥ 10% reduction on warm-tier
  tokens-or-wall-clock for sibling cells. This is the matched-arm
  equivalent of SkillCraft's P1 comparison; the `DATAFETCH_DISABLE_LEARNING=1`
  control arm pattern is reused verbatim.

**Added (cross-benchmark generality gates):**

- **FC4** — Cross-benchmark transfer: at least one `intentSignature`
  crystallises a helper that is callable and called across ≥ 1
  SkillCraft family AND ≥ 1 FinChain topic. This is the proof that
  the substrate's intent-shape interface generalises across data
  shapes from two unrelated corpora.
- **FC5** — **Bilateral non-regression**: SkillCraft full-126 paired
  comparison on the Goal 5 substrate commit reproduces iter164's
  4-vector ≥ `{NEUTRAL, PASS, PASS, NEUTRAL}` with R1-R9 all PASS at
  iter164 levels under `cacheBoundedByFramework`. No per-family
  regression beyond the 3 P1 anti-patterns
  (pokeapi-pokedex / random-user-database / recipe-cookbook-builder),
  and ideally with those 3 also recovered by the post-P1 generic fixes
  already on main.

Goal 5 is MET when R1-R9 + FC1-FC5 all hold simultaneously on a single
substrate commit, evidenced by two paired-arm reports (FinChain +
SkillCraft) on the same code SHA.

### Harness shape (the implementation contract)

The FinChain harness mirrors SkillCraft's structure file-for-file so
substrate changes flow through both without per-benchmark adapters
above the runtime layer:

```
eval/finchain/
├── README.md                      — orientation, mirrors eval/skillcraft/README.md
├── protocol.md                    — eval protocol, mirrors skillcraft/protocol.md
├── rubric.md                      — R1-R9 + FC1-FC5 description (mirrors skillcraft/rubric.md)
├── runbook.md                     — operational notes
├── configs/                       — model configs (claude, codex-direct)
├── manifests/                     — per-topic-instance task manifests (generated)
├── adapters/                      — mount adapter (FinChain template → df.db env)
├── vendor/finchain/               — git submodule or pinned clone of mbzuai-nlp/finchain
├── scripts/
│   ├── prepare-finchain.sh        — clone vendor, generate manifests
│   ├── run-datafetch-finchain.sh  — paired-arm launcher (mirrors run-datafetch-skillcraft.sh)
│   ├── normalize-results.ts       — JSON → normalized.jsonl
│   ├── analyze-results.ts         — normalized.jsonl → analysis.json
│   ├── score-r1-r9.ts             — REUSES eval/skillcraft/scripts/score-r1-r9.ts via shared import
│   ├── score-finchain.ts          — FC1-FC5 scorer (FAC + step-alignment + paired comparison)
│   ├── p1-paired-analysis.py      — REUSES eval/skillcraft/scripts/p1-paired-analysis.py
│   ├── build-report.ts            — markdown report from analysis JSON
│   └── verify-harness.ts          — smoke
├── reports/                       — committed analysis JSONs (gitignored results, committed reports)
└── results/                       — per-run base directories (gitignored)

src/eval/finchainFullDatafetch.ts  — new runner, mirrors skillcraftFullDatafetch.ts
src/eval/finchainRecords.ts        — FinChain template → EvalRecord adapter
                                     (parallels src/eval/evalRecords.ts)
src/observer/__smoke__/finchain-mount.ts  — new smoke

package.json scripts:
  "eval:finchain": "tsx src/eval/finchainFullDatafetch.ts"
  "eval:finchain:prepare": "bash eval/finchain/scripts/prepare-finchain.sh"
  "eval:finchain:normalize": "tsx eval/finchain/scripts/normalize-results.ts"
  "eval:finchain:analyze": "tsx eval/finchain/scripts/analyze-results.ts"
  "eval:finchain:report": "tsx eval/finchain/scripts/build-report.ts"
  "eval:finchain:verify": "tsx eval/finchain/scripts/verify-harness.ts"
```

The mount adapter converts each FinChain template instance into the
same `EvalRecord` shape that SkillCraft uses, with the difference that
the "record set" for a template instance is the symbolic parameter
state and the gold reasoning trace, not a list of entities. This is
the cleanest interpretation: the substrate sees `df.db.records` as the
template parameters; `df.lib.*` carries the crystallised reasoning
helpers; the agent's job is to produce the final answer + the
intermediate steps. ChainEval runs against the trajectory.

The paired-arm control reuses `DATAFETCH_DISABLE_LEARNING=1` verbatim
— no harness-side change. The matched-arm pattern from P1
(`eval/skillcraft/results/datafetch/goal4-p1-paired-comparison-20260517.md`)
is the template for the FinChain headline report.

### The new substrate lever: composition density

P2's diagnosis ("agents pick helpers iff `effort-to-call <
effort-to-derive`") is the load-bearing constraint for Goal 5. On
FinChain Basic templates, a frontier model can re-derive the formula
inline in tokens; the substrate cannot win there. The substrate's
advantage emerges on Intermediate and especially Advanced templates
where multi-step computation increases re-derivation cost.

This implies one new substrate lever for Goal 5:

**Lever (new) — composition-density gate** in `src/observer/gate.ts`
and/or `src/observer/template.ts`. The observer's crystallisation gate
should accept a trajectory only when the helper it would author is
sufficiently richer than the inline-rewrite alternative. Concrete
candidates: (a) minimum composition depth (≥ 2 `df.lib` calls, or
≥ 3 distinct primitives, or ≥ a token-count delta against a measured
inline baseline); (b) typed-input clarity (named struct vs positional
args; surface in `@insight` field if B2 lands); (c) reject pure
single-call wrappers unless they encode non-trivial parameter
defaults. Generic, applies to any benchmark, must not regress
SkillCraft's `toolFanout` crystallisation (which IS rich enough by the
P1 evidence to give -41% tokens).

The existing levers from Goal 4 carry forward unchanged:
intent-signature crystallisation key, convergence gate, nested-call
extractor, parameterised authoring, smoke-replay promotion, discovery
surface ranking.

### Iteration schedule for Goal 5

Mirrors Goal 4's pattern: iters 0-2 are infrastructure (no substrate
behaviour change), iter 3+ measures + iterates. The estimated
iteration count is ~10-15 to account for the new harness, the new
rubric scorer, the substrate composition-density lever, and the
bilateral non-regression check on every iteration.

| iter | hypothesis / deliverable | lever |
|---|---|---|
| 0 ← IN PROGRESS | this PLAN.md § Goal 5 section + `kb/plans/007-finchain-integration.md` + `experiments/archive/2026-05-goal5-finchain/headline-rows.md` skeleton; no code change; `pnpm test` + `pnpm typecheck` stay green | docs only |
| 1 | dataset study + mount adapter design: how each of FinChain's 290 templates becomes a SkillCraft-shaped task; family/level mapping (Basic/Intermediate/Advanced ≈ e/m/h); the EvalRecord shape for symbolic parameters; document in `eval/finchain/protocol.md`. No runtime code. | docs + design |
| 2 | harness skeleton: `eval/finchain/` tree + `src/eval/finchainFullDatafetch.ts` + `src/eval/finchainRecords.ts` + the pnpm scripts; smoke at `src/observer/__smoke__/finchain-mount.ts` runs against one template (e.g. `investment_analysis/ci.py` template 1); no full run; `pnpm test` green with 7 smokes | harness |
| 3 | single-topic probe under both arms (substrate-ON, substrate-OFF) on a moderate-difficulty topic (`investment_analysis/ci.py` template 3, Intermediate); paired-arm smoke at ~30 episodes; confirm FAC scorer + step-alignment scorer produce numbers; commit `eval/finchain/scripts/score-finchain.ts` | scoring |
| 4 | substrate-OFF FinChain baseline at ~100-200 episodes (size matched to evaluation budget); establish the published-baseline reference for FC1/FC2 | measurement |
| 5 | substrate-ON FinChain at same size; compute FC1-FC5 first time; SkillCraft regression check (P1 paired-comparison re-run on Goal 5 substrate commit) → first bilateral scorecard | measurement |
| 6+ | substrate iteration loop: each iter targets a failing FC gate, implements via the composition-density lever or an existing Goal 4 lever, single-topic probe, fixed-pair validate `{one SkillCraft family, one FinChain topic}`, full bilateral run, headline row, EXPERIMENTS.md entry | substrate |
| N | all R1-R9 + FC1-FC5 PASS on a single substrate commit; STATUS.md updated; Goal 5 closed | declare met |

Stop conditions: R1-R9 + FC1-FC5 all hold simultaneously on the
bilateral run, OR 15 accepted iterations, OR 96 hours of compute
elapsed.

### Working procedure (cadence rules)

Same as Goal 4 with the bilateral non-regression check added:

1. **Hypothesis.** One sentence; expected delta on one FC or R gate;
   update PLAN.md if priority shifts.
2. **Implement.** Generic lever only — `src/observer/`, `src/snippet/`,
   `src/hooks/`, `src/eval/`, `src/sdk/`, `src/discovery/`,
   `src/server/`. Never family/template/topic-specific. No conditional
   logic keyed on benchmark identifier.
3. **Probe.** Single FinChain topic (and/or single SkillCraft family
   if the lever touches SkillCraft surface). Require: per-task pass +
   token delta vs prior iteration baseline.
4. **Validate.** Fixed pair: one SkillCraft family
   {`university-directory-builder`} + one FinChain topic (TBD in
   iter 1 — pick a Intermediate-tier topic from
   `investment_analysis/` for stability). Require: combined pass + at
   least one FC gate moves.
5. **Bilateral full run.** FinChain at chosen size (4-shard parallel)
   + SkillCraft full-126 regression (4-shard parallel). Both on the
   same substrate SHA. Commit two scorecard JSONs.
6. **Headline row.** Append to
   `experiments/archive/2026-05-goal5-finchain/headline-rows.md`.
   Mirror the Goal 4 archive table.
7. **Hygiene.** `pnpm typecheck` clean, `pnpm test` green (7+ smokes),
   working tree committed. The novel-tenant smoke must stay green
   every iteration.
8. **Bilateral non-regression check.** SkillCraft regression scorecard
   must hold R1-R9 PASS at iter164 levels under
   `cacheBoundedByFramework`. If not, iter is REJECTED and the
   substrate change is reverted or generalised before the next attempt.

### Forbidden behaviours (Goal 4 list carried verbatim, scoped to BOTH benchmarks)

Goal 5 is NOT met if the transcript reveals any of (Goal 4 list,
extended to FinChain identifiers):

- Code that pattern-matches on SkillCraft *or* FinChain family names,
  task keys, bundle names, topic names, template names, or specific
  tool/primitive identifiers (no `if family === ...`,
  `if topic === ...`, `if templateName.startsWith('ci_')`).
- Pre-baked seed helpers under `seeds/<tenantId>/` or
  `<baseDir>/lib/<tenantId>/` shipped to disk *before episode 1*
  (`<datafetchHome>/lib/__seed__/` remains permitted; the `per_entity`
  seed stays).
- Prompt-template branches keyed on dataset / family / tier / topic
  identity.
- Hardcoded payload field defaults inside `df.tool` / `df.lib` proxies
  for specific tools or specific FinChain template signatures.
- Bypassing the hook registry: `<baseDir>/hooks/<tenantId>/` stays the
  trust gate, `df.lib.<name>` stays the public contract, learned
  bodies remain replaceable, quarantine stays active, per-tenant
  layout preserved.
- New server-side LLM call paths that substitute for the agent's own
  composition. Observers learn FROM agent attempts.
- Benchmark-shaped envelope keys in the substrate's envelope-unwrap
  allowlist (the Codex audit on 2026-05-17 removed `pokemon`,
  `species`, `show`, `university`, `details`; no FinChain-shaped keys
  may be added — the generic success/ok-envelope rule covers them).

All measured helpers must be observer-crystallised from earlier
same-run episodes. The lib-cache directory must start empty per tenant
for each fresh run.

### What "done" looks like for Goal 5

Before declaring Goal 5 met, surface in the same turn:

- Both scorecards: `eval/finchain/results/datafetch/<run-base>/{analysis.json,r1-r9-scorecard.json,finchain-scorecard.json}`
  and `eval/skillcraft/results/datafetch/<run-base>/r1-r9-scorecard.json`.
- The FinChain per-difficulty-tier breakdown (Basic / Intermediate /
  Advanced × FAC + step-alignment + token + wall-clock).
- The SkillCraft per-tier breakdown (train / warm / hard × pass +
  helpers-available + reuse + tokens).
- The cross-benchmark transfer evidence (which `intentSignature`
  crystallised which helper, reused across which SkillCraft family AND
  which FinChain topic — this is FC4).
- The bilateral 4-vector verdict for SkillCraft regression:
  `{≥NEUTRAL, ≥PASS, ≥PASS, ≥NEUTRAL}` vs iter164 baseline.
- The substrate commit SHA used for both runs.
- The headline row diff in
  `experiments/archive/2026-05-goal5-finchain/headline-rows.md`.
- The `pnpm test` count (7+ smokes + ≥ 374 vitest).
- Confirmation EXPERIMENTS.md has the final iteration's entry and
  EXPERIMENT_NOTES.md is up to date.
- A note on which Goal 5 iterations (G5.0..G5.N) contributed the
  decisive movement and whether the composition-density lever was
  load-bearing.

When all of the above are surfaced and R1-R9 + FC1-FC5 are all PASS on
the same substrate commit, Goal 5 is closed met and STATUS.md is
updated to reflect cross-benchmark generality as the headline.

---

## Next phase (2026-05-17, SUPERSEDED 2026-05-18): definitive re-eval + insight layer + product-flow validation

> **SUPERSEDED 2026-05-18 by Goal 5 above.** B1 reproducibility re-eval
> is absorbed into Goal 5's bilateral non-regression check (every Goal
> 5 iteration re-runs SkillCraft as the regression arm). B2 insight
> layer and B3 cold-to-warm product flow are deferred until Goal 5
> closes met.

> Goal 4 declared MET on iter164 with caveats (see `goal.md` § "POST-MET"
> and `STATUS.md` § "Current state"). The user pivoted on 2026-05-17 to
> the VFS+code-mode-as-learning-interface framing. SkillCraft has served
> its purpose. Three overnight goals queued.

### B1 — iter168 honest re-eval

**Hypothesis:** iter164's R1-R9 MET is a reproducible substrate
property, not a single-shot Anthropic-uptime artifact.

**Lever:** measurement only. No substrate changes. Re-run Claude
full-126 under the tightened scorer (dual R8 + `cacheBoundedByFramework`
+ benchmark-envelope-keys removed).

**Setup:**
- Backend: `DATAFETCH_AGENT=claude`, `claude-sonnet-4-6`, effort `low`,
  `CLAUDE_CLI=claude-p` (default).
- 126 rows, 21 families × 6 levels, sequential lib-cache hydration.
- Run base: `goal4-iter168-full126-claude-honest-reval-20260517`.

**Success:** R1-R9 all PASS simultaneously, under the iter164 gates +
the tightened R8 dual gate.

**Stop:** one run. Variance is the answer regardless of pass/fail.

### B2 — insight layer probe

**Hypothesis:** Memory-Transfer / Insight pattern (Paper 5 in
`experiments/archive/2026-05-goal4-skillcraft/post-iter164-paper-digests.md`): high-level insight memories (title +
description + generalised content) transfer better than raw helper
bodies. Adding an `@insight` YAML field to crystallised helpers should
enable semantic selectivity — the agent reads insight BEFORE deciding
to invoke, not just whether the type signature fits.

**Lever:** observer-side. `src/observer/author.ts` stamps an `@insight`
field auto-generated from intent signature + first 2 trajectories'
sample entities + cluster signature.

**Setup:**
- Implement `@insight` stamping in author.ts (single string field).
- Render `@insight` in `df.d.ts` surface (`src/server/manifest.ts`).
- Surface `@insight` in `apropos`/`man` (`src/discovery/librarySearch.ts`).
- Single-family probe on usgs-earthquake-monitor (cleanest cluster
  structure from iter164 evidence). 6 rows.
- Compare e2-h1 with vs without the `@insight` rendering.

**Success criterion:** measurable next-episode benefit (≥ +5pp R7
reuse rate OR ≥ -10% effective tokens) attributable to insight
rendering alone.

**Stop:** 1 probe + 1 validate. If neither moves, table the direction.

### B3 — cold-to-warm via product flow

**Hypothesis:** the substrate's cold-to-warm wins (proven on FinQA Q1
→ Q2 4→1 call collapse) generalise to real product flow without
SkillCraft scaffolding.

**Lever:** harness. Use the existing novel-tenant smoke
(`src/observer/__smoke__/novel-tenant.ts`) as departure point. Build a
3-5 episode product-flow harness using the actual substrate
(`pnpm datafetch:run`, real VFS, real bash, no SkillCraft tools).

**Setup:**
- New tenant id, real (not stubbed) tool bundle, 3-5 manually-written
  episodes.
- e1 = cold (empty lib-cache); e2-e5 = warm.
- Measure: helper crystallisation rate, helper reuse, episode cost
  delta (the FinQA-style cost-panel metrics: mode flip, tier drop,
  top-level call count collapse).

**Success criterion:** at least one helper crystallises from e1; at
least one e2-e5 episode demonstrably calls a learned helper; episode
cost drops between cold and warm.

**Stop:** the harness either works or it doesn't. ≤ 2 iterations.

### New paper backlog (informational)

Four papers under consideration alongside the already-covered
ReGAL / PSN / SkillX:

- **Paper 5 — Memory Transfer / Insight** (arxiv:2604.14004) →
  drives B2 above
- **Paper 6 — f(x) → f(g(x)) composition** (arxiv:2509.25123) →
  addresses the R6 compositional cluster gap (codex-direct full-126
  miss); future work
- **Paper 7 — UCT critic-gated tool creation** (arxiv:2602.01983) →
  full ReGAL-style replay with critic; future work
- **SkillCraft itself** (arxiv:2603.00718) → established skill-based
  learning works; our unique contribution is VFS+code-mode mechanism

See `experiments/archive/2026-05-goal4-skillcraft/post-iter164-paper-digests.md` for full digests +
substrate-file-level targets.

---

## Goal 4 (MET, 2026-05-17): intent-convergence crystallisation + a learning-honest rubric

> Direction set by the user 2026-05-14, after Goal 3's iter9-15:
> "I worry that we are not generic enough in our approach. We want our
> solution to be robust and work across use cases and learn the right
> intent-shape interface when intent emerges across runs, agnostic of
> the shape of the data underneath."

---

### ⇨ HANDOFF (2026-05-14) — read this first

**Status: iters 1-7 are DONE. Goal 4 is NOT met.** The iter-7
instrumented full-126 ran on Codex `gpt-5.4-mini` because Sonnet was
429-walled; it completed cleanly but failed R1/R2/R3/R6/R7/R8. The next
step is iter 8 — a targeted fix, not a rerun of the same full setup.
A fresh-context agent picking this up should start here.

**What is built and committed** (`b3b2e18c` → `21ec6b46` on `main`):

| iter | deliverable | commit | verified |
|---|---|---|---|
| 1 | `eval/skillcraft/scripts/walk-artifacts.ts` — artifact walker; makes R6-R9 scoreable | `b3b2e18c` | dry-score on iter14 data |
| 2 | `eval/skillcraft/scripts/intent-cluster-analysis.ts` — offline analyzer; de-risk verdict PROCEED | `16a6dea5` | 146 traj → 55 clusters, 17 cross-family, 0 incoherent |
| 3 | `intentSignature` on `CallTemplate` + `extractNestedTemplates` | `c7d44f7b` | behaviour-preserving, unit tests |
| 4 | `src/observer/convergenceIndex.ts` + gate check #7 + worker rewrite + eval hydrate/persist | (in `c7d44f7b`..`a5d06ffb` range) | tvmaze probe: helpers accrue 0→0→1→1→2→3, 6/6 pass |
| 5 | `renderFanOutSource` in `author.ts` — parameterised fan-out authoring | `a5d06ffb` | tvmaze probe: `...Ne` helpers parameterised, 5/6 pass |
| 6 | `src/observer/__smoke__/cross-shape-transfer.ts` — R9 proof | `d8c6bc8f` | 8/8 — widgets-learned helper runs on gadgets |
| R9 harness | `__intent__/` shared pool wired into the eval hydrate/persist | `21ec6b46` | typecheck + 269 tests + 5 smokes |
| 7 | Codex `gpt-5.4-mini` instrumented full-126 + R1-R9 scorecard | latest Goal 4 docs/harness commit | `126` episodes; R1 `0.8492`, R2 `39,240.4`, R3 `0.0952`, R4 pass, R5 test green, R6 `0.1333`, R7 `0`, R8 null, R9 weak/seed-mediated pass |

`pnpm test` after iter 7 is green: smoke scripts pass, novel-tenant is
`11/11`, and Vitest is `269/269`.

**ITER 7 RESULT — instrumented full-126 on Codex `gpt-5.4-mini`:**

```
Run base: eval/skillcraft/results/datafetch/goal4-iter7-full-20260514-142538
Scorecard: eval/skillcraft/results/datafetch/goal4-iter7-full-20260514-142538/r1-r9-scorecard.json
```

The model-switch finding is important but not enough: the newer/cheaper
model works mechanically only via `/Users/jayfarei/.bun/bin/codex`
(`0.130.0`), not the old Homebrew `codex` (`0.77.0`), but the full run
misses correctness and token gates badly.

**The NEXT STEP — iter 8**: target the structural R6/R7 gap. The clearest
diagnostic is that the dominant cluster
`db→FANOUT(tool,6+,cycle1)→lib` has 44 successful trajectories but no
callable learned helper attached in the scorecard. `signatureJoinDiagnostic`
also shows only `2/5` helper signatures intersecting the `45` cluster
signatures and `23` crystallised helpers with no usable signature. This
points at nested/sub-signature joining and learned-helper availability/reuse
before the seed-retirement stretch.

**Things a fresh agent must know:**
- The Stop hook is bound to `@../experiments/PLAN.md`. The CWD for
  commands is `/Users/jayfarei/src/tries/2026-05-01-hackathon` (not
  `docs/`).
- `DATAFETCH_CONVERGENCE_N` env var sets the convergence threshold
  (default 2). The demo pins it to 1.
- The convergence gate means crystallisation NO LONGER happens on a
  single trajectory — e1 records intents, e2 converges. Any new smoke
  or test that expects crystallisation must run the crystalliser twice.
- The persisted hook manifests have empty `origin.trajectoryIds` (they
  are re-created on lib-cache hydration). The crystallised `.ts` file
  headers (`@shape-hash`, `@intent-signature`, `@origin-trajectory`) are
  the only stable provenance — `walk-artifacts.ts` reads the headers.
- Codex backend details from iter 7: set
  `CODEX_BIN=/Users/jayfarei/.bun/bin/codex` for newer models such as
  `gpt-5.4-mini`; use `CODEX_SANDBOX=workspace-write` for eval runs.
  The prompt now tells agents to stay inside the episode workspace.
- mid-iteration probe bug-fixing is expected; budget for it.
- Commit cadence: one commit per iter, `pnpm test` green + typecheck
  clean before each commit.

---

### Why Goal 4 exists

Goal 3 (iter9-15) made the learning loop fire on SkillCraft: full-126
landed 88.9% pass, the loop crystallises helpers, the novel-tenant
smoke proves zero-substrate-edit onboarding (Goal 3 part B). But three
thresholds stayed unmet — `avgLearnedInterfacesAvailable warm ≥ 2.0`,
`avgReuseRate warm ≥ 0.30`, `warm/train tokens ≤ 0.70` — and the user's
diagnosis is that **those thresholds, and the observer that feeds them,
over-fit to SkillCraft's per-entity-fan-out data shape.**

The current observer keys crystallisation on `shapeHash` — a hash of
the *syntactic* trajectory (concrete primitive names + field names).
Two tenants doing structurally identical work over different data never
share a learned interface. The substrate ships a hand-written
`per_entity` seed that bakes in the fan-out assumption.

Goal 4 rebuilds the crystallisation key around **intent**, not shape,
and revises the rubric to measure **whether the loop genuinely learns
and benefits from learning** — not whether a SkillCraft-shaped helper
count hits an arbitrary number.

### What proves Goal 4

A **learning-honest rubric** (replaces Goal 3's 7-of-7). Keep the
honest correctness/cost/trust gates; replace the three shape-proxy
thresholds with loop-honesty measurements. All conditions evaluated
from a single instrumented full-126 + the smokes:

**Kept (unchanged — honest gates):**
- R1 `passRate ≥ 0.92` — the loop must not regress correctness.
- R2 `avgEffectiveTokens ≤ 8,000` — substrate stays Claude-cheap.
- R3 `runtimeErrorRate ≤ 0.05`.
- R4 `quarantine rate ≤ 0.03`.
- R5 novel-tenant smoke passes — zero substrate edits for a new tenant
  (Goal 3 part B, carried forward).

**Revised (shape-proxy → loop-honesty):**
- R6 **Convergence rate** (replaces `avgLearnedInterfacesAvailable ≥ 2.0`):
  of the intent clusters observed with ≥ 2 qualifying successful
  trajectories, ≥ 80% crystallise exactly one callable helper. Measures
  "the loop learns from *convergence*, not from a single trajectory" —
  cluster-keyed, not family-keyed, so it is not SkillCraft-shaped.
- R7 **Conditional reuse** (replaces `avgReuseRate warm ≥ 0.30`): of
  warm episodes where a same-intent crystallised helper is available,
  ≥ 60% call it. Excludes the `per_entity` seed from the numerator —
  only *learned* helper reuse counts. Measures helper *usefulness*, not
  blanket reuse.
- R8 **Conditional cost-drop** (replaces `warm/train tokens ≤ 0.70`):
  episodes that reused a crystallised helper cost ≤ 70% of the nearest
  earlier same-intent *non-reuse* episode (a paired same-intent delta,
  not a blanket tier ratio — warm-tier difficulty confounds the old
  ratio).

**Added (the genuine-generality proof):**
- R9 **Cross-shape transfer**: the same `intentSignature` crystallises
  a helper that is reused across ≥ 2 SkillCraft families with *different
  data shapes* (different db collections, different tool bundles).
  Requires a deliberate transfer harness — today's lib-cache is
  family-partitioned. This is the data-shape-agnostic proof.

> R6-R9 are not measurable from today's normalized rows (counts only,
> no helper names/origins/intent-signatures). **Goal 4 iter 1 is metric
> instrumentation** — without it the rubric is unscoreable.

### Substrate redesign (the five changes)

**Change 1 — `intentSignature` (data-shape-agnostic crystallisation key).**
PINNED SPEC v2 (validated by iter 2's offline analyzer over the iter14
full-126 + iter15 subset — 146 trajectories → 55 clusters, 22
multi-trajectory, 17 cross-family, 0 incoherent):
- Map each top-level call to a CATEGORY: `db` / `lib` / `tool`.
  Concrete primitive + field names are dropped — this is what makes
  the key data-shape-agnostic.
- Collapse a maximal run of ≥ 2 *consecutive* SAME-CATEGORY calls into
  `FANOUT(category, degreeBucket, cycle<distinctInputShapes>)`.
  degreeBucket ∈ {2, 3-5, 6+}. Fan-out detection is on category ALONE
  (not input-field-set) — keying on field-set fragments interleaved
  multi-tool fan-out (`A,B,C,A,B,C`); category-only collapses it.
- Each FANOUT node carries STRUCTURAL slots: `varyingFieldCount` /
  `sharedFieldCount` (input fields whose value differs across the run
  vs constant). Concrete field names are report-only, NEVER in the key
  — v1 used nominal slots and produced an 18-name union on the top
  cluster, which would make parameterised authoring impossible.
- signature = `→`-joined skeleton.
`db.records.findExact → tool.tvmaze.getInfo(id)×3 → lib` and
`db.cases.search → tool.finqa.getCase(case_id)×5 → lib` both hash to
`db→FANOUT(tool,3-5,cycle1)→lib`. The dominant SkillCraft intent
`db→FANOUT(tool,6+,cycle1)→lib` spans 10 families with different data
shapes — that IS the `per_entity` pattern, learnable from convergence.
The offline analyzer (`eval/skillcraft/scripts/intent-cluster-analysis.ts`)
is the reference implementation; iter 3-4 ports it into the observer.

**Change 2 — nested-call crystallisation.** Extend
`extractCandidateTemplates` to also crystallise from calls with
`scope.depth ≥ 1`, grouped by `scope.parentPrimitive` (NOT by
contiguity — the parent `lib.*` call is recorded *after* its nested
calls). So `lib.per_entity`'s internal `tool.A/B/C` fan-out becomes its
own crystallisable intent, independent of the wrapper. (User flagged
this as the highest-value reuse lever.)

**Change 3 — convergence index + gate.** A per-tenant on-disk index
`intentSignature → [{trajectoryId, shapeHash, varyingParams}]`, living
in the **shared run cache** (not per-episode `datafetchHome`) with
atomic append that tolerates the 4-shard race. The gate crystallises
only when an `intentSignature` has ≥ N entries (default 2; production
wants 3). First trajectory of a new intent is *recorded, not
crystallised*; the second convergent one triggers crystallisation.
N=2 may starve some 6-episode families — acceptable because R7/R8 are
*conditional* (they only score families where a helper exists).

**Change 4 — parameterised authoring over the converged cluster.**
RISKIEST + historically under-scoped. Today's author replays *one*
trajectory and parameterises literal inputs; it does not infer a
generalised helper from a *cluster*. Naive "fields that vary become
inputs, constants stay in the body" freezes `toolBundle`/`toolName`
when the first two cluster examples are same-family — which kills
cross-shape transfer (R9). Scope: implement parameterised authoring
**only for the one proven fan-out signature** first; the capability
slots from Change 1 are *always* promoted to parameters even if the
first cluster examples happen to share them.

**Change 5 — retire the `per_entity` seed (stretch, last).** Once
Changes 1-4 reliably learn the fan-out interface from convergence, the
seed is a cold-start crutch. Goal 4's stretch: demonstrate the
substrate learns the equivalent of `per_entity` *without shipping it*
on ≥ 1 family. Premature until R6-R9 hold with the seed in place.

### The biggest risk + the cheap de-risk

**Risk:** over-coarse `intentSignature`s feed an under-powered author,
producing "generic" helpers that are actually wrong or unusable — and
we only discover it after a $30 full-126.

**De-risk (Goal 4 iter 2, before touching the observer gate):** build
an **offline analyzer** over the existing iter14/iter15 trajectory
artifacts. It computes candidate `intentSignature`s, groups
trajectories into clusters, reports **cluster purity**, shows
varying-vs-constant fields per cluster, and emits **dry-run helper
schemas without writing any helper**. If the top clusters do not
produce obviously stable, sensible schemas, the redesign stops here and
we reconsider the signature spec. No substrate code changes until the
offline analyzer proves the signatures cluster cleanly.

### Iteration schedule for Goal 4

| iter | hypothesis / deliverable | lever |
|---|---|---|
| 1 ✓ | metric instrumentation: artifact walker (`walk-artifacts.ts`) records per-episode helper names / called-helper identities / seed-vs-learned / origin / quarantine. **DONE** — commit `b3b2e18c`. Dry-score confirmed the thesis (shapeHash: 1/28 convergent clusters). | eval tooling |
| 2 ✓ | offline `intentSignature` analyzer (`intent-cluster-analysis.ts`). **DONE** — commit pending. Verdict: PROCEED. v2 spec pinned in Change 1. 146 traj → 55 clusters, 22 multi-trajectory, 17 cross-family, 0 incoherent. | offline tooling |
| 3 ✓ | `intentSignature` + nested-call extraction in the observer. **DONE** — commit pending. `intentSignature` added to `CallTemplate` (computed as metadata); `extractNestedTemplates` groups depth≥1 calls by `scope.parentPrimitive`. Behaviour-preserving: the gate still uses `shapeHash`; iter 4 wires both in. 261 tests pass. | observer template |
| 4 ✓ | convergence index + intent-convergence gate. **DONE** — commit pending. `convergenceIndex.ts` (append-only JSONL); gate check #7 (crystallise only at ≥ N=2 distinct convergent trajectories); worker records qualifying candidates + wires `extractNestedTemplates`; eval hydrate/persist carries the index per-family. Smokes updated to run the crystalliser twice (convergence is the new behaviour). 268 tests pass. | observer gate + new index module |
| 5 ✓ | parameterised fan-out authoring. **DONE** — commit pending. `renderFanOutSource` in author.ts: a pure tool fan-out template is authored as a per_entity-shaped helper with `toolBundle`/`toolNames`/`paramName` ALWAYS as input params (never frozen from the template's concrete primitives). Verified: body uses `df.tool[input.toolBundle]`, no frozen bundle. 269 tests pass. | observer author |
| 6 ✓ | cross-shape transfer smoke. **DONE** — commit pending. `src/observer/__smoke__/cross-shape-transfer.ts`: a fan-out helper crystallised from tenant A's "widgets" data shape, transferred, invoked on tenant B's "gadgets" data shape (different bundle/tools/param) — 8/8, R9 proven. Wired into `pnpm test`. | transfer harness (test infra) |
| R9 ✓ | cross-family transfer harness wired into the eval. **DONE** — commit `21ec6b46`. `__intent__/` shared pool: parameterised fan-out helpers promoted (deduped by `@intent-signature`), hydrated into every family. | eval harness |
| 7 ✓ | instrumented full-126 against R1-R9. **DONE** on Codex `gpt-5.4-mini`; run completed but Goal 4 failed: R1/R2/R3/R6/R7 miss, R8 unscored, R4/R5 pass, R9 weak/seed-mediated pass. | measurement |
| 8 ← IN PROGRESS | targeted fix for iter-7 gap. First hooks-draft probe proved actual non-seed `toolFanout6PlusCycle1` reuse in tvmaze `m2`/`h1`, but the run is not accepted: pass `5/6`, avg effective tokens `37,990.8`, one runtime error, and exact-signature R6/R7 still fail/null. Next lever: compositional sub-intent coverage + pass/cost improvement, not a full-126. | matches gap |

Stop conditions: R1-R9 all hold simultaneously on the instrumented
full-126 + smokes, OR 8 accepted iterations, OR 24 hours elapsed.

### Working procedure (cadence rules)

Same as Goal 3, with one addition: **iters 1-2 ship NO substrate
behaviour change** — instrumentation + offline analysis only. The
observer gate is not touched until iter 4, and only after the iter-2
offline analyzer demonstrates clean clusters.

1. **Hypothesis.** One sentence; update PLAN.md if priority shifts.
2. **Implement** against the observer / hook registry / snippet
   runtime. Never family-specific.
3. **Probe.** Single family, lib-cache on. From iter 4 onward.
4. **Validate.** Fixed pair {university-directory-builder,
   jikan-anime-analysis}.
5. **Full-126.** Family-sequential, 4-shard parallel. Commit a headline
   row to [`archive/2026-05-goal4-skillcraft/hook-registry-iteration-headlines.md`](archive/2026-05-goal4-skillcraft/hook-registry-iteration-headlines.md).
6. **Hygiene.** `pnpm typecheck` clean, `pnpm test` green, working tree
   committed. The novel-tenant smoke must stay green every iteration.

### Forbidden behaviours (carried from Goal 3, unchanged)

The condition is NOT met if the transcript reveals any of:

- Code that pattern-matches on SkillCraft family names, task keys,
  bundle names, or specific tool identifiers.
- Pre-baked seed helpers under `seeds/<tenantId>/` or
  `<baseDir>/lib/<tenantId>/` shipped to disk *before episode 1*.
- Prompt-template branches keyed on dataset / family / tier identity.
- Hardcoded payload field defaults inside `df.tool` / `df.lib` proxies.
- Bypassing the hook registry.
- New server-side LLM call paths that substitute for the agent's own
  composition. Observers learn FROM agent attempts.

All measured helpers must be observer-crystallised from earlier
same-run episodes; the lib-cache starts empty per tenant per run.

### What "done" looks like for Goal 4

Surface in the same turn: the instrumented analysis JSON path; the R1-R9
scorecard; the test count; the per-tier breakdown; the cross-shape
transfer evidence (which `intentSignature` crystallised which helper,
reused across which families); and a note on whether `per_entity` could
be retired.

---

## Goal 3 (closed, partial): prove the learning loop is generic, code-mode-native, cost-effective

> Closed 2026-05-14 at 3/7 thresholds. Headline: the learning loop
> fires end-to-end on the new harness; full-126 = 88.9% pass after the
> normalizer fix; Goal 3 part B (novel-tenant smoke) passes 11/11. The
> three unmet thresholds (`avgLearnedInterfacesAvailable warm ≥ 2.0`,
> `avgReuseRate warm ≥ 0.30`, `warm/train tokens ≤ 0.70`) were diagnosed
> as over-fitting to SkillCraft's data shape — Goal 4 supersedes them
> with a learning-honest rubric. Commits: `0d0ea4df` (iter9-13 substrate
> + 3 bugfixes), `bfd8c847` (normalizer false-negative fix), `82cf6688`
> (iter15 EvalRecord entity-id contract). Full iter9-15 detail in
> EXPERIMENTS.md.

### Goal 3 original definition (preserved for context)

> Spirit of the project, framed by the user 2026-05-13:
> "VFS-based approach with bash commands as the verbiage to interact
> with it. The goal is a generic solution that works out of the box.
> Nothing needs to be encoded at the substrate level for any given
> tenant; the interface improves per tenant from what we learn from
> the agent's usage on that tenant. Cost-effective. Prove that code
> mode is the core primitive for dynamic and adaptive interfaces
> that learn through usage."

Translation into substrate properties to defend on this goal:

- **Generic at ship time.** Zero tenant-specific code, prompt
  branches, or data-shaped defaults in `src/`. The substrate ships
  with the generic learning mechanism (observer, hook registry,
  snippet runtime, generic seeds whose names are substrate-level not
  benchmark-level). The substrate-level seed renamed `per_entity`
  (not `sc_per_entity`) reflects this.
- **Per-tenant adaptation accrues from usage.** Each tenant's
  `<baseDir>/lib/<tenantId>/` and `<baseDir>/hooks/<tenantId>/`
  evolve from observed agent trajectories on that tenant. A second
  tenant gets its own per-tenant evolution from its own usage; the
  substrate does not pre-bake any of it.
- **Code-mode-native interface.** The agent's only interaction
  surface is filesystem (workspace files), bash (`pnpm
  datafetch:run scripts/probe.ts`), and `df.*` calls inside snippets.
  No bespoke tool APIs. The substrate is consumed via VFS-shaped
  affordances.
- **Cost-effective.** Claude tier (3-8k effective tokens / episode)
  with no model-cost regression. The substrate's value scales with
  reuse, so warm tokens drop further as the loop fires.
- **Loop fires through usage.** Trajectories drive crystallisation;
  no LLM call inside the observer; no synthetic seed-data shipped
  per tenant.

### What proves the spirit

Goal 3 holds when both of the following are true:

**(A) SkillCraft 7-of-7 condition on full-126.** Same seven thresholds
as Goal 2:

- `arms["datafetch-learned"].passRate` ≥ 0.92
- `arms["datafetch-learned"].avgEffectiveTokens` ≤ 8,000
- `arms["datafetch-learned"].runtimeErrorRate` ≤ 0.05
- `avgLearnedInterfacesAvailable` warm ≥ 2.0
- `avgReuseRate` warm ≥ 0.30
- warm-tier avg tokens ≤ 70% of train-tier on the same run
- quarantine rate ≤ 0.03

**(B) Novel-tenant smoke test.** Mount a small dataset that is *not*
SkillCraft (one new tenant id, 4-6 generic records, a tool bundle
borrowed from the SDK or stubbed via the test harness) and run 2-3
episodes through code mode. Required:

- Zero changes to substrate-level code (`src/observer/`,
  `src/hooks/`, `src/snippet/`, `src/sdk/`, `src/adapter/`) to make
  the new tenant work.
- The observer crystallises at least one helper under
  `<baseDir>/lib/<new-tenant-id>/` from the first passing episode.
- A second episode on the same tenant sees and calls that helper
  (`libCalls > 0` in its trajectory).

The novel-tenant smoke test lives under
`src/observer/__smoke__/novel-tenant.ts` (extends the existing
`__smoke__` pattern). It is the substrate's "works out of the box"
proof.

### Why both proofs are needed

(A) without (B) means we tuned to SkillCraft.
(B) without (A) means the substrate learns but doesn't produce a
defensible benchmark result.
Both together means the substrate is generic, learns through usage,
and produces measurable wins on a public benchmark — the claim the
project makes.

### Goal 2's residual gaps and how Goal 3 closes them

Goal 2's iterations established that the substrate's learning loop
fires end-to-end on the new harness (`src/eval/skillcraftFullDatafetch.ts`)
with codex as the agent, but the seven thresholds are not met
simultaneously because:

- **Codex burns 10-20× more tokens per episode than Claude** (60-130k
  vs 3-8k). With codex, `avgEffectiveTokens ≤ 8,000` is unreachable.
- **Claude with the iter5 wiring ignores the new primitives** in
  favour of its trained `df.tool` fan-out pattern. The seed and the
  `df.db.records` mount are visible in df.d.ts, but the agent doesn't
  reach for them.
- **The observer crystallises one helper per family** (shape-hash
  dedup catches similar trajectories), so `avgLearnedInterfacesAvailable ≥ 2.0`
  on warm is structurally unreachable today.

Goal 3 closes those three gaps so the same 7-of-7 condition becomes
achievable in a single Claude-driven full-126 run.

### Substrate changes required

The valid levers in the cadence rules already cover what's needed:
*observer gate*, *snippet runtime*, *prompt template*, *df.lib discovery
surface*, *quality-gated df.answer*. No new lever surface.

**Lever 1 — Claude uses the new primitives.** Commit-phase validator in
the snippet runtime: when `df.db.records` is mounted for this episode,
require that `scripts/answer.ts`'s trajectory contain at least one
`df.lib.*` call OR at least one `df.db.records.*` call. If neither
is present, return `df.answer({status: "unsupported"})` with a reason
explaining the substrate-rooted path was not used. The validator only
gates commit-phase artefacts (the final answer.ts), not probe runs;
the agent can probe freely. Risk: lower pass rate while the agent
adjusts. Mitigation: gate-only-on-mounted-records (so non-SkillCraft
tenants are unaffected).

Implementation:
- `src/snippet/runtime.ts` adds a `requireSubstrateRootedChain`
  session-context flag.
- `src/eval/skillcraftFullDatafetch.ts` sets the flag when
  `mountedRuntime` is non-null.
- The runtime, after the snippet's commit-phase trajectory is recorded,
  checks the call sequence. If neither `db.*` nor `lib.*` appears,
  it rewrites the snippet's answer envelope to `status: "unsupported"`
  with `reason: "substrate-rooted chain absent"`.

Expected delta: Claude's first scripts/answer.ts goes through the
validator, gets a structured nudge, the agent re-probes and writes
a chain that satisfies the validator. Pass rate dips on the first
pass and recovers; reuse-rate climbs because every committed
trajectory now has at least one substrate-rooted call.

**Lever 2 — Multiple helpers per family.** Two complementary moves:

(a) *Sub-graph extractor in the observer*. Today
`src/observer/template.ts` extracts the whole-trajectory shape. A
trajectory like `db.records.findExact -> tool.A -> tool.B -> tool.C -> lib.sc_per_entity`
gets compressed to one shape-hash, one helper. Extend the extractor
to also propose sub-graphs whose entry is a `db.*` call and whose
boundary is the first `lib.*` or `tool.*` call that consumes the
db output. For SkillCraft-shaped trajectories this would yield (i)
a helper that wraps `db.records.findExact -> sc_per_entity` and (ii)
a helper that wraps the per-entity fan-out alone.

(b) *Multi-shape seed pattern* (lower-leverage, simpler). Ship two
seeds, not one: `sc_per_entity` (fan-out, already done) and
`sc_aggregate_one` (single-entity helper). Trajectories that use both
present two distinct shape-hashes to the observer.

Pick (a) first; (b) is the fallback if sub-graph extraction proves
too noisy.

**Lever 3 — Discovery surface ranking.** Today `df.d.ts` lists
helpers in mtime order. Re-rank by `(maturity, success_count, recency)`
descending: validated-typescript first, then candidate-typescript
with high success counts, then the seed. Add a one-line `intent`
comment per helper above its declaration. The agent's eye lands on
the most useful helpers first.

Lever: `src/sdk/schemaRender.ts` (the `df.d.ts` renderer) reads the
hook registry's success stats.

Expected delta: warm-tier `helpersUsed/helpersAvailable` ratio climbs.

### Pass conditions (unchanged from Goal 2)

All seven must hold simultaneously on the latest full-126:

- `arms["datafetch-learned"].passRate` ≥ 0.92
- `arms["datafetch-learned"].avgEffectiveTokens` ≤ 8,000
- `arms["datafetch-learned"].runtimeErrorRate` ≤ 0.05
- `arms["datafetch-learned"].avgLearnedInterfacesAvailable` averaged
  over the warm tier (n=84) ≥ **2.0**
- `arms["datafetch-learned"].avgReuseRate` averaged over the warm
  tier ≥ **0.30**
- Warm-tier average effective tokens ≤ 70% of train-tier average
- Quarantine rate (episodes with `hook_quarantined` stderr) ≤ 0.03

Stop conditions: all seven hold simultaneously, OR 8 accepted iterations,
OR 24 hours elapsed.

### Iteration plan

| iter | hypothesis | lever |
|---|---|---|
| 9 | commit-phase substrate-rooted validator nudges Claude to use df.lib when df.db is mounted | snippet runtime |
| 10 | sub-graph extractor lifts warm helpers-available from 1 → 2+ | observer template |
| 11 | df.d.ts re-rank lifts warm reuse-rate above 0.30 | df.lib discovery |
| 12 | smoke-replay gate cuts quarantine rate | hook registry |
| 13 | novel-tenant smoke test passes with zero substrate edits | smoke harness (test infra) |
| 14 | full-126 dry run, identify any remaining 7-of-7 gaps | none (measurement) |
| 15-16 | targeted fix per remaining-gap finding | matches gap |

After each iter: probe (SkillCraft single-family) → validate
(univ + jikan) → (full-126 if probe+validate clear the gate) → commit
headline row to `experiments/archive/2026-05-goal4-skillcraft/hook-registry-iteration-headlines.md` AND confirm the
novel-tenant smoke is still passing (no regression on the generality
claim).

---

## Goal 2 (preceding, partial completion)

Reach the iter4 pass rate (≥ 92% pass ≥ 70 on the full SkillCraft
126-task surface) on a single, sequentially-ordered, lib-cache-enabled
run, AND demonstrate that the substrate's learning loop is doing
measurable work, measured from a fresh `pnpm eval:skillcraft:analyze`
output.

Pass conditions (all must hold simultaneously on the latest full-126):

- `arms["datafetch-learned"].passRate` ≥ 0.92
- `arms["datafetch-learned"].avgEffectiveTokens` ≤ 8,000
- `arms["datafetch-learned"].runtimeErrorRate` ≤ 0.05
- `arms["datafetch-learned"].avgLearnedInterfacesAvailable` averaged
  over the warm tier (n=84) ≥ **2.0**
- `arms["datafetch-learned"].avgReuseRate` averaged over the warm
  tier ≥ **0.30**
- **Warm-tier average effective tokens ≤ 70% of train-tier average**
  effective tokens on the same run (the "gets cheaper with reuse"
  claim, as a number)
- Quarantine rate (episodes with `hook_quarantined` stderr) ≤ 0.03
  across the full 126

Stop conditions: any of the above holds, OR 8 accepted iterations,
OR 24 hours elapsed.

## Why this goal

Every iter1-4 full-126 run was launched with `--no-lib-cache`. We
reached 94.4% pass with the learning loop deliberately disabled. The
substrate's headline value proposition, "agents get cheaper and
smarter with reuse", has never been validated end to end on a public
benchmark. Pass rate alone is not the right metric anymore. The right
metric is the *differential* between train-tier cost and warm-tier
cost on a single run where the observer was allowed to crystallise
helpers in train and the agent was allowed to call them in warm.

If we hit this goal, the website's claim becomes a number anyone can
reproduce. If we cannot hit it, that is itself an important finding
about what is broken in the substrate's learning path and exactly the
kind of thing the substrate roadmap needs to fix before client
release.

## Status (2026-05-12)

E1+E1.5 surfaced that the newer harness (`src/eval/skillcraftFullDatafetch.ts`, the Goal-1 path) strips `df.db.records` mounting and seed-helper setup; the substrate's learning loop has no substrate-rooted chain to crystallise from. E2+E3 confirmed the loop fires cleanly on the *older* harness (`src/eval/skillcraftDatafetch.ts`) which retains both:

- 6 families, 36 episodes, 100% correctness, -79% warm tokens vs baseline, 83% warm reuse, 0 regressions, 0 quarantines.
- 6 of 7 goal thresholds clear on this pilot. Only `avgLearnedInterfacesAvailable ≥ 2.0` fails: the observer crystallises one helper per family by design.

The remaining work splits into two tracks.

### Track A: port substrate-mount + seed onto the Goal-1 path

The current new harness has the Goal-1 substrate wins (auto-invoke trailer, 300s timeout, multi-turn probe, claude driver, 94.4% pass on the 126-task surface) but lost the loop's preconditions. Port from `skillcraftDatafetch.ts`.

Implementation steps in order:

1. **Generic entity extractor.** Survey shows all 21 families' `initial_workspace/*.json` follow the pattern `{<entity_collection_key>: [...entities], output_file: "..."}`. The entity-collection key is the only non-"output_file" array-valued top-level key. Extract entities by: load JSON, find the array-valued top-level key whose name is not "output_file", return its array. No family-name match. Lives in `src/eval/skillcraftFullDatafetch.ts` as a helper function.

2. **Per-family `df.db.records` mount.** Use the existing `EvalMountAdapter` (`src/eval/skillcraftDatafetch.ts` lines 235-320) verbatim. Records = the entities array from step 1, normalised to `{id, family, entity, label, ...originalFields}` shape. Mount with `mountId = "skillcraft-${family}"`, register on each episode's `installSnippetRuntime` setup, pass `mountIds: [mountId]` in the `sessionCtx`. Pure config; no family-specific behaviour.

3. **Generic seed body `sc_per_entity`.** One seed function for ALL families. Body shape:
   ```ts
   async body({entityIds, toolBundle, toolNames, paramName}) {
     const results = [];
     for (const id of entityIds) {
       const calls = await Promise.all(toolNames.map(t =>
         df.tool[toolBundle][t]({[paramName]: id})
       ));
       results.push({entityId: id, calls});
     }
     return {value: results};
   }
   ```
   Drop under `<datafetchHome>/lib/__seed__/sc_per_entity.ts` before episode 1 of every family. NOT under `<baseDir>/lib/<tenantId>/`, so outside the forbidden path list.

4. **Prompt template update.** Teach the agent two new things:
   - `const entities = (await df.db.records.findExact({}, 999));` reads the entity list.
   - `df.lib.sc_per_entity({entityIds, toolBundle, toolNames, paramName})` fan-out call.
   The template references neither family names nor specific tool identifiers; the agent reads `tool_manifest.json` to learn which bundle/tools/param-name to pass.

5. **Smoke + probe.** Single-family probe on tvmaze. Verify the e1 trajectory has `db.records.findExact -> lib.sc_per_entity` chain. Verify the observer crystallises a wrapper helper after e1. Verify e2's `libFunctionsAvailable >= 2` (the seed + the crystallised wrapper, both visible).

6. **Validate + full-126.** Standard cadence.

Expected outcome: keep ~94% pass, add ~50-80% warm token reduction, clear all 7 thresholds on the full-126.

### Track A: constraint check

- ✓ "No code that pattern-matches on SkillCraft family names": generic entity extractor finds the non-"output_file" array key, family-agnostic.
- ✓ "No pre-baked seed under `seeds/<tenantId>/` or `<baseDir>/lib/<tenantId>/`": seed lives in `<datafetchHome>/lib/__seed__/`, neither forbidden path.
- ✓ "No prompt-template branches keyed on family identity": template is the same across all families; tool_manifest.json is the variable input.
- ✓ "No hardcoded payload defaults inside df.tool/df.lib proxies for specific tools": the proxy stays generic; the agent supplies `toolBundle`, `toolNames`, `paramName` at call time.
- ✓ "No bypassing the hook registry": the seed is registered as a hook like any other library function.
- ✓ "No new server-side LLM call paths": no new LLM invocations.
- ⚠ "No manually pre-loaded hooks": the seed IS pre-loaded under `__seed__/`. The forbidden list explicitly cites `seeds/<tenantId>/` and `<baseDir>/lib/<tenantId>/` paths, not `__seed__`. The user's earlier framing (2026-05-12, "single family to extrapolate") acknowledged seeding as a valid cold-start init step. The `__seed__` location preserves the spirit of "no tenant-specific pre-loads".

If the user wants a strictly-no-seed path, the alternative is Track C below.

### Track C: relax the gate for fan-out aggregation (no seeds)

Substantive observer work in `src/observer/template.ts` and `src/observer/gate.ts`:

1. New template-extractor `extractFanOutTemplate`: detect "N calls of the same primitive with the same shape input, varying only one parameter" and synthesize a helper `process(entityIds, ...sharedInputs)` that loops.
2. Extend `shouldCrystallise` to accept fan-out trajectories. Heuristic: ≥ 2 calls of the same primitive with identical input shape except one parameter; outputs aggregated; no `db.*` required.
3. Trajectories with pure `tool.*` fan-out (every SkillCraft trajectory) become learnable.

Effort: substantial. ~6-8 hours.

Risk: false-positive crystallisations on trivial trajectories (e.g., two `tool.api.X` calls that don't represent a reusable pattern). Mitigation: require ≥ 3 calls in the fan-out group, require the varying parameter to be a literal value, exclude trajectories where the calls were already wrapped in a learned helper.

This track satisfies the goal's no-seed constraint fully. Pick if the seed approach is unacceptable.

### Track B: make `avgLearnedInterfacesAvailable ≥ 2.0` achievable

The observer crystallises one helper per family because the seed-shaped task surface produces only one distinct trajectory shape. Two paths to >1 helper per family:

- Sub-graph crystallisation (PLAN's E7): extract multiple sub-helpers from a single trajectory.
- Diversify the seeds: ship 2-3 seeds per family with distinct intents, so cold trajectories produce 2-3 distinct shapes and the observer crystallises one per shape.

Track B is optional. The user may decide that the spirit of "loop fires" is established by E3's headline and that the 2.0 threshold can be relaxed or measured differently.

## Initial direction (DEPRECATED; preserved for context)

The first experiment is "turn the flag on and measure". Do not change
the substrate. Run the existing iter4 stack with `lib-cache` enabled
and family-sequential execution, and see what falls out. Treat that
output as the new baseline. Everything after that aims to close the
gap between that baseline and the goal thresholds.

### E1, baseline with lib-cache on (no substrate change)

The hill-climb scripts use `--no-lib-cache`. Remove that flag from
`scripts/iter1-full.sh`. The harness already supports per-tenant
`libCacheDir` and the observer already runs on `onTrajectorySaved`.
Make the four shards execute their families sequentially (e1 → e2 →
e3 → m1 → m2 → h1) sharing the same lib-cache directory per family.
Expected: pass rate similar to iter4 (≈ 94%), but with non-zero
`avgLearnedInterfacesAvailable` and `avgReuseRate` on the warm tier.

If E1 already passes the goal, we are done. If E1 shows hooks being
crystallised but never reused, the gap is *discovery*. If E1 shows
crystallisation but bad hooks getting reused and crashing, the gap is
*trust*. Everything below targets one of those gaps.

### E2, smoke-replay promotion gate (substrate, hook registry)

When the observer authors a `candidate-typescript` body for a hook,
immediately replay it against the trajectory inputs that birthed it
and require deep-equal of the recorded output. If matched, promote
to `validated-typescript` (callable). If not matched, demote to
`candidate-typescript` with callable-with-fallback and emit a
structured warning. This closes the "first bad helper poisons the
second episode" failure class.

Lever: hook registry (`src/hooks/registry.ts`,
`validateImplementation`). The trajectory record carries inputs and
outputs already; the work is in the replay step plus the promotion
decision.

Expected: quarantine rate drops, callable-rate climbs, warm-tier
reuse climbs because the agent sees more "callable" helpers and fewer
"callable-with-fallback".

### E3, observed-only hooks (observer)

When the agent calls `df.lib.<name>` and the name does not exist,
capture it as `implementation.kind: "none"` with the input shape. This
is the demand signal for the next set of helpers to author. Even if
the agent's first call fails (because the helper doesn't exist), the
shape is recorded; the next episode that *does* succeed at the same
shape can crystallise a callable body for the now-known intent.

Lever: observer gate + `df.lib` proxy (`src/snippet/dfBinding.ts`,
`src/observer/worker.ts`). Today a call to a missing `df.lib.<name>`
just returns a structured `unsupported` envelope; we are not yet
recording the demand signal it carries.

Expected: `avgLearnedInterfacesAvailable` climbs because the system
now learns *what the agent wished existed*, not just what worked.

### E4, quality-gated `df.answer` in commit phase

`df.answer` already runs a quality heuristic and attaches advisory
warnings. In commit phase, refuse to commit `status: answered` when
the heuristic trips. The agent must either iterate (re-probe, fix)
or commit `status: partial` / `status: unsupported`. Honest unsupported
is preferable to confidently wrong.

Lever: `src/snippet/answer.ts` + commit-phase gate in the snippet
runtime. The pieces are there; the gate is not wired.

Expected: pass rate may *drop slightly* on the eval (some answered-but-
wrong now become unsupported) but the trajectories that *do* commit are
cleaner training input. Warm-tier reuse-rate climbs because the
observer learns from less polluted commits.

### E5, observer iteration-warning

Detect when the same shape-hash is being rewritten across episodes
without converging (more than N rewrites in M episodes). This is a
sign the helper is not generalising; emit a structured warning and
refuse to overwrite the existing body until the agent commits a
different shape.

Lever: observer (`src/observer/gate.ts`).

Expected: defensive, prevents thrash. Should not move pass rate on its
own; included for the trust-rate cap (≤ 3% quarantine).

### E6, discovery surface ranking

`df.d.ts` lists every callable hook. Today the order is mtime. The
agent reads it top to bottom. Re-rank by reuse stats (success count,
recency, validated-typescript first). Add a one-line description per
hook from the manifest's `intent`. This is a cheap intervention: the
agent already has the hooks; we are just helping it find the right
one.

Lever: `src/sdk/schemaRender.ts` (the `df.d.ts` renderer).

Expected: warm-tier `helpersUsed` / `helpersAvailable` ratio climbs
without changing what is in `lib/`.

### E7, sub-graph crystallisation (observer template extractor)

Today the observer extracts whole-trajectory templates. If a
trajectory contains two reusable sub-graphs (one for "fetch and
normalise an entity", one for "compose a summary from N entities"),
only the whole pipe is learned. Extract sub-graphs as separate
candidate hooks. This is the highest-effort substrate change and
should come last; only attempt if E1-E6 fail to clear the warm-tier
reuse-rate threshold.

Lever: `src/observer/template.ts`.

Expected: `avgLearnedInterfacesAvailable` rises sharply on the warm
tier as sub-graphs from train compose into warm-tier solutions.

## Working procedure (cadence rules)

Same shape as the prior goal:

1. **Hypothesis.** One sentence claim about which lever moves which
   learning-loop metric and by how much. Update PLAN.md if the
   priority order needs to shift.
2. **Implement** against the hook registry, observer, or snippet
   runtime. Never family-specific.
3. **Probe.** Single family with lib-cache enabled. Required:
   - ≥ +5pp pass vs the iter4 baseline on that family
   - At least one helper authored during the train phase (e1)
   - At least one helper reused during warm (e2-m2)
4. **Validate.** Fixed rotation pair {university-directory-builder,
   jikan-anime-analysis}. Required:
   - ≥ +3pp combined pass vs iter4 baseline
   - ≥ 30% reuseRate on the warm tier of either family
5. **Full-126.** Family-sequential, lib-cache shared per family.
   4-shard parallel. Commit the new headline row to
   [`archive/2026-05-goal4-skillcraft/hook-registry-iteration-headlines.md`](./archive/2026-05-goal4-skillcraft/hook-registry-iteration-headlines.md)
   with analysis + error-taxonomy JSONs.
6. **Hygiene.** `pnpm typecheck` clean, `pnpm test` ≥ 242 tests
   passing, working tree committed.

After each iteration, append an entry to EXPERIMENTS.md and a
chronological note to EXPERIMENT_NOTES.md.

## Forbidden behaviours

Verbatim from the goal definition. Condition is NOT met if the
transcript reveals any of:

- Code that pattern-matches on SkillCraft family names, task keys,
  bundle names, or specific tool identifiers
- Pre-baked seed helpers under `seeds/<tenantId>/` or
  `<baseDir>/lib/<tenantId>/` shipped to disk *before episode 1* of
  the run
- Prompt-template branches keyed on dataset / family / tier identity
- Hardcoded payload field defaults inside `df.tool` / `df.lib`
  proxies for specific tools
- Bypassing the hook registry: `<baseDir>/hooks/<tenantId>/` stays
  the trust gate, `df.lib.<name>` stays the public contract, learned
  bodies remain replaceable, quarantine stays active, per-tenant
  layout preserved
- New server-side LLM call paths that substitute for the agent's own
  composition (observers learn FROM agent attempts, they don't make
  attempts of their own)

All measured helpers must be observer-crystallised from earlier
same-run episodes. The lib-cache directory must start empty per
tenant for each fresh run.

## What "done" looks like

Before declaring the goal met, surface in the same turn:

- The analysis JSON path
- The headline row diff (added to `archive/2026-05-goal4-skillcraft/hook-registry-iteration-headlines.md`)
- The test count (`pnpm test`)
- A per-tier breakdown table:

  | tier | n | pass ≥70 | avg tokens | helpers available (avg) | helpers used (avg) | reuse rate |
  |---|---|---|---|---|---|---|
  | train | 21 | ... | ... | ... | ... | ... |
  | warm | 84 | ... | ... | ... | ... | ... |
  | hard | 21 | ... | ... | ... | ... | ... |

- A note on which experiments (E1..En) ended up contributing the
  decisive movement.

## Working files

| file | purpose |
|---|---|
| [PLAN.md](./PLAN.md) | living plan, updated when direction shifts |
| [EXPERIMENTS.md](./EXPERIMENTS.md) | curated experiments with hypothesis, change, result, lessons |
| [EXPERIMENT_NOTES.md](./EXPERIMENT_NOTES.md) | chronological scratchpad, real-time thoughts |
| [archive/2026-05-goal4-skillcraft/hook-registry-iteration-headlines.md](archive/2026-05-goal4-skillcraft/hook-registry-iteration-headlines.md) | the committed headline-row table per iteration |

EXPERIMENTS.md is the most important of the three. Every experiment,
successful or not, gets an entry. The entry is what the next iteration
reads first.
