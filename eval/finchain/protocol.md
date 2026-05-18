# Protocol

## Hypothesis

Datafetch learned interfaces are useful if, on held-out repeated FinChain template instances, they (a) match or exceed FinChain's paper-published Claude Sonnet 4.5 ChainEval baseline per difficulty tier (FC1, FC2), (b) beat a matched substrate-OFF arm on Final Answer Correctness with paired t-test p<0.05 and reduce warm-tier tokens-or-wall-clock by ≥10% (FC3), and (c) crystallise at least one helper that transfers across BOTH a SkillCraft family and a FinChain topic (FC4) — all while the SkillCraft regression arm holds the iter164 baseline (FC5). See `experiments/PLAN.md` § Goal 5 for the full rubric.

## Unit Of Comparison

The paired unit is a FinChain **template instance**:

```text
<topic>/<template_name>/<seed_index>
```

For example: `investment_analysis/template_ci_simple_calculation/seed_3`. Each instance is one episode in one arm. Pairing avoids treating different topics or difficulty tiers as interchangeable, matching the SkillCraft per-task pairing convention.

## Source Of Truth

Templates come from the pinned vendor clone at `eval/finchain/vendor/finchain/data/templates/<domain>/<topic>.py` (vendor dir gitignored; clone via `pnpm eval:finchain:prepare`). Each `<topic>.py` exposes one or more `template_*` functions; FinChain's documented convention is exactly 5 templates per topic ordered by difficulty:

- Templates 1-2: **Basic**
- Templates 3-4: **Intermediate**
- Template 5: **Advanced**

Each `template_*()` returns `(question, solution)` tuples by calling `random.*` with implicit per-call seeding. To produce reproducible siblings ("seed instances") the harness wraps the call with `random.seed(seed_index)` before invocation. FinChain's paper specifies 10 seeds per template (290 templates × 10 seeds = 2,900 instances total); we follow that convention with the seed index as the third tuple in the unit-of-comparison path.

## Family / Level Mapping

FinChain's natural shape (`domain` × `topic` × `template` × `seed`) is collapsed onto SkillCraft's `family` × `level` shape so a single runner (`finchainFullDatafetch.ts`) can mirror `skillcraftFullDatafetch.ts` without per-benchmark branching above the runtime layer.

| FinChain unit | SkillCraft unit | Rationale |
|---|---|---|
| `<domain>/<topic>` (e.g. `investment_analysis/ci`) | `family` (e.g. `investment_analysis-ci`) | A topic is the smallest unit where intent recurs across siblings; matches SkillCraft's per-family lib-cache scope |
| Template position within topic (1-5) | `level` ∈ {`e1`, `e2`, `m1`, `m2`, `h1`} | Direct mapping: templates 1-2 → `e1`,`e2` (Basic); templates 3-4 → `m1`,`m2` (Intermediate); template 5 → `h1` (Advanced) |
| Seed index (0-9) | sub-episode within a level | Per the SkillCraft convention, levels are atomic; for FinChain we expose the seed index in `task_config.seed_index` and treat each (template, seed) as a distinct episode of that level |

SkillCraft has 6 levels per family (`e3` adds a third Basic-tier task); FinChain has only 5 templates per topic so `e3` is not populated. This is a permitted shape mismatch — the runner reads `LEVEL_ORDER` from `task_config.level_order` rather than the SkillCraft constant.

Per-arm scale options (final choice deferred to iter 4 baseline; documented here as decision space):

| Scope | Episodes per arm | Compute |
|---|---|---|
| Single-seed pilot | 290 (58 topics × 5 templates × 1 seed) | matches SkillCraft full-126 wall (~2-4h) |
| 3-seed standard | 870 (58 × 5 × 3) | ~6-12h per arm; sufficient for paired-t power |
| Full corpus (paper-equivalent) | 2,900 (58 × 5 × 10) | ~20-40h per arm; declare-met run only |

Iter 5 first bilateral scorecard uses the single-seed pilot (290) for fastest signal; later iterations escalate as the substrate stabilises.

## Mount Adapter — Records As The Sibling Library

FinChain templates are pure-computation: there is no external dataset for the agent to query. To preserve the substrate's "db.* first call → lib.* with data-flow" requirement (the convergence gate from Goal 4 rejects pure-tool fan-out), the records mount carries the **sibling library**: for each `(topic, template)` pair, the 9 OTHER seed instances (excluding the current episode's seed) are exposed as `df.db.records`. Each record describes one prior seed instance:

```ts
EvalRecord {
  id: string;                                  // seed_index, e.g. "0"
  recordKey: "<topic>:<template>:<seed_index>"
  family: "<topic>"
  entity: string;                              // seed_index
  label: string;                               // template difficulty + short label
  attributes: {
    seed_index: number,
    template_name: string,
    template_position: number,                 // 1-5
    difficulty: "Basic" | "Intermediate" | "Advanced",
    question: string,                          // the generated question text
    answer_summary: string,                    // a short canonical answer extract
    // ALL parameters surfaced by the template render (principal, rate, time, ...)
    // The harness extracts these by introspecting the template's signature + bound
    // locals at solve time; no per-template hardcoding.
    [param: string]: string | number | boolean,
  }
}
```

This mapping gives the substrate something to learn from on every episode:

- **Cold path** (no warm helper available, no learned interface): agent `df.db.records.findExact({})` to read sibling examples → reverse-engineers the formula → solves the current question.
- **Warm path** (a helper for this `(topic, template)` exists): agent calls `df.lib.<helper>({...params})` directly; the helper encodes the formula learned from prior siblings.
- **Hard path** (intra-topic generalisation: same topic, different template): the agent may try an existing helper, observe it doesn't fit (different formula), and either author a new helper or extend the existing one.

The "db.* first call → lib.* with data-flow" pattern is preserved: cold-path agents must call `df.db.records` to read the sibling library before attempting the answer. Without that call, the agent has no information about the question's shape and must derive blindly.

## Agent Surface

The agent's interaction surface is identical to SkillCraft: workspace `scripts/answer.ts` + `df.*` runtime + `pnpm datafetch:run` probe path + auto-invoke trailer. Differences are local to the FinChain workspace:

- `df.tool` is empty for FinChain episodes (no external tools needed). The agent doesn't call `df.tool[...]`; the substrate's tool catalog is omitted from the rendered `df.d.ts`.
- The `question` is rendered into the agent prompt verbatim (the template's natural-language question, including the named entities like "John Doe invests $5,000 ...").
- The agent commits with `df.answer({status, value, evidence, derivation})` where:
  - `value` is the final numerical answer (e.g. `5826.20`).
  - `evidence` carries citations to sibling records that informed the solution: `[{recordKey: "investment_analysis-ci:template_ci_simple_calculation:3", reason: "same template; reused formula"}]`. The evidence shape mirrors SkillCraft.
  - `derivation` carries the intermediate reasoning steps as a structured array: `[{step: 1, label: "Compute compound amount", expression: "5000 × (1 + 0.05)^3", value: 5788.13}, ...]`. ChainEval's step-alignment metric reads this field.

## Evaluator (FC1 + FC2)

The FinChain evaluator is a TypeScript port of the FinChain ChainEval reference at `eval/finchain/vendor/finchain/chaineval/evaluate_predictions.py`. It runs at `eval/finchain/scripts/score-finchain.ts` against the `normalized.jsonl` produced by `normalize-results.ts`. Two scores per episode:

- **FAC** (Final Answer Correctness): numerical equality (with tolerance) between the agent's `df.answer.value` and the gold final value parsed from the template's solution string.
- **Step alignment**: joint semantic + numerical alignment between the agent's `df.answer.derivation` array and the gold intermediate values parsed from the solution string. Mirrors ChainEval's dynamic-alignment metric: each gold step is matched to its closest agent step (greedy), scored on (a) semantic similarity of the label (TF-IDF or embedding; iter 3 picks one), and (b) numerical agreement on the step's value with relative tolerance 1e-3.

Per-tier FAC and step-alignment numbers are compared against the paper's published Claude Sonnet 4.5 baseline (snapshotted to `eval/finchain/rubric.md` at iter 1 with source URL + date) to compute FC1, FC2.

## Paired-Arm Control (FC3)

Same control toggle as SkillCraft P1: `DATAFETCH_DISABLE_LEARNING=1` on Arm B. Both arms run the same FinChain instances in the same order with the same agent backend (Claude Sonnet 4.6 + `claude-p` by default), differing only in lib-cache hydration / observer install / persist. Per-instance paired comparison: matched on `(topic, template, seed_index)`.

Statistical tests reused from `eval/skillcraft/scripts/p1-paired-analysis.py`:

- Paired t-test on FAC (treated as 0/1) across all matched pairs.
- Paired t-test on `agentEffectiveTokens` and `agentElapsedMs`.
- McNemar's test on discordant pass/fail pairs.

FC3 PASSes when paired-t on FAC has p<0.05 AND at least one of {tokens, wall-clock} shows ≥10% reduction on warm-tier sibling cells (sub-episodes where a same-template helper was already crystallised before the current seed ran).

## Cross-Benchmark Transfer (FC4)

The `__intent__/` cross-family helper pool from Goal 4 is extended to a **cross-benchmark** pool. A helper crystallised on SkillCraft's `db→FANOUT(tool,6+,cycle1)→lib` intent signature should be visible to FinChain episodes too, and vice versa. FC4 PASSes when the `walk-artifacts.ts` analyser finds at least one `intentSignature` whose crystallised helper was called in ≥1 SkillCraft family AND ≥1 FinChain topic on the same substrate commit.

Implementation: the shared `__intent__` directory lives at `<datafetchHome>/__intent__/` (substrate-level, not per-benchmark). Both runners hydrate from and persist to this directory. Iter 2 architecture: single shared pool (cleaner, tests FC4 directly).

## Substrate-Rooted Chain Gate

For FinChain the gate is the same as SkillCraft: when `df.db.records` is mounted, `scripts/answer.ts` must contain a `df.db.records.*` call OR a `df.lib.*` call. Without either, the snippet runtime rewrites the answer envelope to `status: unsupported`. FinChain's records mount is always populated (the sibling library is never empty above seed_index=0), so the gate is meaningful from the first episode.

## Run Conventions

| Convention | Value |
|---|---|
| Run base naming | `goal5-iter<N>-<scope>-<model>-<note>-<YYYYMMDD>` (mirrors goal4) |
| Result path | `eval/finchain/results/datafetch/<run-base>/` (gitignored) |
| Required output files per run | `analysis.json`, `r1-r9-scorecard.json`, `finchain-scorecard.json`, `normalized.jsonl`, per-episode `*.trajectory.jsonl` + `*.answer.json` |
| Backend default | Claude Sonnet 4.6 via `claude-p`; codex/codex-direct backends available via `DATAFETCH_AGENT=` env (same as SkillCraft) |
| Shard count | 4-shard parallel, family-sequential within shard (matches SkillCraft) |
| Lib-cache | per-tenant, per-family (within FinChain: per-topic); fresh each run unless `--resume` |

## Non-Regression Invariant

Every FinChain run on a Goal 5 substrate commit is paired with a SkillCraft full-126 regression run on the same commit. The bilateral non-regression check requires SkillCraft R1-R9 PASS at iter164 levels under `cacheBoundedByFramework`. If the SkillCraft regression breaks, the iteration is REJECTED — the substrate change must be reverted or generalised before the next attempt. This catches benchmark-shaped changes that pass FC1-FC3 by over-fitting to FinChain.

## Open Decisions (Resolved By Iter 2-3)

1. **TF-IDF or embedding for step-alignment semantic similarity?** TF-IDF if the gold step labels are short and structured (looks likely from inspection); embedding (e.g. text-embedding-3-small) if iter 3 finds TF-IDF too brittle.
2. **Question text in agent prompt: verbatim or paraphrased?** Default verbatim (preserves the paper's measurement validity); revisit if the verbatim prompt biases the agent toward parametric recall.
3. **Sibling library scope: same-template only or same-topic across templates?** Default same-template (preserves intent recurrence); revisit at iter 5 if agents need cross-template hints to generalise.
4. **Gold-trace extraction: parse template `solution` string or instrument the template at solve time?** Default instrumentation (more robust); fallback to regex parsing if instrumentation requires intrusive template modifications.

## Files Created By This Protocol

| File | Purpose | Iter |
|---|---|---|
| `eval/finchain/protocol.md` | this document | 1 |
| `eval/finchain/rubric.md` | R1-R9 + FC1-FC5 description with paper-baseline snapshot | 1 |
| `eval/finchain/README.md` | orientation | 2 |
| `eval/finchain/runbook.md` | operational notes | 2 |
| `eval/finchain/scripts/prepare-finchain.sh` | vendor clone + manifest generation | 2 |
| `eval/finchain/manifests/<topic>/<template>/seed_<N>.json` | per-instance task manifests | 2 (generated) |
| `eval/finchain/adapters/` | template introspection + EvalRecord projection | 2 |
| `eval/finchain/scripts/score-finchain.ts` | FC1-FC5 scorer | 3 |
| `src/eval/finchainFullDatafetch.ts` | runner (parallels skillcraftFullDatafetch.ts) | 2 |
| `src/eval/finchainRecords.ts` | mount adapter (parallels evalRecords.ts) | 2 |
| `src/observer/__smoke__/finchain-mount.ts` | smoke (joins the 6 existing smokes) | 2 |
