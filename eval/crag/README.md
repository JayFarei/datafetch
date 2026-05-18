# Datafetch × CRAG Full Evaluation

This harness is designed to answer one question:

> On the CRAG 2,706-question public split, does datafetch's learned
> `df.lib.*` interface preserve correctness while reducing cost, latency, and
> tool work relative to a substrate-OFF baseline — without regressing the
> SkillCraft iter164/P1 baseline on the same substrate hash?

`pnpm eval:crag` (TBD; defined in [`runbook.md`](./runbook.md)) targets this
harness against the vendored CRAG dataset under [`vendor/`](./vendor/). The
matched-arm protocol is documented in [`protocol.md`](./protocol.md); the
rubric definitions in [`rubric.md`](./rubric.md); the proof-of-completion
spec in [`proof.md`](./proof.md).

## Arms

1. **substrate-ON** — datafetch code-mode workspace with observer + lib-cache
   live; learned `df.lib.*` interfaces accumulate across the run.
2. **substrate-OFF** — same datafetch code-mode workspace but with
   `DATAFETCH_DISABLE_LEARNING=1` (skips `hydrateFamilyLibCache`,
   `installObserver`, `persistFamilyLibCache`).

These are the two arms in the matched-arm paired comparison. They share the
identical prompt skeleton, the identical agent backend (`claude sonnet-4-6
--print` via the `claude-p` CLI), the identical CRAG mock-API surface, the
identical retry budget, and the identical seed.

## Reproducible Flow (target — TBD post-P4)

```bash
bash eval/crag/scripts/prepare-crag.sh         # extract vendor jsonl, build index
bash eval/crag/scripts/run-crag.sh --arm on    # substrate-ON arm
bash eval/crag/scripts/run-crag.sh --arm off   # substrate-OFF arm
pnpm tsx eval/crag/scripts/score-r1-r10.ts \
  --results-dir results/datafetch \
  --out reports/paired-comparison.md
```

## Layout

| path                    | purpose                                                              |
|---|---|
| [`README.md`](./README.md)         | this file                                              |
| [`rubric.md`](./rubric.md)         | R1-R10 definitions as scored by `score-r1-r10.ts`     |
| [`protocol.md`](./protocol.md)     | matched-arm paired-comparison spec                     |
| [`proof.md`](./proof.md)           | what counts as Goal 5 completion proof                 |
| [`runbook.md`](./runbook.md)       | step-by-step run instructions                           |
| `adapters/`                        | CRAG-side adapters (mock-API loader, dataset mapper)    |
| `configs/`                         | per-run configs (model, effort, slice)                  |
| `manifests/`                       | per-domain question manifests for stratified sampling   |
| `scripts/`                         | runner shells + score-r1-r10.ts                         |
| `vendor/`                          | the CRAG dataset jsonl (downloaded at prep-time)        |
| `results/datafetch/<run-id>/`      | per-run artefacts (trajectories, scores, scorecards)    |
| `reports/`                         | rolled-up paired-comparison reports + analysis JSON     |
