---
title: "feat: Online promotion ladder — plan and grounded verifier (loopcraft-forged)"
summary: "Build datafetch as a governed online loop: typed substrate + shadow-pair counterfactual harness + verifier-gated promotion ladder, with candidates from curated seeds, in-episode agent authoring, and a deferred compression slow-pass. This plan pairs every phase with a grounded (T2/T3) verifier that re-observes run artifacts, never narration. Every check is a frozen regression against a failure this repo has already shipped once (M1 circular seed, armL empty-gold headline, 0/22 inert gate, M1c thin shim). The verifier is born red: verify/ladder.sh runs today and fails on every claim, and the build is done when it is green for the right reasons, proven by engineered negatives."
type: feat
status: proposed
date: 2026-07-01
related_research:
  - kb/plans/014-codeopt-code-as-external-state.md
  - kb/plans/015-procedure-grammar-induction.md
  - kb/br/19-skill-library-baseline-ladder-and-paired-eval-methodology.md
---

# Online Promotion Ladder — Plan + Grounded Verifier

## 0. What this replaces

Plans 014/015 treat promotion as an offline experiment that must be designed perfectly in advance (hence the power-analysis contortions the design review broke). This plan makes promotion an online, verifier-scored, counterfactual-paired lifecycle: the environment is the experiment, running continuously, with the honest answer always recomputable from artifacts. Synthesis is commoditized (curated seeds, in-episode `df.author`, a deferred compression pass all enter the same ladder at quarantine); the differentiated asset is the environment that can prove a procedure is earning its keep.

## 1. Done-claims and blast radius (loopcraft step 1)

The one-sentence claim the verifier must prove: **"The promotion ladder, running on live paired traffic over a typed substrate, promotes only procedures that verifiably win their counterfactual, demotes on drift within one episode, and produces the same trustworthy verdicts on a second corpus with zero code changes."**

Decomposed into six checkable claims:

- **C1 Substrate.** Every episode commits a schema-valid typed answer; replay of any pinned commit is byte-deterministic; a mutated snapshot flips the drift fingerprint.
- **C2 Counterfactual integrity.** Every shadow pair is same-query, same-snapshot, interleaved within a time window, and the masked arm's actual outbound prompts contain zero library surface.
- **C3 Ladder soundness.** Three permanent negative controls behave: a shallow PokeAPI-class helper never reaches promoted; a degenerate always-empty-answer procedure never reaches promoted; a stale clone demotes to quarantine on the first episode after a forced drift, with an abstention recorded.
- **C4 Objective.** At least one procedure reaches promoted through the full ladder with a pre-registered sequential boundary crossed on paired wins, and its provenance (curated | agent | compressor) is recorded. Whether any agent-authored procedure promotes is reported as a finding, never assumed.
- **C5 Generalisation.** G1: promoted procedures keep winning on traffic that arrives after their promotion timestamp (temporal holdout). G2: the entire pipeline runs on a second corpus with an empty `src/` diff and reaches a decisive terminal state (promotions with wins, or a clean all-demoted floor). G3: no curated or authored seed references gold artifacts (anti-circularity).
- **C6 Graceful floor.** With the library fully masked, the product still serves typed answers and abstains under drift; an all-demoted library renders as flat/empty on the dashboard, not as an error and not hidden.

**Blast radius: HIGH.** Not money, but a repeat of the specific institutional failure this repo has had three times: a wrong result believed and cited (M1 "24/24 reuse" was a circular seed; the +13.5pp headline hid an 11/19 empty-gold caveat; "governance works" rested on hand fixtures while the live gate passed 0/22). At high blast radius, T0 self-claims and T1 logs are inadmissible for C2-C5; every verdict must be recomputable from artifacts the build agent cannot author (T2 provenance, T3 replay).

## 2. Defeaters (loopcraft step 2) — each one has already happened

| # | Defeater (the silent-wrong nightmare) | Precedent in this repo |
|---|---|---|
| D1 | A seed embeds the answer key, ladder "wins" are circular | M1: `opentracesAggregate.ts` switch-cased on `templateId` (RUN-LOG A3, ruled INVALID) |
| D2 | Promotion on degenerate answers that happen to match trivial gold | armL: 11/19 wins were empty-gold `[]`; auditor mandated the caveat |
| D3 | The gate is inert: wired, recorded, never actually deciding | SAC-PoC: `governanceGateApplied=22, governanceGatePassed=0`, yet "governance works" was claimed from hand fixtures |
| D4 | Masking leaks: the "counterfactual" arm still sees the library | New risk, no precedent needed: one residual `df.d.ts` in the masked prompt voids every paired delta |
| D5 | Pairs aren't pairs: different snapshots or sessions, drift confound | br/19's whole reason for interleaved same-session pairing |
| D6 | Usage-gating regression: promoted because called N times | The exact failure mode 014 §5 exists to prevent |
| D7 | Boundary peeking: sequential thresholds tuned after seeing data | Garden-of-forking-paths; the review found the power arithmetic already drifting (~80 vs ~130) |
| D8 | Thin shims and decorative credit: procedure on the path but not load-bearing | M1c: crystallised helper with `substantive_step_count=0`, never callable |
| D9 | Typed-answer bypass: prose stuffed in a string field, schema too loose | The known LLM path of least resistance; voids C1 and every postcondition |
| D10 | Works only on the dark-store; corpus-specific glue everywhere | CRAG/FinChain history: every harness so far was corpus-shaped |
| D11 | The build agent weakens the verifier to get green | Documented agent behavior class; loopcraft pattern 3 |
| D12 | Post-promotion decay: procedure won its own promotion traffic, loses after | Train-on-test in time; nothing currently prevents it |

## 3. Rung binding (loopcraft step 3)

| Defeater | Rung | Check |
|---|---|---|
| D1 | T3 static + ablation | Grep seed/authored sources for gold identifiers (`templateId`, `pack.jsonl`, `solvers/`, imports from `eval/`); zero hits. Plus V6 ablation. |
| D2 | T3 fixture | Degenerate always-`[]` control procedure injected at quarantine; verifier asserts it never reaches promoted; empty/trivial answers excluded from win counting by rule. |
| D3 | T3 re-observed transition | Anti-inert invariant: over the run's lifetime the gate must show BOTH nonzero rejections AND nonzero passes across fixtures; drift demotion observed on both edges (state before forced snapshot mutation, state after next episode). A gate that never rejects, or never passes, is unproven. |
| D4 | T3 artifact grep | Masked-arm episodes must reference the actual outbound prompt file; verifier greps it for `df.lib`, `apropos`, `man(`, `df.d.ts`; zero tokens. Config is narration; the prompt file is the world. |
| D5 | T2 provenance | Every `pairId` has exactly 2 rows, identical `query` and `snapshotHash`, timestamp gap under the pinned window, arm alternation passes a runs test. |
| D6 | T2 provenance | Every promotion record must reference a boundary artifact with `pairs >= prereg.minPairs` and the win statistic; a promotion without one is red. High-usage 50%-win fixture must not promote. |
| D7 | T2 git ancestry | `prereg/ladder-boundaries.json` must exist in a commit that is an ancestor of the first episode's recorded commit; runtime config hash must equal the prereg hash. |
| D8 | T3 replay ablation | For every promoted procedure: replay its origin episode with the procedure removed; the committed answer must change. Unchanged answer = decorative = red. |
| D9 | T3 schema + adversarial fixture | Strict schemas (no free-string answer payloads for structured intents); a prose-in-string fixture must be rejected by the contract validator. |
| D10 | T3 differential | Second-corpus run directory with `git diff --stat` empty on `src/` between the two runs' pinned commits, and a decisive terminal state recorded. |
| D11 | T2 checksum | `sha256sum -c verify/.checksums` over the verifier and fixtures before any verdict is read. |
| D12 | T3 temporal holdout | Win-rate recomputed only over pairs with `ts > promotedAt`; must clear the pre-registered floor. |

## 4. The wired verifier (loopcraft step 4)

One command: `verify/ladder.sh [RUN_DIR]` (default `runs/ladder`). Deterministic, stdlib+jq, seconds to run, exits nonzero on any red, prints one `CHECK:<id> <RED|GREEN|BLOCK> <reason>` line per check. BLOCK (verifier broken or high-assurance precondition absent) is never a pass. It reads only world-state: `episodes.jsonl`, `ladder-state.json`, `promotions.jsonl`, prompt files, git history, fixture outcomes. It never reads agent logs or claims.

### Artifact contract (pre-registered here; the build must produce exactly this)

- `runs/ladder/episodes.jsonl` — append-only; one row per episode: `{episodeId, ts, tenant, commit, query, snapshotHash, arm: "exposed"|"masked", pairId, promptPath, answer, answerSchemaOk, abstained, drifted, turns, lineage: [procedureIds]}`.
- `runs/ladder/ladder-state.json` — per procedure: `{id, state: quarantine|shadow|candidate|promoted|deprecated, provenance: curated|agent|compressor|control, promotedAt?, evidence: {pairs, wins, boundaryRef}}`.
- `runs/ladder/promotions.jsonl` — every transition with evidence refs.
- `prereg/ladder-boundaries.json` — `{minPairs, winFloor, holdoutFloor, pairWindowSec}`; committed before the first episode.
- `verify/fixtures/` — the three C3 negative controls plus the D9 prose-in-string sample; injected by the harness, asserted by the verifier.

### Checks

- V0 prereg-ancestry (D7), V1 typed-answers (D9, C1), V2 replay-determinism (C1), V3 pair-integrity + masking (D4, D5, C2), V4 negative-controls + drift-edges + anti-inert (D2, D3, C3), V5 promotion-provenance (D6, C4), V6 credit-ablation (D1, D8), V7 generalisation G1/G2/G3 (D10, D12, C5), V8 graceful-floor (C6), V9 tamper (D11).

V2, V6 and the drift half of V4 shell out to the replay runner (the P0 executor); until it exists they BLOCK, which is correct: a missing precondition on a high-assurance check is an error, never a skip.

## 5. Prove it goes red (loopcraft step 5)

Two layers, both mandatory:

1. **Born red.** `verify/ladder.sh` runs against today's repo and must fail on every claim, because nothing is built. This is recorded below in the RUN-LOG. Done = the same command green, for the right reasons.
2. **Engineered negatives, forever.** The C3 fixtures are permanent manufactured failures (loopcraft pattern 8): the shallow control, the degenerate control, and the forced-drift stale clone run in CI on every change to the ladder. If any of them ever promotes, or the drift demotion fails to fire on the observed transition, the verifier goes red regardless of how good the headline numbers look. The verifier is proven red-capable on every release, not once.

Additionally, each check's individual red is engineered before its green is trusted: V3 by planting one `df.lib` token in a masked prompt fixture, V5 by writing a promotion row with no boundary ref, V6 by promoting a fixture whose removal does not change the replayed answer, V7-G3 by adding a `templateId` reference to a seed copy.

## 6. Build phases, each gated by its verifier slice

| Phase | Build | Exit = these checks green |
|---|---|---|
| P1 (wk 1-2) | Typed answer contracts, replay executor (generalise `replayOnTrajectory`), drift fingerprints as state, shadow-pair harness on tenant 1 | V0, V1, V2, V3 |
| P2 (wk 3) | Curated seed set (anti-circularity enforced), minimal ladder (quarantine/promoted/deprecated), drift demotion | V4, V7-G3, V8 |
| P3 (wk 4-5) | Shadow/candidate rungs, sequential boundary, ε-masking, dashboards from artifacts only | V5, V6 |
| P4 (wk 6+) | `df.author` in-episode action; report whether any agent-authored procedure promotes (the P0 question, answered on live traffic) | V5 with provenance=agent reported either way |
| P5 (gated) | Second corpus end-to-end; then, only over promoted+used procedures, the 015 compression slow-pass as one more candidate source | V7-G1, V7-G2 |

Kill honesty: if V4 stays green while V5 finds zero promotions after the pre-registered traffic volume, the finding is "the accept-set is empty on this corpus" and the product falls to its C6 floor (typed substrate + audit + drift abstention). That outcome ships; it is not a failure of the verifier, it is the verifier working.

## RUN-LOG

- 2026-07-01 — Plan forged (loopcraft). Verifier `verify/ladder.sh` written and executed at HEAD: born-red confirmed, see commit for output. No build yet.
