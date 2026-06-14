# M2c Reuse-Density Kill-Gate Pre-Registration

Plan: `kb/plans/012-opentraces-arms-experiment.md`
Episode log: `experiments/episodes/05-opentraces-arms/RUN-LOG.md`
Pre-registered: 2026-06-11, before any measured M2c driver session.
Verdict owner: supervisor. Build agent records evidence only; verdict remains PENDING.

## Threshold

Plan 012 R8 remains unchanged. Frozen-library warm reuse must fire on at least 40% of eligible held-out siblings.

## Protocol

- M2c is skipped unless M1c produces at least one substance-qualifying helper and at least one such helper passes replay and becomes callable.
- Eligibility is restricted to held-out sibling tasks whose template produced a substance-qualifying callable helper during M1c.
- Freeze only M1c helpers that are both substance-qualifying and callable after replay.
- Run at least 20 held-out sibling tasks drawn from siblings 6-8 in fresh processes under `eval/opentraces/probes/m2c-runs/`.
- Driver command for every measured session is exactly `claude -p --model claude-sonnet-4-6 --safe-mode --no-session-persistence --output-format json <prompt>`.
- Prompt contract: reuse preference only. If a suitable frozen helper exists, prefer it; otherwise compose from `df.db` primitives and generic utilities. Never name a specific helper together with the answer's arguments.
- Do not count generic seed utility calls (`groupSum`, `countBy`) as learned-helper reuse.
- Phase 2 has no learning and does not set `DATAFETCH_GATE_PURE_COMPUTE`.
- Record answer correctness vs pack gold per task as non-gating evidence.
- Keep the remaining budget cap at 17,600,000 model-context driver tokens; stop at cap.

M2c table columns:

| task | eligible? | df.lib called? | helper | correct-vs-gold? |
|---|---:|---:|---|---|

Artifact paths:

- Summary: `eval/opentraces/probes/kill-gate-summary-m1c-m2c.json`
- Ledger: `eval/opentraces/probes/token-ledger-m1c-m2c.json`
- Session evidence: `eval/opentraces/probes/m2c-runs/`
