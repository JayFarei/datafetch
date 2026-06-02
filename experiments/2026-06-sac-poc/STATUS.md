# STATUS — SaC-aligned PoC on SkillCraft

> Snapshot: 2026-06-02. Update when a stream lands or a phase closes.

## Current phase: BUILD

Contract keystone landed; four build streams may now proceed in parallel
against the pinned interfaces in [`CONTRACT.md`](./CONTRACT.md). Branch:
`sac-poc-build` (main working tree). Pre-registration values are NOT yet
frozen (that is Milestone 8, gated on phase-1 build cost).

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
| S3 scorer | `score-cross-arm.ts` (new), `p1-paired-analysis.py` extension | not started |
| S4 preseed + fixtures | `skills/datafetch/SKILL.md`, `eval/skillcraft/fixtures/sac-poc/` (new) | not started |

## Milestone trace (from plan 009)

1. [ ] hooks-draft per-arm wiring + governance-as-callability framing — S1/S2
2. [ ] shared prompt renderer + machine-checked Arm-1 parity gate — S1
3. [ ] preseed rewrite (composition few-shot; name df.tool) — S4
4. [ ] arm1 inline-rewrite-no-persistence + arm3 ablation-without-governance — S1/S2
5. [ ] arm4 two-phase fresh-process + arm5a results-cache + arm5b recipe + cache-hit assertion — S1
6. [ ] cross-arm scorer (M* + CI, attribution, clustered NI) — S3
7. [ ] three deterministic governance probes + blind 20+20 — S2/S4
8. [ ] pre-register + run k≥5 interleaved seeds — all
9. [ ] blog + interactive demo — (post-build)

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
