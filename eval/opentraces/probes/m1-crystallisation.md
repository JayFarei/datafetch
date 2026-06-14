# M1 Crystallisation Kill-Gate Pre-Registration

Plan: `kb/plans/012-opentraces-arms-experiment.md`
Episode log: `experiments/episodes/05-opentraces-arms/RUN-LOG.md`
Pre-registered: 2026-06-10, before any measured M1 driver session.
Verdict owner: supervisor. Build agent records evidence only; verdict remains PENDING.

## Threshold

Plan 012 R7, verbatim:

> **Kill-gate M1, crystallisation fires ($0-ish, before anything else):** >=2 live agent sessions per persona over the corpus mount; PASS requires >=1 helper crystallised AND >=1 helper passing the replay gate to callable. Known risk: the gate's db->lib dataflow heuristic and the agent-prior problem (Era 2); the mandate-strength preseed machinery from plan 009 is the sanctioned lever. FAIL = STOP, finding recorded, substrate work scoped separately.

## Protocol

- Run at least two live driver sessions for each persona P1, P2, P3, and P4.
- Use BUILD siblings only: pack siblings 1-5 for the selected templates.
- Use workspaces mounted from `eval/opentraces/vendor/snapshot/` through the records-mount path, not the live OpenTraces home.
- Use isolated `DATAFETCH_HOME` under `eval/opentraces/probes/m1-runs/`.
- Do not read or write `~/.opentraces`.
- Driver command for every measured session is exactly:

```bash
claude -p --model claude-sonnet-4-6 --safe-mode --no-session-persistence
```

- Interface mode: `hooks-draft`.
- Learning: ON.
- Governance replay gate: ON.
- Mandate-strength preseed: ON.
- Keep a combined M1+M2 model-context token ledger and stop at 20,000,000 driver tokens.
- Do not edit `src/**`, existing `eval/harness/**`, sealed docs, personas, solvers, `pack.jsonl`, or `templates/pack_spec.py`.
- Do not expose `SCHEMA-TRUTH.md`, `vendor/schema-facts.json`, schema field names, store paths, event type identifiers, trace ids, or content hashes to driver prompts or mounted workspaces.

## Evidence To Record

For each measured session, record:

- session id
- persona
- template
- sibling index
- driver command
- driver token usage
- trajectory path
- observer outcome path
- helper/lib paths
- hook manifest paths
- replay/governance decision
- whether at least one helper crystallised
- whether at least one helper became callable after replay

Final M1 table columns:

| session | persona | template | crystallised? | callable-after-replay? |
|---|---|---|---|---|

The supervisor, not the build agent, assigns the final M1 verdict.

---

Supervisor verdict (2026-06-11): **PASS on machinery, INCONCLUSIVE on substance.** The crystallise -> replay -> promote -> hydrate -> invoke pipeline fires end-to-end on this corpus (pure-plumbing risk retired). However the seeded `opentracesAggregate` embeds all eight templates' answer logic and the workspace shipped a pre-written solution scaffold, so the crystallised wrapper reflects injected, not learned, knowledge. Substance re-run (M1b) required under the corrected seed contract in RUN-LOG Attempt 3.

---

## M1b Corrected Re-Run Pre-Registration

Pre-registered: 2026-06-11, before any measured M1b driver session.
Verdict owner: supervisor. Build agent records evidence only; verdict remains PENDING.

Threshold: Plan 012 R7 remains the threshold, with RUN-LOG Attempt 3's corrected substance criterion layered on top. PASS evidence requires at least one helper crystallised, at least one substance-qualifying helper, and at least one such helper passing replay to callable.

Corrected protocol:

- Run at least eight live driver sessions: two per persona P1, P2, P3, and P4, using BUILD siblings 1-5.
- Use `eval/opentraces/probes/m1b-runs/` for isolated `DATAFETCH_HOME` directories.
- Driver command for every measured session is exactly `claude -p --model claude-sonnet-4-6 --safe-mode --no-session-persistence --output-format json <prompt>`.
- Interface mode: `hooks-draft`; learning ON; governance replay gate ON.
- Seed contract: no answer-key seed, no `templateId` dispatch, no per-template branches, and no window/persona/skill semantics. The runner may expose only generic template-blind `groupSum` / `countBy`-grade utilities, or no seed.
- Workspace contract: the driver workspace contains `task.md`, `df.d.ts`, and an empty `scripts/` directory. No pre-written `scripts/answer.ts` and no hidden probe contract inside the workspace.
- Prompt contract: reuse preference only. If a suitable frozen helper exists, prefer it; otherwise compose from `df.db` primitives and generic utilities. Never name a specific helper together with the answer's arguments.
- Substance criterion: a helper counts only when its source captures agent-authored composition, either by `authorFromSource` capture or by at least two substantive steps beyond a single seed-lib call, and the helper source ties origin to the task question rather than snippet text.
- Record answer correctness vs pack gold per task as non-gating evidence.
- Keep the corrected remaining budget cap at 17,900,000 model-context driver tokens; stop at cap.

M1b table columns:

| session | persona | template | crystallised? | substance-qualifying? | callable-after-replay? | answer-correct-vs-gold? |
|---|---|---|---|---|---|---|

Artifact paths:

- Summary: `eval/opentraces/probes/kill-gate-summary-m1b-m2b.json`
- Ledger: `eval/opentraces/probes/token-ledger-m1b-m2b.json`
- Session evidence: `eval/opentraces/probes/m1b-runs/`
