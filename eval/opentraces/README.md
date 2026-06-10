# OpenTraces dark-store corpus (plan 011)

Spec: `kb/plans/011-opentraces-dark-store-corpus.md`. Run ledger: `experiments/episodes/04-opentraces-corpus/RUN-LOG.md`. Status: **COMPLETE-PENDING-COMMIT** (all milestones M0-M7 done: G0 PASS at 50.06x median spread ratio with the 8/10 naive-wrong correctness finding; G1 PASS with the recurrence-key limitation disclosed; 208-row pack sealed by a 24/24-upheld Codex adversarial audit; see `SEAL-ADDENDUM.md`). The seal commit freezes the pack and closes the user-input window.

## Layout

- `seal.json` (committed): frozen-snapshot digest + inventory (18,490 files, ~11.58GB, sealed 2026-06-10).
- `SCHEMA-TRUTH.md` (committed, **QUARANTINED**, see below).
- `personas/P1..P4` (committed): persona specs with pre-registered predicted helpers. P3 = default held-out persona.
- `templates/pack.yaml` (M4): machine-readable template definitions derived from the persona files.
- `solvers/common.py` + `solvers/<template_id>.py` (M4): deterministic reference solvers; output contract is `common.emit(gold, evidence)`.
- `questions/pack.jsonl` (M5): instantiated questions + gold + evidence pointers.
- `probes/spread-probe.md` (M2/G0) and `probes/shape-probe.md` (M6/G1): kill-gate protocols and results.
- `scripts/enumerate_schema.py`: regenerates `vendor/schema-facts.json` from the snapshot.
- `vendor/` (GITIGNORED): `snapshot/` (the frozen stores) and `schema-facts.json` (contains project slugs; kept uncommitted per plan R12).

## Quarantine list (plan R3/R5, enforced before seal)

The following must NEVER appear in any agent-facing prompt, mounted workspace, or question text:

1. `SCHEMA-TRUTH.md` (in whole or in part).
2. `vendor/schema-facts.json`.
3. Schema vocabulary in question text: field names (e.g. anything matching the deny-list built from SCHEMA-TRUTH section 2-3 key names), store paths (`objects/traces/v1`, `events/v1/batches`), event_type identifiers, and `trace_id`/`content_hash` literals. Questions name entities the CONSUMER knows: projects, models, skills, files, commits, dates.
4. `personas/*.md` "predicted emergent interface" sections (the rest of a persona file is also not agent-facing; agents receive only instantiated question text).

Leak check (plan verification item 4): grep the question pack against the deny-list; zero hits required.

## Determinism contract

Solvers: stdlib only, read only `vendor/snapshot/`, no wall-clock, no randomness, no network; full pack regenerated twice must be byte-identical (plan R1). Note the pointer rule: the current envelope body is the one `current.json` points at; six traces carry stale extra bodies (SCHEMA-TRUTH section 7), so never glob-and-take-last.
