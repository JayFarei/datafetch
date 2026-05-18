# CRAG eval runbook

> Operator notes for running the CRAG matched-arm paired comparison. Mirrors
> `eval/skillcraft/runbook.md`. Filled in incrementally as the harness lands.

## Prep (P3 — TBD)

```bash
# from the worktree root
bash eval/crag/scripts/prepare-crag.sh
```

What it does (target):

1. Downloads CRAG dataset jsonl (validation + public test = 2,706 records)
   from facebookresearch/CRAG to `eval/crag/vendor/raw/`.
2. Validates schema (interaction_id / query / answer / alt_ans / domain /
   question_type / static_or_dynamic / popularity / search_results).
3. Builds per-domain question manifests under `eval/crag/manifests/`
   stratifying by question_type × popularity × dynamism.
4. Drops mock-KG dataset under `eval/crag/vendor/mock_kg/` (the 2.6M-entity
   KG, separate download from facebookresearch/CRAG mock_api/cragkg/).

## Small-N probe (P6 — TBD)

```bash
bash eval/crag/scripts/run-crag.sh \
  --arm on \
  --manifest eval/crag/manifests/small-n-50.json \
  --out-dir eval/crag/results/datafetch/<run-id>-on

bash eval/crag/scripts/run-crag.sh \
  --arm off \
  --manifest eval/crag/manifests/small-n-50.json \
  --out-dir eval/crag/results/datafetch/<run-id>-off

pnpm tsx eval/crag/scripts/score-r1-r10.ts \
  --on eval/crag/results/datafetch/<run-id>-on \
  --off eval/crag/results/datafetch/<run-id>-off \
  --out eval/crag/reports/<run-id>-paired-comparison.md
```

## Full eval (P8 — TBD)

Same as small-N but with `--manifest eval/crag/manifests/full-2706.json`.
Single-shot; ~$50-150 in Anthropic API time depending on substrate-ON cost
deltas.

## SkillCraft non-regression re-run (every iteration, P7+)

```bash
# from the worktree root
pnpm eval:skillcraft  # uses the iter164-equivalent config
```

Compare R1 / R2 / R3 against the floors in
`experiments/2026-05-goal5-crag/STATUS.md` § "P1/iter164 baseline".

## Standard preflight

Before any iteration:

```bash
pnpm typecheck        # clean
pnpm test             # 374/374 passing
git status            # working tree state explicit
git log --oneline -5  # baseline commits visible
```
