# Evaluation Harnesses

Everything eval-related lives here. The shippable product (the datafetch
client / server / SDK) is under `src/`; this directory holds the harness code,
seed library, scripts, fixtures, tests, and per-benchmark protocols/results.

> **Boundary rule.** `src/` is the external substrate. `eval/` depends on `src/`
> (imports `../../src/...`), never the reverse. The substrate-purity check for a
> new eval is therefore just `git diff --stat src/` — it must be empty after
> onboarding a corpus. (Historical docs phrase this as `git diff src/ ':!src/eval'`;
> since the drivers moved to `eval/harness/`, the exclude is now vestigial.)

## Layout

| Path | What it is |
|---|---|
| `harness/` | The eval **drivers** (TypeScript). Import the substrate and run benchmarks: `skillcraftFullDatafetch.ts`, `finchainFullDatafetch.ts`, `sacArms.ts` / `sacArmGovernance.ts`, the CRAG glue (`cragCorpus.ts`, `cragGrader.ts`, `cragMount.ts`, `cragSiblings.ts`), `evalRecords.ts`, `runScript.ts`, `productFlow/`. Moved here from `src/eval/` in the 2026-06-04 reorg. |
| `seeds/` | The substrate's **canonical seed library** (`generic/`, `domains/<name>/`). Runtime-loaded by `src/snippet/install.ts` + `src/flue/install.ts` via `locateRepoSubdir("eval/seeds/...")`. Ships as eval-domain content; the substrate degrades gracefully when absent. |
| `tests/` | Eval-specific vitest suites (`sac-*`, CRAG, skillcraft planner). Run alongside `tests/` via vitest's two include roots. |
| `scripts/` | Eval orchestration scripts not tied to one suite (`crag-probe/`, `parallel-eval.sh`, `iter1-*.sh`, `goal2-full.sh`, `audit-autoinvoke.mts`). |
| `skillcraft/` | SkillCraft suite: `configs/`, `vendor/`, `scripts/` (incl. `run-sac-poc.sh`, `seal-manifest.ts`, `score-cross-arm.ts`), `probes/`, `manifests/`, `fixtures/`, `results/` (git-ignored). |
| `finchain/` | FinChain suite: `configs/`, `scripts/`, `vendor/`, `preseed-rich-helper/`, `protocol.md`, `results/` (git-ignored). |
| `productFlow/` | Cold→warm product-flow micro-eval: `overlays/`, `preseed-*`, `results/` (git-ignored). Harness code is in `harness/productFlow/`. |

## Running

The npm scripts in `package.json` are the entrypoints, e.g.:

```sh
pnpm eval:skillcraft            # tsx eval/harness/skillcraftFullDatafetch.ts
pnpm eval:finchain              # tsx eval/harness/finchainFullDatafetch.ts
pnpm eval:skillcraft:report     # build the report from results/
```

CRAG (the C4 governance-under-staleness track) reads its corpus from an
external vendor location resolved by `harness/cragCorpus.ts`
(`DATAFETCH_CRAG_JSONL`, then local `eval/crag/vendor/raw/`, then the
`crag-harness` worktree). The grader (`harness/cragGrader.ts`) scores tri-state
(+1 / 0 / −1) for the Truthfulness = Accuracy − Hallucination endpoint.

## Results & artifacts

Large raw outputs under each suite's `results/` and the root `runs/` are
git-ignored. Publish them as release artifacts or datasets when a run is ready
to share.
