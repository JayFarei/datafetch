# STATUS — SaC-aligned PoC on SkillCraft

> Snapshot: 2026-06-03. Update when a stream lands or a phase closes.

## Current phase: PHASE-1 RESULT IN (negative) — AWAITING USER DECISION

The pre-registered confirmatory run COMPLETED and the Phase-1 hypothesis is
EMPIRICALLY FALSIFIED on a methodologically sound harness. See the honest
synthesis in [`PHASE-1-FINDINGS.md`](./PHASE-1-FINDINGS.md) and the attempt
trail in [`RUN-LOG.md`](./RUN-LOG.md). Headline: arm4 warm reuse costs MORE
than arm1 inline in every cost unit (M\* = +Infinity, claimUpheld=false) and
is less correct (arm4 h1x 2/5 vs arm1 4/5). This is reported as a rigorous
negative, not fabricated into a positive.

Phase 2 (generalize the substrate) is half-verified: #1 (answer-kit equality
gate) + #2 gate-replay half are landed and green, and verification criterion (b)
"a non-numeric helper reaches validated-typescript maturity via the registry" is
MET (RUN-LOG Attempt 22, `tests/sac-nonnumeric-maturity.test.ts`). The other
verification criterion (a) `grep -rn` clean is NOT met: #3 (de-hardcode
src/observer) and #4 (df.tool.\* in regenerateManifest) are investigated and
BLOCKED on user decisions (RUN-LOG Attempts 18-19). Phase 3 not started.

**Three user decisions unblock the program:** (1) the Phase-1 reframe given the
null; (2) the strategic headline (cost-island vs governance-under-staleness vs
SDK); (3) the Phase-3 corpus + df.tool.\* semantics. See the consolidated table
at RUN-LOG Attempt 19.

Branch: `sac-poc-build` (main working tree). Gates green: typecheck 0, unit
tests 424/424, governance probes 4/4 + blind 20+20 = 0/0.

---

## Historical build record (Phase-1 harness construction)

> The sections below recorded the BUILD phase before the confirmatory run.
> Retained as a build record; the live state is the section above.

## Keystone deliverables (done)

- [x] `CONTRACT.md` — arm enum (`SAC_ARM`) + selector derivation; widened
      `AdapterEpisode` schema with the lifecycle cost ledger; `M*` formula
      and metric definitions; prompt-parity-hash mechanism; file-ownership
      map; governance-probe reuse of the numeric FAC replay.
- [x] `PRE-REGISTRATION.md` — `M0` placeholder (= 8, with rationale),
      attribution rule, -5pp clustered NI rule, k≥5 interleaved-seed
      protocol, qualitative governance scope.
- [x] `README.md`, `STATUS.md`.

## Build streams (parallel; one file = one owner, see CONTRACT §e)

| Stream | Owns | Status |
|--------|------|--------|
| S1 runner-core | `src/eval/skillcraftFullDatafetch.ts`, `src/eval/sacArms.ts` (new), `normalize-results.ts`, `run-sac-poc.sh` (new) | BUILT (typecheck clean): SAC_ARM selector + armConfig table (all 7 arms verified vs CONTRACT), interfaceMode set before getInterfaceMode (Risk R-1), conflict/unknown-arm fail-run invariants, shared parity renderer (arm1/arm4 masked-hash MATCH verified, binding differs), two-phase fresh-process runner (--phase/--frozen-lib, arm4 freeze), arm0 tool-withhold + toolCalls==0 assert, arm1 lib-overlay wipe, arm5a results-cache shim (TS↔Python key byte-equal verified), arm5b recipe distil/inject (<=600c), full cost-ledger emission (effectiveModelContextTokens at full weight), planner-artifact hash, normalize-results widened + legacy run still normalizes. Governance gate calls (arm2/arm4 runGovernanceGate, arm3 forceCallableWithoutGovernance) dynamic-import S2's `sacArmGovernance.ts` with a fail-safe (NOT-promoted) default until S2 lands that file. |
| S2 governance | `src/eval/sacArmGovernance.ts` (new) + probe harness | probes landed: `eval/skillcraft/probes/{governanceGate,fixtures,blindSuite}.ts` + `scripts/run-governance-probes.ts` — 3 deterministic probes PASS (arm2 declines / arm3 emits wrong-stale), blind 20+20 runs clean (0 false-accept/reject); arm3 decouple in `sacArmGovernance.ts` not started |
| S3 scorer | `score-cross-arm.ts` (new), `p1-paired-analysis.py` extension | BUILT (typecheck clean; synthetic end-to-end verified, exit 0): M* + clustered bootstrap CI, arm4-vs-5a/5b attribution, arm4-vs-1 secondary, clustered-by-question McNemar + -5pp NI, cache-hit/parity/arm0 invariants. **2026-06-02 metric decision landed (user-confirmed):** headline = full-weight model-context tokens; `parityFloorTokens` DEMOTED to a diagnostic (denominator = arm1-vs-arm4 paired full-weight difference directly); 3-unit sensitivity ladder (×1 / ×0 / ×0.1) + `claimSurvivesDollarLedger` dollar tie-breaker on M* and attribution; `governance_cost≈0` honest note. Already wired into `run-sac-poc.sh`. Guard test `tests/sac-cost-ledger.test.ts`. p1-paired-analysis.py extension still pending. |
| S4 preseed + fixtures | `skills/datafetch/SKILL.md`, `eval/skillcraft/fixtures/sac-poc/` (new) | not started |

## Milestone trace (from plan 009)

1. [x] hooks-draft per-arm wiring + governance-as-callability framing — S1/S2
2. [x] shared prompt renderer + machine-checked Arm-1 parity gate — S1 (parity held in the valid run)
3. [x] preseed rewrite (composition few-shot; name df.tool) — S4 (mandate preseed fires, commit d30903917)
4. [x] arm1 inline-rewrite-no-persistence + arm3 ablation-without-governance — S1/S2
5. [x] arm4 two-phase fresh-process + arm5a results-cache + arm5b recipe + cache-hit assertion — S1
6. [x] cross-arm scorer (M* + CI, attribution, clustered NI) — S3 (full-weight headline + dollar tie-breaker, 2026-06-02)
7. [x] three deterministic governance probes + blind 20+20 — S2/S4 (4/4 incl. non-numeric; blind 0/0)
8. [x] pre-register + run k≥5 interleaved seeds — all (Run 2 VALID; result NEGATIVE, see PHASE-1-FINDINGS.md)
9. [ ] blog + interactive demo — BLOCKED: downstream of a Phase-1 positive that does not exist; awaiting the reframe decision

## Open risks carried from the contract (see CONTRACT.md "Risks")

- The runner sets `DATAFETCH_INTERFACE_MODE` from `SAC_ARM` BEFORE the first
  `getInterfaceMode()` read; `getInterfaceMode` reads `process.env` lazily
  each call (`src/hooks/mode.ts:45`), so the order matters.
- `effectiveTokens` (existing, cache-subtracted) is NOT reused for the
  break-even math; the runner emits the new `effectiveModelContextTokens`
  (cache at full weight) and the scorer reads only that.
- arm3's decoupled callable-without-gate path is net-new (today
  `DATAFETCH_DISABLE_LEARNING` kills crystallisation AND the gate together).

## Verification gates (must hold before the confirmatory run)

- `pnpm typecheck` clean, `pnpm test` green after harness additions.
- Smoke run: `run-info.json` records the right `interfaceMode`/`sacArm` per
  arm; a helper becomes callable only on a replay PASS in arm2.
- arm1 vs arm4 parity hashes byte-identical-except-binding-line; run fails on
  mismatch.
- arm5a phase-2 decisive cache hits == 0.
