# Ladder build spec (plan 016 → working system) — Fable designer brief

Authoritative companion to `kb/plans/016-online-promotion-ladder.md`. The acceptance gate is `./verify/ladder.sh eval/ladder/runs/demo` GREEN on every check, run from the worktree root against committed artifacts. Every design decision below exists to satisfy a specific verifier check; when in doubt, read `verify/ladder.sh` and build what it re-observes. Closes #1 when the PR lands.

## 0. Frozen surfaces (hard rule)

`verify/ladder.sh`, `verify/.checksums`, `prereg/ladder-boundaries.json` are READ-ONLY. If you believe the verifier is wrong, STOP and return a finding; never edit it to get green. Any diff touching `verify/` or `prereg/` fails the final audit.

## 1. What is being proven (and what is not)

Proven by this PR: the ladder MECHANICS work end to end — typed contracts enforced, shadow pairs well-formed with a leak-free masked arm, evidence-boundary promotion, drift demotion on both observed edges, negative controls held, temporal-holdout generalisation, second-tenant run with zero `src/` diff, graceful floor. Per-user learning = the two tenants' ladders diverge from their own traffic and inline-rederivation falls with usage. System learning = tenant alpha's promoted procedure is offered as a SUGGESTION into tenant beta's quarantine (it must then earn promotion from beta's own paired evidence or stay put) + aggregate distillation curves.

NOT proven (do not claim anywhere): that helpers beat inline for a frontier model, or that agent-authored procedures promote under live traffic (plan 016 P4, open). Every artifact carries `"driver": "scripted"`. The demo driver is a deterministic scripted policy executing REAL code over REAL mounted fixture data; turns are MEASURED executor round-trips, never constants.

## 2. Layout

- `src/ladder/` — all system code (TypeScript, repo conventions, vitest for units).
- `bin/ladder-replay` — executable; interfaces in §5.
- `fixtures/tenants/alpha/snapshot/` (support-tickets store) and `fixtures/tenants/beta/snapshot/` (orders store) — small, committed, schema-distinct JSON datasets.
- `lib/seeds/` — curated seed procedure sources (committed). MUST NOT reference `templateId`, `pack.jsonl`, `solvers/`, or import from `eval/` (V7:G3 greps for exactly these).
- `eval/ladder/runs/demo/` and `eval/ladder/runs/demo-tenant2/` — committed evidence (the verifier's RUN_DIR and its `-tenant2` sibling). Root `/runs/` is gitignored; do not write evidence there.
- `eval/ladder/runs/demo/REPORT.md` + `curves.json` — the learning-evidence dashboard (per-tenant promoted sets, inline-rederivation curve by episode index, DL-per-intent, depth).

## 3. Artifact contract (exact fields the verifier reads — do not rename)

`episodes.jsonl`, one row per episode:
`{episodeId, ts (epoch seconds, number), commit (git HEAD at run time), preregHash (row 1 at minimum; = sha256 of jq -cS prereg/ladder-boundaries.json), tenant, driver: "scripted", query, snapshotHash, arm: "exposed"|"masked", pairId, promptPath (repo-root-relative, file MUST exist on disk), answerSchemaOk (bool), abstained, drifted, turns (measured), lineage: [procedureIds on the answer path], pairWin (bool, exposed rows)}`
Plus one adversarial row: `{fixture: "prose-in-string", contractRejected: true, answerSchemaOk: true, ...}` proving the contract can reject (V1 fails without it).

`ladder-state.json`, map procedureId → `{state: quarantine|shadow|candidate|promoted|deprecated, provenance: curated|agent|compressor|control, promotedAt (ts), evidence: {pairs, wins, boundaryRef}}`. Required control keys, exactly: `shallow-control`, `degenerate-control` (must never reach promoted), and `stale-clone-control` with `driftProbe: {stateBeforeMutation: "promoted", stateAfterNextEpisode: "quarantine", abstentionRecorded: true}` produced by ACTUALLY running the forced-drift probe (mutate the snapshot, run the next episode, observe both edges), never by writing the JSON directly.

`promotions.jsonl` — every gate decision `{decision: "promote"|"reject", id, ts, boundaryRef?, reason}`. V4:inert requires BOTH ≥1 reject and ≥1 promote over the run.

`floor-probe.json` — `{maskedServeOk: true, driftAbstained: true}` from actually running a fully-masked episode and a drifted episode.

`demo-tenant2/episodes.jsonl` + `demo-tenant2/summary.json` with `{terminalState: "promotions-with-wins" | "clean-floor"}`; both runs at the same commit so `git diff <c1> <c2> -- src/` is empty (V7:G2).

## 4. Semantics the verifier enforces

- Pairs: exactly 2 rows per pairId, same query + snapshotHash, |Δts| ≤ 600s, arms = {exposed, masked}. Masked prompt files must contain ZERO occurrences of `df.lib`, `apropos`, `df.d.ts`, `man(` — write the actual prompt text to disk, the verifier greps the file, not your config.
- Promotion: only via boundary artifact with pairs ≥ 30 (prereg minPairs) and win stats; promotion without boundaryRef = red (V5). At least one NON-control promotion must exist per tenant-alpha run.
- Temporal holdout (V7:G1): every promoted procedure needs ≥5 exposed post-promotion episodes with pairWin rate ≥ 0.60 (prereg holdoutFloor). Schedule the demo so promotion happens with enough traffic remaining.
- Ablation (V6): every promoted procedure must be load-bearing — replaying its origin episode with the procedure removed must CHANGE the committed answer. No decorative shims.
- Drift fingerprint: hash of snapshot source files; on mutation, next episode must demote + abstain (never serve the stale answer).

## 5. `bin/ladder-replay` interfaces (V2/V6 shell out to these exact flags)

- `bin/ladder-replay --self-test --double-run` → exit 0 iff replaying pinned fixture episodes twice yields byte-identical answers.
- `bin/ladder-replay --ablate-promoted --state <ladder-state.json> --episodes <episodes.jsonl>` → exit 0 iff every promoted procedure's removal changes its origin episode's replayed answer; exit 1 naming the decorative procedure otherwise.

## 6. Demo shape (per tenant)

Curated seeds enter quarantine → shadow (earn genericity on ≥k distinct real calls) → candidate → promoted (boundary crossed on ≥30 pairs) → keep serving ≥5+ post-promotion pairs. Alpha and beta have different intents/queries so promoted sets diverge (per-user learning). After alpha promotes, its winner is suggested into beta's quarantine (system learning) and must earn its own way. Mid-run on alpha: forced-drift probe on `stale-clone-control`. End of run: floor probe. Negative controls run throughout and are rejected by the gate (feeding V4:inert's reject count).

## 7. Order of work

S1 core substrate (types/contracts, snapshot+fingerprint, executor with measured turns, replay bin, fixtures) → S2 ladder (pairing, state machine, boundary, controls, drift+floor probes) → S3 demo (scripted driver, both tenants, evidence emission, curves/REPORT). Each stage: vitest units green, then commit (`feat(ladder): ... Refs #1` + Co-Authored-By trailer). Run `./verify/ladder.sh eval/ladder/runs/demo` early and often; checks flipping BLOCK→RED→GREEN is the expected progression.
