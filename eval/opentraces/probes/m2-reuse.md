# M2 Reuse-Density Kill-Gate Pre-Registration

Plan: `kb/plans/012-opentraces-arms-experiment.md`
Episode log: `experiments/episodes/05-opentraces-arms/RUN-LOG.md`
Pre-registered: 2026-06-10, before any measured M1 or M2 driver session.
Verdict owner: supervisor. Build agent records evidence only; verdict remains PENDING.

## Threshold

Plan 012 R8, verbatim:

> **Kill-gate M2, reuse density (R11 pre-flight):** ~20-task probe; frozen-lib warm reuse must fire on >=40% of eligible held-out siblings (calibrated to SkillCraft R7=0.846). FAIL = STOP (the corpus is build-able but not reuse-live; md-memory comparison still proceeds in a successor plan).

## Protocol

- M2 is skipped unless M1 cleanly satisfies both measurement criteria:
  - >=1 helper crystallised
  - >=1 helper passed replay and became callable
- Freeze the M1-built library before starting M2.
- Run approximately 20 held-out sibling tasks drawn from siblings 6-8.
- Run each held-out sibling in a fresh process with the frozen library.
- Use isolated `DATAFETCH_HOME` under `eval/opentraces/probes/m2-runs/`.
- Do not read or write `~/.opentraces`.
- Driver command for every measured session is exactly:

```bash
claude -p --model claude-sonnet-4-6 --safe-mode --no-session-persistence
```

- Keep a combined M1+M2 model-context token ledger and stop at 20,000,000 driver tokens.
- Do not edit `src/**`, existing `eval/harness/**`, sealed docs, personas, solvers, `pack.jsonl`, or `templates/pack_spec.py`.
- Do not expose `SCHEMA-TRUTH.md`, `vendor/schema-facts.json`, schema field names, store paths, event type identifiers, trace ids, or content hashes to driver prompts or mounted workspaces.

## Evidence To Record

For each held-out task, record:

- task id
- persona
- template
- sibling index
- whether the task is eligible for frozen-library reuse
- whether `df.lib.*` was called
- which helper was called
- driver token usage
- trajectory path
- snippet result path
- frozen library path used

Final M2 table columns:

| task | eligible? | df.lib called? | helper |
|---|---:|---:|---|

Compute and report:

`eligible_reuse_rate = count(eligible tasks with df.lib called) / count(eligible tasks)`

The supervisor, not the build agent, assigns the final M2 verdict.

---

Supervisor verdict (2026-06-11): **INVALID.** 24/24 reuse measures obedience to a scripted scaffold calling a seed that implements the answers (see RUN-LOG Attempt 3). The R8 threshold (>=40% eligible organic reuse) remains untested. Re-run as M2b under the corrected seed contract; this file's pre-registered thresholds stand unchanged.

---

## M2b Corrected Re-Run Pre-Registration

Pre-registered: 2026-06-11, before any measured M1b or M2b driver session in the corrected re-run.
Verdict owner: supervisor. Build agent records evidence only; verdict remains PENDING.

Threshold: Plan 012 R8 remains unchanged. Frozen-library warm reuse must fire on at least 40% of eligible held-out siblings.

Corrected protocol:

- M2b is skipped unless M1b produces at least one substance-qualifying helper and at least one such helper passes replay and becomes callable.
- Eligibility is restricted to held-out sibling tasks whose template produced a substance-qualifying callable helper during M1b.
- Freeze only M1b helpers that are both substance-qualifying and callable after replay.
- Run at least 20 held-out sibling tasks drawn from siblings 6-8 in fresh processes under `eval/opentraces/probes/m2b-runs/`.
- Driver command for every measured session is exactly `claude -p --model claude-sonnet-4-6 --safe-mode --no-session-persistence --output-format json <prompt>`.
- Prompt contract: reuse preference only. If a suitable frozen helper exists, prefer it; otherwise compose from `df.db` primitives and generic utilities. Never name a specific helper together with the answer's arguments.
- Do not count generic seed utility calls (`groupSum`, `countBy`) as learned-helper reuse.
- Record answer correctness vs pack gold per task as non-gating evidence.
- Keep the corrected remaining budget cap at 17,900,000 model-context driver tokens; stop at cap.

M2b table columns:

| task | eligible? | df.lib called? | helper | answer-correct-vs-gold? |
|---|---:|---:|---|---|

Artifact paths:

- Summary: `eval/opentraces/probes/kill-gate-summary-m1b-m2b.json`
- Ledger: `eval/opentraces/probes/token-ledger-m1b-m2b.json`
- Session evidence: `eval/opentraces/probes/m2b-runs/`
