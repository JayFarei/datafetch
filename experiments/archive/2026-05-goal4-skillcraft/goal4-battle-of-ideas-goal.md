# Goal 4 Battle of Ideas

Date: 2026-05-15

Purpose: bootstrap a new session that runs parallel small-eval attacks on the
Datafetch learning algorithm until one approach qualifies for full-126. The goal
is not to make the current `recordToolFanout` path look good. The goal is to
find a learning loop that scales across SkillCraft without reward hacking.

## Current Evidence

Use these as the evidence pack before editing:

- `experiments/EXPERIMENT_NOTES.md`, especially iter76-78.
- `experiments/archive/2026-05-goal4-skillcraft/academic-design-directions.md`.
- iter78 full run:
  `eval/skillcraft/results/datafetch/goal4-iter78-full126-dependentsemantic-brief-hooksdraft-20260515/`
- iter78 derived artifacts:
  - `r1-r9-scorecard.json`
  - `fanout-slot-diagnostics.json`
  - `runtime-error-classes.json`
  - `intent-clusters.json`
  - `helper-instrumentation.jsonl`
  - `normalized.jsonl`

Iter78 result:

- Full run completed `126/126`.
- `90/126` official passes, `36` failures, `18` runtime errors, `3`
  unsupported/evaluator-null rows, `0` infrastructure failures.
- R1 FAIL `0.7143`, R2 PASS `4137.3`, R3 FAIL `0.1429`, R4 PASS `0`, R6
  FAIL `0.4`, R7 PASS `0.8684`, R8 FAIL `0.7291`, R9 PASS
  `db->FANOUT(tool)->lib`.
- Fanout diagnostics: `278` executed slots, `105` verified, `50` narrow, `44`
  suspect, `79` reject, `60` dependent.
- One cached-token row, `cocktail-menu-generator/e3`, came from resuming the
  interrupted unfinished episode. Treat it as a resume artifact, not a clean
  no-cache proof.

Conclusion: iter78 proves learned-helper reuse and cross-family transfer exist,
but it does not prove adaptive reliability. The likely failure is immature
helper governance plus brittle generated answer code.

## Non-Negotiable Rules

- Preserve dirty worktree changes. Do not reset or revert unrelated edits.
- Do not run another full-126 until a candidate passes small-eval qualification.
- Do not relax `eval/skillcraft/scripts/score-r1-r9.ts` thresholds or reinterpret
  compositional diagnostics as official success.
- Do not add SkillCraft family branches, task-id branches, seed-only reuse, or
  prompt-only metric steering.
- Use exact official scoring. Weak partial clustering is a failure signal even
  if rows technically pass.
- Require zero cache-token dependence for clean candidate qualification.
- Require interface/execution separation: the public learned interface must be
  intent-shaped, while record-field/tool-param mapping, same-entity vs dependent
  fanout, verification, and slot pruning remain planner/executor internals.
- Keep every claim grounded in artifacts or `file:line` evidence.

## Battle Assumptions

Run these as competing assumptions. Agents should try to falsify their own arm
quickly with small evals.

### A. Contract-Aware Tool Admissibility

Assumption: `recordToolFanout` failed because the selected tools were judged by
surface parameter names, not by a verified contract between record fields,
required tool input values, and answer-used output fields.

Expected change:

- Learn/store per-slot admissibility: `verified`, `narrow`, `dependent`,
  `suspect`, `reject`.
- Expose only `verified` and explicitly selected `narrow` same-entity slots to
  `recordToolFanout`.
- Fail closed when the record entity cannot supply the actual input value.

Primary falsifier:

- `usgs-earthquake-monitor`, `world-bank-economic-snapshot`,
  `random-user-database`, and `rickmorty-multiverse-explorer` must stop producing
  answer-used suspect/reject slots without losing tvmaze/university behavior.

Likely files:

- `src/eval/skillcraftFullDatafetch.ts`
- `src/observer/template.ts`
- `src/observer/author.ts`
- `eval/skillcraft/scripts/fanout-slot-diagnostics.ts`

### B. Verification-Gated Helper Promotion

Assumption: the learning loop promotes helpers from converged structure too
early. A helper should not become preferred until it can replay the originating
examples and preserve raw outputs.

Expected change:

- Before promotion/preference, replay candidate helper behavior against the
  source trajectory examples.
- Persist verification cases and maturity state with helper metadata.
- Prefer helpers only when their maturity is `promote`; expose `narrow` helpers
  with explicit warning/context; hide `suspect`/`reject`.

Primary falsifier:

- R6 should improve because only verified helpers count as converged, and
  fanout diagnostics should stop showing promoted helpers with reject-heavy
  families.

Likely files:

- `src/observer/author.ts`
- `src/observer/template.ts`
- `src/eval/skillcraftFullDatafetch.ts`
- `tests/observer-author.test.ts`
- `tests/observer-template.test.ts`

### C. Hierarchical Skill Decomposition

Assumption: one generic `recordToolFanout` is the wrong abstraction boundary.
The learning algorithm needs separate planning skills: same-entity fanout,
dependent enrichment, and answer projection.

Expected change:

- Keep same-entity fanout as a narrow functional helper.
- Represent dependent tools as a separate plan, not as slots inside the same
  fanout helper.
- Teach learned reuse to route between:
  - record-backed same-entity helper
  - dependent/multi-hop enrichment helper
  - raw answer code fallback

Primary falsifier:

- Families with true dependency chains should either produce a separate
  dependency helper or fall back cleanly, not pollute `recordToolFanout`.

Likely files:

- `src/eval/skillcraftFullDatafetch.ts`
- `src/observer/template.ts`
- `src/observer/author.ts`
- `tests/observer-template.test.ts`

### D. Fault-Localizing Answer Builder

Assumption: even a correct learning loop cannot pass R1/R3 while raw generated
answer glue is allowed to invent variables, assume payload shapes, or call tools
with invalid values.

Expected change:

- Add a small typed answer/projector scaffold for common outputs and wrapped
  tool payloads.
- Make generated answer code route through stable helpers for unwrap/id lookup,
  JSON writing, and null-safe extraction.
- Use runtime-error classes to prioritize fixes: reference errors, payload
  assumption errors, transform failures, and missing record mounts.

Primary falsifier:

- Runtime-error rate must fall below `0.05` on the adversarial small suite
  without reducing learned-helper reuse.

Likely files:

- `src/eval/skillcraftFullDatafetch.ts`
- `src/snippet/runtime.ts`
- `src/snippet/dfBinding.ts`
- `tests/observer-author.test.ts`

## Parallel Agent Briefs

Start with parallel agents only after the lead session has read the evidence
pack and confirmed current git status.

Agent A, contract arm:

```text
You own the contract-aware admissibility arm. Read iter78 fanout diagnostics and
the code that selects recordToolFanout slots. Propose and, if feasible, patch a
minimal generic contract gate that prevents answer-used suspect/reject slots
from being exposed as same-entity fanout. Do not touch scorer thresholds. Return
changed files, tests, and a small-eval result or a precise blocker.
```

Agent B, verification-promotion arm:

```text
You own the verification-gated promotion arm. Read observer author/template code
and iter78 helper maturity evidence. Design and patch the smallest mechanism
that stores helper maturity and prevents suspect/reject helpers from becoming
preferred learned interfaces. Do not alter official scoring. Return changed
files, tests, and small-eval evidence.
```

Agent C, hierarchy arm:

```text
You own the hierarchical skill decomposition arm. Find where the current system
collapses same-entity fanout and dependent tools into one helper. Patch a minimal
split or routing rule so dependent/multi-hop tools do not contaminate
recordToolFanout. Preserve tvmaze/university behavior. Return changed files,
tests, and small-eval evidence.
```

Agent D, answer-builder arm:

```text
You own the fault-localizing answer-builder arm. Use iter78 runtime-error classes
to reduce generated-code failures without family/task-id branches. Patch the
smallest generic answer scaffold or runtime guard that should reduce reference
and payload-shape errors. Return changed files, tests, and small-eval evidence.
```

## Small-Eval Suites

Use the same environment unless an arm explicitly proves a reason to change it:

```bash
export DATAFETCH_AGENT=codex-direct
export DATAFETCH_PROMPT_MODE=brief
export DATAFETCH_INTERFACE_MODE=hooks-draft
export DF_SKILLCRAFT_FULL_MODEL=gpt-5.4-mini
export DF_SKILLCRAFT_FULL_REASONING_EFFORT=low
```

Smoke control, 12 rows:

```bash
pnpm eval:skillcraft -- --live \
  --families=tvmaze-series-analyzer,university-directory-builder \
  --out-dir eval/skillcraft/results/datafetch/<run-id>
```

Semantic adversarial, 36 rows:

```bash
pnpm eval:skillcraft -- --live \
  --families=random-user-database,rickmorty-multiverse-explorer,usgs-earthquake-monitor,world-bank-economic-snapshot,openmeteo-weather,pokeapi-pokedex \
  --out-dir eval/skillcraft/results/datafetch/<run-id>
```

Runtime adversarial, 30 rows:

```bash
pnpm eval:skillcraft -- --live \
  --families=countries-encyclopedia,dnd-campaign-builder,local-dna-analysis,dog-breeds-encyclopedia,recipe-cookbook-builder \
  --out-dir eval/skillcraft/results/datafetch/<run-id>
```

Positive controls, 18 rows:

```bash
pnpm eval:skillcraft -- --live \
  --families=name-demographics-analyzer,vocabulary-builder,jsonplaceholder-blog-analyzer \
  --out-dir eval/skillcraft/results/datafetch/<run-id>
```

Qualification suite, 60 rows:

```bash
pnpm eval:skillcraft -- --live \
  --families=tvmaze-series-analyzer,university-directory-builder,random-user-database,rickmorty-multiverse-explorer,usgs-earthquake-monitor,world-bank-economic-snapshot,countries-encyclopedia,dnd-campaign-builder,local-dna-analysis,vocabulary-builder \
  --out-dir eval/skillcraft/results/datafetch/<run-id>
```

## Diagnostics For Every Run

```bash
RUN=eval/skillcraft/results/datafetch/<run-id>

pnpm exec tsx eval/skillcraft/scripts/normalize-results.ts \
  --datafetch-run "$RUN" \
  --out "$RUN/normalized.jsonl"

pnpm exec tsx eval/skillcraft/scripts/walk-artifacts.ts \
  --run "$RUN" \
  --out "$RUN/helper-instrumentation.jsonl"

pnpm exec tsx eval/skillcraft/scripts/intent-cluster-analysis.ts \
  --run "$RUN" \
  --out "$RUN/intent-clusters.json"

pnpm exec tsx eval/skillcraft/scripts/fanout-slot-diagnostics.ts \
  --run "$RUN"

pnpm exec tsx eval/skillcraft/scripts/classify-runtime-errors.ts \
  --run "$RUN" \
  --out "$RUN/runtime-error-classes.json"

pnpm exec tsx eval/skillcraft/scripts/score-r1-r9.ts --run "$RUN"
```

Verification:

```bash
pnpm exec vitest run tests/observer-author.test.ts tests/observer-template.test.ts
pnpm typecheck
pnpm test
```

## Qualification Gates

A candidate can advance from small evals to full-126 only if all are true:

- R1/R2/R3/R4/R6/R7/R8/R9 are green on the qualification suite.
- `agentCachedInputTokens` is zero on every row.
- No infrastructure/model-limit failures.
- Runtime-error rate is `<= 0.05`.
- Fanout diagnostics show no answer-used `reject` slots and no answer-used
  `suspect` slots for promoted helpers.
- Helper maturity is `promote` or explicitly justified `narrow`; no preferred
  helper is `suspect` or `reject`.
- R10 Interface/Execution Separation passes: the promoted/caller-facing surface
  expresses user intent and record scope, not benchmark/data-shape plumbing such
  as `recordParamMapByTool`, `paramByTool`, tuple/literal repair assumptions, or
  generated-source evaluator repairs.
- Tvmaze and university remain clean enough: no repeated weak partial cluster,
  and no passed row below `85`.
- Positive controls do not regress.

Full-126 can be run only after qualification. Full-126 success requires:

- Official R1-R9 except R5 green.
- R10 green, or an explicit note saying the low-level helper surface is
  temporary/internal and not counted as the final learned interface.
- `pnpm test` and `pnpm typecheck` green.
- Zero cache-token dependence.
- A written decision in `experiments/EXPERIMENT_NOTES.md`.

If a qualified approach fails full-126, do not restart from scratch. Diagnose
the failed gate, patch one targeted revision within the same assumption family,
rerun the qualification suite, and then rerun full-126 only if the qualification
gate is clean again.

## Comparison Template

For each arm/run, record:

```text
Run:
Assumption:
Patch summary:
Small suite:
Rows / pass rate:
R1-R9:
Cache-token rows:
Fanout slots verified/narrow/suspect/reject:
Runtime-error classes:
Weak partials:
R10 interface/execution separation:
Decision: advance / revise / retire
Why:
```

## Pasteable Goal Prompt

```text
/goal Continue Goal 4 after iter78. CWD:
/Users/jayfarei/src/tries/2026-05-01-hackathon. Preserve dirty worktree
changes; do not reset/revert unrelated edits.

Objective: run a battle-of-ideas campaign to find the Datafetch learning
algorithm that can scale to full SkillCraft. Do not start with full-126. Use
parallel agents on 4 assumptions, prove/falsify each on small evals, qualify one
approach, then run full-126 only after qualification. If full-126 fails,
diagnose and revise the same winning assumption family, then re-qualify before
rerunning full-126.

First recover context:
- Read experiments/archive/2026-05-goal4-skillcraft/goal4-battle-of-ideas-goal.md (this file).
- Read experiments/archive/2026-05-goal4-skillcraft/academic-design-directions.md.
- Read experiments/EXPERIMENT_NOTES.md iter76-78.
- Inspect iter78 artifacts under
  eval/skillcraft/results/datafetch/goal4-iter78-full126-dependentsemantic-brief-hooksdraft-20260515/.
- Check git status and preserve current dirty worktree.

Current evidence:
- iter77 passed the tvmaze+university small gate.
- iter78 full-126 completed but failed: 90/126 passes, 18 runtime errors, 3
  unsupported rows, no infra failures. R1=0.7143 fail, R2=4137.3 pass,
  R3=0.1429 fail, R4=0 pass, R6=0.4 fail, R7=0.8684 pass, R8=0.7291 fail,
  R9=db->FANOUT(tool)->lib pass.
- Fanout diagnostics failed at full scale: 105 verified, 50 narrow, 44 suspect,
  79 reject, 60 dependent out of 278 executed slots.
- One cached-token row was a resume artifact: cocktail-menu-generator/e3.

Parallel assumptions:
1. Contract-aware tool admissibility: prevent recordToolFanout from exposing
   same-entity slots unless record fields actually satisfy tool inputs.
2. Verification-gated promotion: do not prefer/promote helpers until replay
   verification and maturity gates pass.
3. Hierarchical skill decomposition: split same-entity fanout from dependent
   enrichment and answer projection instead of one universal helper.
4. Fault-localizing answer builder: reduce reference/payload/runtime failures
   with generic typed scaffolds, not family branches.

Rules:
- Do not relax score-r1-r9 or reinterpret compositional diagnostics.
- No SkillCraft family/task-id prompt branches, scorer relaxation, seed-only
  reuse, or reward-hacky prompt steering.
- Keep exact official scoring and zero cache-token dependence.
- Use small evals from experiments/archive/2026-05-goal4-skillcraft/goal4-battle-of-ideas-goal.md. Generate normalized,
  helper instrumentation, intent clusters, fanout diagnostics, runtime-error
  classes, and R1-R9 for every run.
- Advance to full-126 only if the qualification suite passes all gates in the
  doc.

Deliverables:
- A comparison table of all arms.
- The selected approach with evidence.
- Patch plus tests.
- Experiment notes updated.
- If qualified, one full-126 run and final decision.
```
