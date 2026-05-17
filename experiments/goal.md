# Datafetch progressive-improvement goal

This document holds the canonical `/goal` condition strings for
driving iterative improvement of datafetch's adaptive-retrieval
substrate against the SkillCraft evaluator, **without** over-fitting
to that dataset.

It is not a runtime artifact. It exists so that whoever opens
`/goal` in a future session can paste a tested, reviewed condition
rather than re-inventing one. Goal 4 (current) at the top; Goals 3,
2, 1 preserved below for historical reference.

## Goal 4: intent-convergence crystallisation + learning-honest rubric

> Status (2026-05-17): **MET on iter164 with caveats**, under the
> `cacheBoundedByFramework` cache rule. See § "POST-MET" below for
> the Codex audit + reframe. See § "Resume condition (post-iter167)"
> for the overnight goals.

The substrate should learn the right **intent-shape interface** when
intent emerges across runs — agnostic of the data shape underneath.
Goal 3's iter9-15 made the loop fire (88.9% pass on full-126, 3/7
thresholds) but the three unmet thresholds and the observer that feeds
them over-fit to SkillCraft's per-entity-fan-out data shape. Goal 4
rebuilds the crystallisation key around **intent** (data-shape-agnostic)
and replaces the three shape-proxy thresholds with **loop-honesty**
measurements.

**Progress (2026-05-14 after G4.7): iters 1-7 are DONE. Goal 4 is
NOT met.** The iter-7 instrumented full-126 was run on Codex
`gpt-5.4-mini` because Sonnet was 429-walled. The run completed all
126 episodes and produced the R1-R9 scorecard, but failed the Goal 4
gates:

- Run base:
  `eval/skillcraft/results/datafetch/goal4-iter7-full-20260514-142538`
- Scorecard:
  `eval/skillcraft/results/datafetch/goal4-iter7-full-20260514-142538/r1-r9-scorecard.json`
- R1 `0.8492` fail; R2 `39,240.4` effective tokens fail; R3
  `0.0952` fail; R4 `0.0263` pass; R5 novel-tenant smoke pass via
  `pnpm test`; R6 `0.1333` fail; R7 `0` fail; R8 unscored; R9 passes
  only weakly/seed-mediated via `perEntity`.

Model/runtime note: `/opt/homebrew/bin/codex` is too old for
`gpt-5.4-mini`; use `CODEX_BIN=/Users/jayfarei/.bun/bin/codex` for
newer Codex models. The valid iter-7 run used
`CODEX_SANDBOX=workspace-write`.

The block below is the **resume prompt** for a fresh `/goal` session.
Use a short `/goal` that points here, e.g.:
`/goal Continue Goal 4 iter 8 — follow the resume instructions in experiments/goal.md § "Goal 4 (current)". Iter 7 full-126 is done; iter-8 hooks-draft probe proved non-seed toolFanout reuse but did not clear pass/cost/R6/R7. Target compositional sub-intent coverage plus pass/cost improvement before any full-126.`

Resume instructions (iter 8):

```
Continue Goal 4 iter 8. Repo root /Users/jayfarei/src/tries/2026-05-01-hackathon is the CWD for all commands (NOT docs/). Read experiments/PLAN.md § "⇨ HANDOFF" first. Iters 1-7 are DONE; do NOT rerun iter 7 unless deliberately comparing a different model. Iter-8 has partial evidence, not an accepted small gate: `goal4-iter8-probe-tvmaze-hooksdraft-20260514` got 5/6 pass and actual non-seed `toolFanout6PlusCycle1` calls in m2/h1, but avg effective tokens stayed ~38k, one runtime error remained, and exact-signature R6/R7 failed/null.

Goal 4 still holds only when R1-R9 all hold simultaneously on ONE instrumented full-126 run + the smokes:
R1 passRate >= 0.92. R2 avgEffectiveTokens <= 8000. R3 runtimeErrorRate <= 0.05. R4 quarantine rate <= 0.03. R5 novel-tenant smoke passes with zero substrate edits.
R6 convergence rate — of intent clusters with >=2 qualifying successful trajectories, >=80% crystallise exactly one callable helper. R7 conditional reuse — of warm episodes where a same-intent crystallised helper is available, >=60% call it (per_entity seed EXCLUDED from the numerator). R8 conditional cost-drop — episodes that reused a crystallised helper cost <=70% of the nearest earlier same-intent NON-reuse episode. R9 cross-shape transfer — the same intentSignature crystallises a helper reused across >=2 families with different data shapes.

Iter-7 evidence:
- Valid Codex gpt-5.4-mini run: eval/skillcraft/results/datafetch/goal4-iter7-full-20260514-142538
- R1/R2/R3/R6/R7 failed; R8 had no paired reuse episodes; R4/R5 passed; R9 was weak/seed-mediated.
- normalizerCrossCheck.ge70ButNotPassed = 0.
- signatureJoinDiagnostic: 2/5 helper signatures intersect 45 cluster signatures; 23 crystallised helpers have no usable signature.
- Clearest gap: the dominant cluster db→FANOUT(tool,6+,cycle1)→lib has 44 successful trajectories but no callable learned helper attached in R6.
- Per-tier: train 20/21 pass, warm 70/84, hard 17/21; avg effective tokens 41.2k / 39.2k / 37.6k.

Recommended iter-8 target: decide and implement compositional sub-intent coverage for R6/R7 (the learned helper signature `FANOUT(tool,6+,cycle1)` sits inside `db→FANOUT...` / `FANOUT...→lib` trajectories), then prove pass + token improvement in hooks-draft small probes. Retire-the-seed stretch is premature until R6/R7 move. If comparing Codex models, set CODEX_BIN=/Users/jayfarei/.bun/bin/codex; the old Homebrew codex rejects gpt-5.4-mini.

Cadence per iter: read EXPERIMENTS.md first (G4.1-G4.8 entries are the priors); state one hypothesis; implement against observer/hooks/snippet-runtime, never family-specific; probe single-family then validate {university-directory-builder, jikan-anime-analysis} for behaviour-changing iters; full-126 4-shard only after the probe/validate signal; pnpm typecheck clean + pnpm test green + working tree committed; append an EXPERIMENTS.md entry + EXPERIMENT_NOTES.md note.

Gotchas: CWD is the repo root (not docs/). The convergence gate means crystallisation NO LONGER fires on a single trajectory — any new test/smoke that expects a helper must run the crystalliser twice. Persisted hook manifests have empty origin.trajectoryIds — the crystallised .ts headers (@shape-hash, @intent-signature, @origin-trajectory) are the only stable provenance. ALWAYS re-check the normalizer: a timed-out agent (agentExitCode=143) that still wrote a valid answer must not be demoted to infrastructure_error. DATAFETCH_CONVERGENCE_N overrides the convergence threshold (default 2). eval/skillcraft/results/ is gitignored, so run artifacts don't pollute the working tree.

NOT met if the transcript reveals: code pattern-matching on SkillCraft family/task/bundle/tool identifiers; pre-baked seeds under seeds/<tenantId>/ or <baseDir>/lib/<tenantId>/ before episode 1; prompt-template branches keyed on dataset/family/tier identity; hardcoded payload defaults in df.tool/df.lib proxies; bypassing the hook registry; new server-side LLM call paths substituting for the agent's composition. The per_entity seed under lib/__seed__/ remains a permitted cold-start crutch until a later seed-retirement iteration proves the substrate can learn the fan-out interface without it.

Before declaring met, surface: the R1-R9 scorecard, the instrumented analysis JSON path (<D>/analysis.json), pnpm test count, the per-tier breakdown, the cross-shape transfer evidence, a note on whether per_entity can be retired, and confirmation EXPERIMENTS.md has the final iteration's entry.
```

> The pre-iter-1 Goal 4 condition (the full 8-iteration plan from
> scratch) is preserved in git history at commit `506c009c`; the
> iter-7-from-step-(a) resume prompt is preserved at `227cf6b7`.

### Goal 4 — iter164 evidence (2026-05-16)

Run: `eval/skillcraft/results/datafetch/goal4-iter164-full126-claude-clean-20260516`
Backend: `claude --print`, `claude-sonnet-4-6`, effort `low`. 126 rows.

Scorecard (all 8 official R1-R9 gates PASS, R5 external green):

- R1 `0.9365` PASS (118/126; ≥ 0.92)
- R2 `1610.6` PASS (≤ 8000)
- R3 `0.0079` PASS (1 runtime error; ≤ 0.05)
- R4 `0` PASS (no quarantined crystallised helpers; ≤ 0.03)
- R5 GREEN — `pnpm test` shows 356/356 across 42 test files
- R6 `1.0` PASS (perfect convergence on all qualifying clusters; ≥ 0.80)
- R7 `0.8551` PASS (warm-tier same-intent reuse; ≥ 0.60)
- R8 `0.6665` PASS (mean paired ratio; ≤ 0.70)
- R9 `FANOUT(tool)` PASS (cross-shape transfer across 4+ families)

Per-tier: train 19/21, warm 80/84, hard 19/21.
Fanout slot diagnostics: 49 slots, 23 verified, 0 suspect, 0 reject.

### Goal 4 — POST-MET: Codex audit + reframe (2026-05-17)

A Codex adversarial review on 2026-05-17 caught three issues in the
iter164 declaration:

1. **Cache-token measurement bug.** `score-r1-r9.ts` normalizer was
   silently dropping `agentCachedInputTokens`. iter164's "0/126 cache
   nonzero" claim was an artifact; real value is 126/126 cache>0
   (`claude --print` / `claude-p` applies framework-level prompt
   cache unavoidably).
2. **R8 mean-only gate let pairs with 1.0+ ratios in.** Tightened to
   a dual gate: mean ≤ 0.70 AND per-pair pass-fraction ≥ 0.70.
3. **Benchmark-shaped envelope keys leaked.** `pokemon`, `species`,
   `show`, `university`, `details` had ended up in the substrate's
   envelope-unwrap allowlist. Removed; the generic success/ok-envelope
   rule covers them.

**Resolution: the cache qualification is reframed as
`cacheBoundedByFramework`.** Reject only inter-episode state leak
inside our substrate (iter164 has zero of this); accept framework-
level prompt caching the agent CLI applies and cannot be turned off.
**iter164 re-validates under the tightened scorer as PASS on R1-R9 +
framework-bounded cache; FAILS strict cache-tokens-zero.** The user
accepted the reframe on 2026-05-17.

The Goal 4 condition therefore holds **only under the framework-bounded
cache rule.** Strict cache-tokens-zero would require a substrate-level
agent integration that doesn't exist today.

### Resume condition (post-iter167) — overnight goals

Goal 4 is MET. The next phase is **definitive re-eval + insight layer
exploration + product-flow validation.** Three overnight goals queued
for the iteration loop:

- **B1 — iter168 honest re-eval.** Re-run Claude full-126 under the
  tightened scorer (dual R8 + `cacheBoundedByFramework` + benchmark-
  envelope-keys removed). Confirm iter164's MET is reproducible across
  ≥ 2 runs, not a single-shot Anthropic-uptime artifact. Gates are the
  iter164 gates.
- **B2 — insight layer probe.** Memory-Transfer / Insight pattern
  (Paper 5 in `docs/post-iter164-research.md`): add `@insight` YAML
  field to crystallised helpers, render in `df.d.ts` surface, probe
  whether semantic annotation improves R7 reuse rate or R8 cost-drop.
- **B3 — cold-to-warm via product flow.** Use
  `src/observer/__smoke__/novel-tenant.ts` as departure point. Real
  (not stubbed) tool bundle, 3-5 episodes; measure helper
  crystallisation + reuse + cost delta. Generalises cold-to-warm wins
  off SkillCraft.

`PLAN.md` § "Next phase" carries per-goal hypothesis + lever +
success criteria.

## Goal 3 (closed, partial): generic, code-mode-native, cost-effective learning loop

Closed 2026-05-14 at 3/7 thresholds. The learning loop fires
end-to-end; full-126 = 88.9% pass after the normalizer fix; Goal 3
part B (novel-tenant smoke) passes 11/11. The three unmet thresholds
were diagnosed as over-fitting to SkillCraft's data shape and are
superseded by Goal 4's learning-honest rubric. Original condition
preserved below.

### Goal 3 original definition: generic, code-mode-native, cost-effective learning loop

The substrate is meant to be a generic, code-mode-native, cost-effective
learning interface. Spirit (user-set 2026-05-13):

- VFS + bash + `df.*` snippets are the only interaction surface.
- Zero tenant-specific code at substrate ship time.
- Per-tenant interface IMPROVES from observed agent usage on that
  tenant (`<baseDir>/lib/<tenantId>/` evolves; the substrate ships
  the learning mechanism, not pre-baked tenant content).
- Claude-cheap tokens.
- Code mode is the core primitive for dynamic + adaptive interfaces.

See [`PLAN.md`](./PLAN.md) for the full plan and per-iteration
hypothesis schedule. Paste-ready condition (≤ 4000 chars):

```
/goal Prove the substrate's learning loop is generic, code-mode-native, and cost-effective by simultaneously satisfying TWO conditions on a single committed branch state.

(A) SkillCraft full-126 7-of-7 on a single sequentially-ordered lib-cache-enabled run via pnpm eval:skillcraft:analyze, claude driver, hooks-draft mode: arms["datafetch-learned"].passRate >= 0.92; avgEffectiveTokens <= 8000; runtimeErrorRate <= 0.05; avgLearnedInterfacesAvailable averaged over warm tier (n=84) >= 2.0; avgReuseRate averaged over warm tier >= 0.30; warm-tier avgEffectiveTokens <= 70% of train-tier avg on the same run; quarantine rate <= 0.03.

(B) Novel-tenant smoke test src/observer/__smoke__/novel-tenant.ts passes end-to-end with zero edits to substrate code (src/observer, src/hooks, src/snippet, src/sdk, src/adapter): mount a small generic dataset under a new tenantId, run 2-3 code-mode episodes, observer crystallises >=1 helper into <baseDir>/lib/<new-tenant-id>/ from the first passing episode, second episode's trajectory contains a lib.<crystallised-name> call.

Stop after 8 accepted iterations or 24 hours otherwise.

Working files: experiments/PLAN.md (current goal + iteration schedule), experiments/EXPERIMENTS.md (curated log, read before each new hypothesis; Goals 1+2 entries E0.5..E8 shape priors), experiments/EXPERIMENT_NOTES.md (chronological scratchpad), experiments/STATUS.md (snapshot of achievements + remaining work), experiments/goal.md (this file). docs/architecture.md, docs/proof-skillcraft.md, docs/release-plan.md, docs/hook-registry-experiment.md are background reading; the last appends one headline row per iteration.

Per-iteration cadence:
1. Read EXPERIMENTS.md first. State one hypothesis with expected delta on a learning-loop metric and its design lever. Valid levers: observer gate, hook registry promotion, snippet runtime, prompt template, df.lib discovery surface, smoke-replay gate, quality-gated df.answer. Never SkillCraft-specific. Add [hypothesis] note to EXPERIMENT_NOTES.md; update PLAN.md if priority shifts.
2. Implement against hook-registry / observer / snippet-runtime substrate.
3. Single-family probe with lib-cache enabled and DATAFETCH_AGENT=claude DATAFETCH_INTERFACE_MODE=hooks-draft. Required: >=+5pp pass vs iter4 baseline AND >=1 helper authored in e1 AND >=1 helper reused in e2-m2. Add [probe] note.
4. Validate on {university-directory-builder, jikan-anime-analysis}. Required: >=+3pp combined pass AND >=30% reuseRate on warm tier of at least one family. Add [validate] note.
5. Full-126, 4-shard parallel, family-sequential (e1->e2->e3->m1->m2->h1 with persistent per-tenant lib-cache). Commit headline row to docs/hook-registry-experiment.md with analysis + error-taxonomy JSONs. Append final [full-126] note AND a complete EXPERIMENTS.md entry.
6. pnpm typecheck clean, pnpm test >= 242 passing, working tree committed.

Lib-cache starts empty per tenant. All measured helpers must be observer-crystallised same-run. Seed helpers under <datafetchHome>/lib/__seed__/ are permitted as cold-start init (per user's framing 2026-05-12); pre-baked seeds under seeds/<tenantId>/ or <baseDir>/lib/<tenantId>/ before episode 1 remain forbidden.

NOT met if the transcript reveals: code pattern-matching on SkillCraft family/task/bundle/tool identifiers; pre-baked seed helpers under seeds/<tenantId>/ or <baseDir>/lib/<tenantId>/; prompt-template branches keyed on dataset/family/tier identity; hardcoded payload defaults in df.tool/df.lib proxies for specific tools; bypassing the hook registry; new server-side LLM call paths substituting for the agent's composition; manually pre-loaded hooks. New affordances reach the agent via bash + filesystem + pnpm script aliases. Persisted artefacts under <baseDir>/{lib,hooks,trajectories}/<tenantId>/.

Before declaring met, surface in the same turn: analysis JSON path; headline row diff in docs/hook-registry-experiment.md; pnpm test count; per-tier breakdown (train/warm/hard with helpers-available, helpers-used, reuse-rate, avg-tokens); note on which experiments contributed; confirmation EXPERIMENTS.md has the final iteration's complete entry. Condition holds when all seven thresholds AND constraints AND family-sequential lib-cache-enabled execution are simultaneously true on the most recent full-126.
```

## Goal 2 (preceding): prove the learning loop fires

Achieved on the pilot but not on the strict full-126; see
[`STATUS.md`](./STATUS.md) § "Goal 2" for the achieved metrics, and
[`EXPERIMENTS.md`](./EXPERIMENTS.md) for full entries E0.5..E8.

## Goal 1 (preceding): pass-rate hill climb

Achieved: 94.4% pass on full-126 at 3,027 effective tokens / task,
0.8% runtime errors. Details in [`STATUS.md`](./STATUS.md) § "Goal 1"
and [`../docs/hook-registry-experiment.md`](../docs/hook-registry-experiment.md)
§ "Iter4 full-126 (the headline)". Original framing preserved below.

### Framing

The hook registry, VFS layout, and per-tenant lib overlay are
**substrate**. SkillCraft is the **evaluator**. The substrate must
stay useful for any tenant whose primitives the agent doesn't know
in advance; SkillCraft is one such tenant. The goal therefore needs
to push numbers on the evaluator while explicitly disqualifying
wins that come from baking SkillCraft-specific knowledge into the
substrate.

Current baseline (from `docs/hook-registry-experiment.md` →
iter2 full-126 section, committed at HEAD):

- pass ≥70: 85.7%
- strict ≥90: 78.6%
- runtime error rate: 5.6%
- avg effective tokens: 3,340 / task
- skillcraft-base ceiling: 96.0% / 94.4% / 0% / ~520,450 tokens
- remaining gap: concentrated in warm phase (helpers crystallised
  in train that don't generalise to warm variants)

## Targets

- **Primary**: pass ≥70 ≥ 92% on full-126 (closing ~6.3pp of the
  10.3pp ceiling gap) without inflating tokens above ~2× current
  baseline.
- **Secondary**: runtime error rate ≤ 5%; no regression in test
  count (≥ 227 passing).

## The `/goal` command

Open the session and paste:

```
/goal Reach pass ≥70 of ≥ 92% on the full SkillCraft 126-task surface (measured from the arms["datafetch-learned"].passRate field of a fresh pnpm eval:skillcraft:analyze output) with avg_effective_tokens ≤ 8,000 and runtime_error_rate ≤ 0.05 — OR stop after 8 accepted iterations or 24 hours.

Cadence per iteration, each surfaced in the transcript:
1. State one hypothesis with expected delta and the design lever it pulls (hook registry, observer gate, prompt template, snippet runtime — never a SkillCraft-specific shortcut).
2. Implement against the hook-registry / VFS substrate.
3. Run a single-family probe; surface per-task pass + tokens + runtime-error counts. Require ≥+5pp pass vs the latest committed baseline on that family.
4. If probe passes, run a 2-family held-out validate on the fixed rotation pair {university-directory-builder, jikan-anime-analysis}. Require ≥+3pp combined pass.
5. If validate passes, run full-126 (4-shard parallel) and commit the new headline row to docs/hook-registry-experiment.md with the analysis + error-taxonomy JSONs.
6. After every iteration: pnpm typecheck clean, pnpm test shows ≥ 227 tests passing, and the working tree is committed.

Condition is NOT met if the transcript reveals any of:
- Code that pattern-matches on SkillCraft family names, task keys, bundle names, or specific tool identifiers (no "if family === ..." or "if toolName.startsWith('local-cocktail_')")
- Pre-baked seed helpers under seeds/ that solve specific SkillCraft tasks
- Prompt-template branches keyed on dataset / family identity
- Hardcoded payload field defaults inside df.tool / df.lib proxies for specific tools
- Bypassing the hook registry: <baseDir>/hooks/<tenantId>/ stays the trust gate; df.lib.<name> is a stable public contract; implementations are replaceable behind it; quarantine stays active; per-tenant layout is preserved
- New server-side LLM call paths that substitute for the agent's own composition (observers learn FROM agent attempts; they don't make attempts of their own)

New affordances reach the agent via bash + filesystem + pnpm script aliases (the existing pnpm datafetch:run pattern), not new bespoke tool APIs. Persisted artefacts live under <baseDir>/{lib,hooks,trajectories}/<tenantId>/ — generic shape, not skillcraft-specific paths.

Before declaring the condition met, surface in the same turn: the analysis JSON path, the headline row diff, and the test count. The condition only holds when the numbers AND the constraints both pass simultaneously on the most recent full-126 run.
```

## Why this shape

**Measurable end state.** Three numeric thresholds tied to a
specific JSON path the analysis script produces. The evaluator can
read whether Claude reported those numbers from a fresh run.

**Stated check.** Every iteration has to walk through smoke →
probe → validate → headline and surface the analysis JSON path.
Claude can't claim victory without showing the artefact.

**Bounded.** 8 iterations or 24h. The evaluator can count
iteration markers in the transcript.

**Constraints that matter.** Eight explicit disqualifiers covering
the over-fitting shapes we've discussed in this session. Every one
of them is detectable from the diff Claude surfaces — Claude has
to show its commits, and the evaluator can read the diffs.

**No more aggressive than the current trajectory needs.** 92% pass
with ≤8k tokens is roughly: iter2 (85.7% / 3.3k) → close half the
remaining ceiling gap → token budget doubles to leave room for any
smoke-replay verification overhead. If iter2-style cheap wins keep
landing, this terminates well under 8 iterations.

## Anti-patterns the constraints catch

The "Condition is NOT met if …" section is the most important part.
It's there because the numbers alone can be gamed:

- **Family-keyed prompt branches** would lift SkillCraft numbers
  without generalising. Forbidden.
- **Hardcoded payload defaults** in df.tool proxies would mask
  agent-code bugs by silently returning empties for specific tool
  names. Forbidden — defenses go in the agent's code or the
  prompt, not the runtime.
- **Server-side skill bodies** would let us match SkillCraft by
  effectively re-running SkillCraft's agent loop on our substrate.
  Forbidden — datafetch's claim is the substrate, not a new
  LLM-call orchestrator.
- **Pre-baked seed helpers for SkillCraft** would inflate
  warm-phase reuse rate without proving the crystallisation
  pipeline works on novel tenants. Forbidden.

## Iteration candidates that pass the constraints

The current open question (warm-phase helper generalisation) admits
several substrate-level improvements that don't violate the
constraints:

1. **Smoke-replay promotion gate** — `candidate-typescript` →
   `validated-typescript` only when the helper replays cleanly on
   the same inputs that produced it. Generic across tenants.
2. **Iteration-count warning** (Phase 4, deferred) — when the
   agent overwrites a learned helper ≥ 3 times within a family,
   surface a hint to write the task directly instead. Generic.
3. **Per-tenant test sieve** — after the agent authors a helper,
   automatically run it against the example inputs in the
   trajectory's recorded calls. Quarantine on output drift.
4. **Trajectory-aware probe hints** — when the agent's previous
   call returned `undefined` for a field its next call assumes,
   surface that in the prompt. Detects from the trajectory log,
   not from family/tool identity.

Each of these targets warm-phase quality (the actual remaining
gap) at the substrate level. None of them require knowing
anything about SkillCraft specifically.

## Running it

Interactive:

```
/goal <paste the condition from above>
```

Non-interactive (e.g. an overnight run on Claude's subscription):

```
claude -p "/goal <paste the condition>"
```

Status check:

```
/goal
```

Clear early:

```
/goal clear
```

The goal auto-clears when met. Each accepted iteration commits its
own evidence, so even a stopped run leaves a clean audit trail in
git.
