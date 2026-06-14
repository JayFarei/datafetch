# M1c Crystallisation Kill-Gate Pre-Registration

Plan: `kb/plans/012-opentraces-arms-experiment.md`
Episode log: `experiments/episodes/05-opentraces-arms/RUN-LOG.md`
Pre-registered: 2026-06-11, before any measured M1c driver session.
Verdict owner: supervisor. Build agent records evidence only; verdict remains PENDING.

## Threshold

Plan 012 R7 remains the threshold, with RUN-LOG Attempt 3's corrected substance criterion layered on top. PASS evidence requires at least one helper crystallised, at least one substance-qualifying helper, and at least one such helper passing replay to callable.

## One Pre-Registered Change From M1b

Set `DATAFETCH_GATE_PURE_COMPUTE=1` for phase-1 learning sessions. This is the documented substrate opt-in that admits single-call `df.db.*` plus `df.answer` trajectories to the observer gate.

No other M1b protocol variable changes.

## Protocol

- Run at least eight live driver sessions: two per persona P1, P2, P3, and P4, using BUILD siblings 1-5.
- Use `eval/opentraces/probes/m1c-runs/` for isolated `DATAFETCH_HOME` directories.
- Driver command for every measured session is exactly `claude -p --model claude-sonnet-4-6 --safe-mode --no-session-persistence --output-format json <prompt>`.
- Interface mode: `hooks-draft`; learning ON; governance replay gate ON.
- Seed contract: no answer-key seed, no `templateId` dispatch, no per-template branches, and no window/persona/skill semantics. The runner may expose only generic template-blind `groupSum` / `countBy`-grade utilities, or no seed.
- Workspace contract: the driver workspace contains `task.md`, `df.d.ts`, and an empty `scripts/` directory. No pre-written `scripts/answer.ts` and no hidden probe contract inside the workspace.
- Prompt contract: reuse preference only. If a suitable frozen helper exists, prefer it; otherwise compose from `df.db` primitives and generic utilities. Never name a specific helper together with the answer's arguments.
- Substance criterion: a helper counts only when its source captures agent-authored composition, either by `authorFromSource` capture or by at least two substantive steps beyond a single seed-lib call, and the helper source ties origin to the task question rather than snippet text.
- Record answer correctness vs pack gold per task as non-gating evidence.
- Keep the remaining budget cap at 17,600,000 model-context driver tokens; stop at cap.

M1c table columns:

| session | persona | template | gate outcome/reason | crystallised? | substance-qualifying? | callable-after-replay? | correct-vs-gold? |
|---|---|---|---|---|---|---|---|

Artifact paths:

- Summary: `eval/opentraces/probes/kill-gate-summary-m1c-m2c.json`
- Ledger: `eval/opentraces/probes/token-ledger-m1c-m2c.json`
- Session evidence: `eval/opentraces/probes/m1c-runs/`
