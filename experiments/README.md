# Experiments

Session-level research log for the datafetch substrate. Distinct from `docs/`
(public-facing) and `kb/` (the knowledge base / thesis). Organised by **episode**
(a coherent research arc) plus a rolling cross-episode **log**.

## Folder structure

| Path | What it is |
|---|---|
| `episodes/` | One directory per research arc. Self-contained: plan, findings, run-log, pre-registrations, figures. |
| `log/` | The rolling cross-episode narrative that spans all episodes. |
| `reports/` | Generated analysis outputs (git-ignored). |

### `log/` — the running narrative (read these to come up to speed)

- [`log/experiment-history.md`](./log/experiment-history.md) — the long arc, cold-readable: why the substrate is the way it is (Goals 1–5).
- [`log/EXPERIMENTS.md`](./log/EXPERIMENTS.md) — curated chronological iteration log (hypothesis → change → result → lessons).
- [`log/EXPERIMENT_NOTES.md`](./log/EXPERIMENT_NOTES.md) — raw scratchpad; high density on what the agent was *thinking*.
- [`log/PLAN.md`](./log/PLAN.md) — living plan; current direction + iteration schedule.
- [`log/STATUS.md`](./log/STATUS.md) — achievement / remaining-work snapshot.
- [`log/goal.md`](./log/goal.md) — canonical `/goal` condition strings (Goals 1–5).

## Episode index

| Episode | Dates | Thesis under test | Outcome |
|---|---|---|---|
| [`01-skillcraft-goals1-4`](./episodes/01-skillcraft-goals1-4/) | 2026-05 (iter1–167) | The substrate learns a generic **intent-shape interface**, not data shape, that lifts the SkillCraft baseline. | Goal 4 **MET** on iter164 (with cache-rule caveats; see the Codex audit/reframe in `log/goal.md`). |
| [`02-finchain-goal5`](./episodes/02-finchain-goal5/) | 2026-05 | **Cross-benchmark generality**: the same substrate (no benchmark-specific code) lifts a second, structurally different benchmark (FinChain) while preserving SkillCraft. | See `log/PLAN.md` Goal 5 + `episodes/02-finchain-goal5/headline-rows.md`. |
| [`03-sac-poc`](./episodes/03-sac-poc/) | 2026-06 → current | Datafetch's **governed online crystallisation** beats the ephemeral re-derivation regime — proved (or honestly falsified) via a process-validity verifier, not an outcome direction. | Single-session correctness **amortisation FALSIFIED** (conceded). Surviving claims: **C4** governance-under-staleness (CRAG), **C2** zero-src onboarding (robut WTQ), **C5** deep-helper turns (MuSiQue), **C8** persistence-as-abstraction (SkillCraft). **C4 live-prep in flight.** |

Episode 03 carries the active research strategy
([`episodes/03-sac-poc/RESEARCH-STRATEGY.md`](./episodes/03-sac-poc/RESEARCH-STRATEGY.md)),
the verifier (P1–P7 process-validity predicates, 7 terminal states), the
branch-coverage-gated pre-registrations
([`episodes/03-sac-poc/prereg/`](./episodes/03-sac-poc/prereg/)), and the
corpus recommendations
([`episodes/03-sac-poc/CORPUS-RECOMMENDATION.md`](./episodes/03-sac-poc/CORPUS-RECOMMENDATION.md)).

## How an episode works

1. Read `log/EXPERIMENTS.md` before forming a hypothesis.
2. State the hypothesis in `log/EXPERIMENT_NOTES.md`.
3. Implement against the substrate (`src/`) and the eval harness (`eval/harness/`).
4. Probe on one family, validate on a held-out pair, then the full surface.
5. Append the complete entry to `log/EXPERIMENTS.md`; commit a headline row.
6. `pnpm typecheck` clean, `pnpm test` green, working tree committed.

## Repo reorg (2026-06-04)

The repository was tidied so `src/` is purely the shippable substrate and all
eval work lives under `eval/`:

- `src/eval/` → **`eval/harness/`** (the eval drivers).
- `seeds/` → **`eval/seeds/`** (substrate seed library; loaders rewired).
- eval tests → **`eval/tests/`**; eval scripts → **`eval/scripts/`**.
- experiment docs reorganised into `episodes/` + `log/` (this file).

The substrate-purity gate for a new eval is now simply `git diff --stat src/`
(empty after onboarding). Older docs in `episodes/03-sac-poc/` phrase it as
`git diff --stat src/ ':!src/eval'`; the exclude is now a vestigial no-op since
the drivers moved out of `src/`. File-path references in the historical
run-logs that say `src/eval/...` now resolve under `eval/harness/...`.
