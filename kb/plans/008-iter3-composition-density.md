---
title: "feat: iter 3 — generic source-to-helper authoring (substrate genericity upgrade)"
summary: "Extend the observer with a shape-agnostic author that crystallises helpers from the agent's actual TS body (parameterised, replay-validated) — making the substrate's 'mount any dataset, learn the right interface from agent usage' promise literally true at the implementation level, regardless of trajectory shape."
type: feat
status: proposed
date: 2026-05-19
related_research:
  - kb/br/16-post-skillcraft-benchmark-selection.md
  - kb/plans/007-finchain-integration.md
---

# iter 3 — Generic Source-to-Helper Authoring

## The reframe — this is substrate genericity, not a FinChain extension

After 22 commits across iter 0-2e, the FinChain harness is mechanically complete and 6 of 12 Goal 5 gates PASS with real measurements. The composition-density opt-in at iter 2e-gate lets the observer ACCEPT db-only trajectories, but the AUTHOR still falls through to a primitive-replay path that throws away the agent's actual computational work. This blocks FC3/R6/R7/FC4.

**The framing trap to avoid**: treat this as "add a FinChain-shaped author path beside the existing five SkillCraft-shaped paths." That gives us a substrate with six branch points for six benchmark shapes, and tomorrow's customer dataset gets a seventh branch. That's the opposite of generic.

**The actual insight**: the five existing render paths in `src/observer/author.ts` (`renderToolFanoutEnrichmentSource`, `renderRecordToolEnrichmentSource`, `renderRecordToolFanOutSource`, `renderFanOutSource`, `generatePureSource`) are all special-cases of one general operation:

> "Given the agent's accepted trajectory: extract its parameterised TS body, validate the body replays correctly on held-out inputs, save the validated body as a callable helper."

Each existing renderer is a workaround for not having the agent's source code as substrate metadata. They reconstruct *primitive-replay* helpers from the recorded call sequence because the actual TS body wasn't captured. Once we capture the source code on the trajectory, the universal substrate operation collapses to: parameterise → validate → save.

**The product story this makes true**: "Mount any dataset, the substrate learns the right interface from how the agent uses it on that dataset." That promise is currently aspirational — the substrate only handles certain *shapes* of agent usage (tool fan-outs, record-tool chains). After iter 3, it handles any shape that the agent expresses in valid TS that produces a verifiable answer. The existing five renderers can remain for now as optimisations for high-density patterns, but they become redundant capabilities under a generic substrate, not the only mechanism.

## Why FinChain is the right first test

FinChain trajectories have shape `db.records.findExact → pure-TS computation → df.answer(numeric)`. None of the five existing renderers fit. This is exactly the shape a future customer dataset might have — read records, run domain-specific computation in TS, commit a result. If the substrate can't handle this shape generically, it can't handle any future shape generically either.

So FinChain isn't a special case to solve. It's a forcing function for the substrate-genericity upgrade that the product story requires. The same code change unlocks every future dataset whose agent usage doesn't match the existing five patterns.

## Architecture

### A. Immutable source snapshot (iter 3.1)

Add two fields to `TrajectoryRecord` (`src/trajectory/recorder.ts:43-71`):

```ts
sourceText?: string;     // the post-prepareAnswerSourceForRuntime source executed
sourceHash?: string;     // sha256 of sourceText for dedup + cache invalidation
```

Populated synchronously in `src/snippet/runtime.ts` before `onTrajectorySaved` fires. This is the foundational change — every substrate consumer that wants to look at the agent's actual work now has it as authoritative metadata, not as a racy disk read.

This change is **strictly additive** and **shape-agnostic**. It benefits the existing five renderers too (they could use it for richer parameter extraction in future), and it benefits any future substrate component. ~30 LoC; no behaviour change unless a consumer reads the new fields.

### B. Acceptance-gate threading (iter 3.2)

`src/observer/gate.ts` `GateOutcome` becomes:

```ts
export type GateOutcome =
  | { ok: true; acceptedShape?: { hasInlineComputation: boolean } }
  | { ok: false; reason: string };
```

The `acceptedShape` field carries the gate's structural assessment of the trajectory. `hasInlineComputation: true` when the trajectory's primitive call sequence is short (e.g. single db.* call) but the source snapshot indicates non-trivial inline TS work. This is a hint to the author, not a branch keyed on benchmark identity.

(The existing five renderers ignore `acceptedShape` and continue to work as before. The new generic author uses it as a routing signal — see §C.)

Backward-compatible (existing callers only check `.ok`). Worker forwards to author. ~20 LoC.

### C. The generic source-to-helper author (iter 3.3)

New file: `src/observer/authorFromSource.ts`. Function: `renderFromAgentSource(args): string | null`.

Inserted at the **end of the existing cascade** in `authorFunction` at `src/observer/author.ts:94-102` — fires only when all five existing renderers return null (i.e. the trajectory doesn't match any specialised pattern AND has an inline-computation shape). Existing SkillCraft trajectories continue to hit their specialised renderers; nothing changes for them.

The new author:

1. Reads `trajectory.sourceText` (from iter 3.1; no disk I/O)
2. Parses with `ts.createSourceFile` (parseDiagnostics checked; fail-closed)
3. **Allowlist transform** — rejects: `process.*`, `import` statements, fs/network side effects, multiple `df.answer` calls, unresolved free identifiers other than `df`
4. **Mandatory parameter extraction**: numeric-literal `const` declarations at the top of the agent's `main()` (or equivalent entry function) are promoted to helper input fields, typed via valibot `v.number()`. AST-based; dataflow-aware enough to skip derived intermediates (e.g. `const growthFactor = Math.pow(1+rate, time)` stays in the body, not promoted)
5. **Formula fingerprint as intent signature**: hash of the normalised AST of expressions involving promoted parameters. Compound interest, WACC, and stress-testing get distinct fingerprints — the worker's intentSignature dedup at `worker.ts:249` won't collapse them
6. Writes helper to `<baseDir>/lib/<tenant>/<name>.ts` with `@status: candidate` and `@quarantined: true` (D below); intent-signature is `source(<fingerprint>)`
7. Helper body returns the numeric/primitive answer directly. `fn` wrapper at `src/sdk/fn.ts:236` produces `Result.value = <answer>`. No `{value: <answer>}` double-wrap.

**Why this is generic**: it doesn't care what the trajectory's call sequence looks like. It cares about the source code the agent wrote. Whether the agent called one tool or twenty, fanned out or didn't, used `lib` helpers or didn't — if the source is valid TS that takes verifiable inputs and produces a verifiable answer, this author handles it.

**The five existing renderers stay** for now: they remain the specialised path for the trajectory shapes they were designed for, and they have the existing battle-tested test surface. In a future cleanup (out of scope for iter 3), they could be replaced by the generic author + per-shape post-processing optimisations. iter 3 leaves them untouched.

### D. Quarantine → replay → promote (iter 3.4)

A new harness step: every helper authored by `renderFromAgentSource` starts quarantined.

1. **Idempotency check**: replay the helper on the originating trajectory's inputs; assert output matches the recorded `df.answer.value`
2. **Genericity check**: replay the helper on a held-out sibling trajectory's inputs; assert FAC match against that sibling's gold value
3. Both pass → flip header from `@quarantined: true` to `@quarantined: false`; helper becomes visible in `df.d.ts`
4. Either fails → helper stays quarantined; never visible to agents; walk-artifacts counts toward R4

This is the load-bearing safety mechanism. No callable helper enters circulation without held-out replay validation. Applies to helpers from the new generic author. The existing five renderers don't go through quarantine (they have their existing validation paths); this is a new safety property for the new path only.

### E. Typed surface propagation (iter 3.5)

The validated helper's typed signature appears in `df.d.ts` (via `src/sdk/schemaRender.ts` or `src/server/manifest.ts`). Per-benchmark `AGENTS.md` files get a generic section: "When a `df.lib.*` helper's `@intent` matches your question, prefer calling it to deriving inline." This is a substrate-level prompt-rendering rule, not a benchmark-specific instruction.

### F. Disk-state aware rollback (iter 3.6)

Every authored helper carries `@substrate-version: <commit-sha>`. New script `eval/<benchmark>/scripts/sweep.ts` (template; benchmarks copy and adapt) removes helpers from older substrate versions. Rollback: `git revert <commit>` + sweep.

## Iteration schedule

| iter | scope | LoC | gating outcome |
|---|---|---|---|
| **3.0a** (PROBE) | preseed ONE hand-crafted parameterised helper for an Intermediate template into `eval/finchain/preseed-rich-helper/`; run a 4-episode warm bilateral; measure helper-call rate + FAC + tokens | ~100 (helper) + harness | If agent doesn't call the helper OR no measurable improvement: HALT iter 3 entirely — substrate's "agent calls learned interfaces" premise doesn't fit this dataset's effort-to-derive bar (P2 finding restated). File BLOCKED. |
| **3.1** | Immutable source snapshot on `TrajectoryRecord` + synchronous capture in snippet runtime | ~30 | smokes green; SkillCraft non-regression check passes |
| **3.2** | Acceptance-gate `acceptedShape` field + worker forward | ~20 | smokes green |
| **3.3** | `renderFromAgentSource` in new `src/observer/authorFromSource.ts`: AST allowlist + mandatory parameter extraction + formula fingerprint signature + numeric-direct helper output | ~300 | new tests pass; existing tests pass; SkillCraft smokes catch any unintended dispatch into the new path |
| **3.4** | Quarantine + held-out replay validator | ~150 | helpers stay quarantined when replay fails; visible when it succeeds |
| **3.5** | df.d.ts emission of validated helpers + generic AGENTS.md "prefer calling matched helpers" rule | ~80 | warm episodes on any benchmark see their validated helpers typed |
| **3.6** | Substrate-version stamping + sweep template | ~50 | rollback drill succeeds |
| **4** | operator-launched: SkillCraft full-126 + FinChain bilateral on the iter-3 substrate commit | — | R1-R9 PASS at iter164 levels (SkillCraft via existing renderers; iter 3 path dormant) AND FC1-FC5 PASS (FinChain via the new generic author) |
| **5** | declare Goal 5 met OR file structural blockers | — | — |

Total code: ~830 LoC across `src/trajectory/`, `src/snippet/`, `src/observer/` (one new file + small additive edits to 3 existing files). Zero modification to the existing five renderers in `src/observer/author.ts`.

## Non-regression strategy

**Per-commit gate** (all green before commit):

1. `pnpm typecheck` (≤10s)
2. `pnpm exec vitest run tests/observer-author.test.ts tests/observer-gate.test.ts tests/observer-template.test.ts tests/skillcraft-full-datafetch-planner.test.ts` (~40s)
3. `pnpm test` full (~3 min)
4. **Diff inspection**: any change to the five existing render paths in `src/observer/author.ts` (specifically the bodies of `renderToolFanoutEnrichmentSource`, `renderRecordToolEnrichmentSource`, `renderRecordToolFanOutSource`, `renderFanOutSource`, `generatePureSource`) is REJECTED. The dispatch site at `authorFunction:94-102` may have ONE new line appended that calls the new author when the other five return null — this is the only addition permitted.

**New tests** for iter 3.3:

- Happy path: synthetic trajectory with inline TS and numeric answer crystallises a parameterised helper via the new author
- Sanity: trajectory matching an existing renderer's pattern uses that renderer (not the new author)
- Sanity: trajectory with `sourceText` absent → new author returns null (no fallback magic; existing path handles it)
- AST parse error on `sourceText` → fail-closed; no helper
- Held-out replay: helper with wrong formula gets quarantined; visible-helper-count for that trajectory class stays zero
- Formula fingerprint: two trajectories with same formula get same fingerprint; trajectories with different formulas get different fingerprints

**SkillCraft regression bar** (iter 4, operator-launched): R1-R9 PASS at iter164 levels. The new author should be **dormant** on SkillCraft trajectories (all five existing renderers fire first; the new author runs only when they return null, which doesn't happen on SkillCraft's recognised shapes). iter 4 verifies this empirically.

**Rollback protocol**: revert the iter-3 commit; run sweep script to remove orphan helpers from disk caches; targeted vitest + full pnpm test to confirm clean state.

## What iter 3 explicitly does NOT do

- **No modification of the existing five render paths' bodies**. They handle the trajectory shapes they were designed for. The new author lives in a new file and runs only when the existing cascade returns null.
- **No benchmark identifiers in substrate code**. The new author works on any trajectory with a `sourceText` snapshot and a numerical/primitive answer commit, regardless of which dataset produced it.
- **No automatic full-126 SkillCraft regression in CI**. Operator-launched at iter 4.
- **No new acceptance-gate heuristic**. The iter 2e-gate change governs trajectory acceptance; iter 3 doesn't add new acceptance criteria.
- **No LLM call in the author path**. Deterministic AST analysis only.
- **No bypass of the convergence gate**. The new author runs through the same convergence pipeline as existing renderers.
- **No helper visible to agents without replay-validation passing**. This is a hard contract.
- **No replacement of the existing renderers**. They stay for now. Long-term unification is a future cleanup, out of scope for iter 3.

## Acceptance criteria

iter 3 is closed when, on a single substrate commit:

1. **Probe**: iter 3.0a shows the substrate's "agent calls learned helpers" premise lands on a benchmark whose trajectory shape doesn't fit the existing five renderers. The preseeded hand-crafted helper gets called by the next-episode agent on warm-tier siblings; helper-arm beats no-helper-arm on FAC OR tokens by a measurable margin.
2. **Generic author works**: `pnpm eval:finchain --live` with the iter-3 substrate commit + `DATAFETCH_GATE_PURE_COMPUTE=1` (the iter 2e-gate opt-in) produces ≥1 validated (non-quarantined) helper crystallised via the new author. Warm-tier episodes call the validated helper. `walk-artifacts.ts` reports R6≥0.80 AND R7≥0.60.
3. **Existing renderers unchanged**: `pnpm eval:skillcraft --families <full-21> --levels e1,e2,e3,m1,m2,h1` on the same substrate commit produces R1-R9 all PASS at iter164 levels under `cacheBoundedByFramework`. The new author is dormant on SkillCraft trajectories (walk-artifacts can verify: zero helpers in the SkillCraft run came from the new `authorFromSource` path, all came from the existing five renderers).
4. **FC4 cross-benchmark transfer**: at least one `intentSignature` crystallised on both SkillCraft (via existing renderers) AND FinChain (via the new author) on the same substrate commit.

If condition 1 (the probe) fails, iter 3 halts — the substrate's universal author is not enough; agents need to actually call helpers for the substrate to deliver value, and if they don't on a given benchmark, no amount of authoring genericity helps. File BLOCKED with the probe evidence.

If conditions 2-4 hold, the substrate has empirically demonstrated:
- The infrastructure is benchmark-agnostic (proven on two shapes)
- The author is shape-agnostic (one new path handles whatever shape the existing renderers don't)
- Crystallised helpers are safe (quarantine-then-promote prevents wrong answers from contaminating future episodes)
- Cross-benchmark transfer works (same intent-signature surfaces on both)

This is the "mount any dataset, substrate learns the right interface from agent usage" story made real at the implementation level.

## Anti-goals — things this plan explicitly rejects

- **Anti-A**: a "FinChain author path" or any other benchmark-named code path
- **Anti-B**: per-benchmark branches in the gate, worker, or author
- **Anti-C**: per-shape author proliferation (sixth, seventh, eighth render functions). If a future benchmark needs new behaviour, it goes through this generic author path with AST-level adjustments, not a new file
- **Anti-D**: replacing the existing five renderers in iter 3. Unification is a separate future cleanup
- **Anti-E**: LLM calls in the author. Substrate-policy decisions are deterministic
- **Anti-F**: helpers visible to agents without replay-validation
- **Anti-G**: bypassing the convergence or quarantine gates

## What this unlocks at the product level

Goal 5 closure under this framing demonstrates:

- **Same substrate code, two unrelated trajectory shapes, both work**. SkillCraft (tool fan-out) via the existing renderers; FinChain (read + inline compute) via the new generic author. No benchmark-specific identifiers anywhere.
- **The substrate's value-mechanism is empirically validated on a benchmark whose shape it wasn't originally designed for**. The generic source-to-helper author is the load-bearing capability; the existing renderers are optimisations.
- **The "mount any dataset" promise is implementation-level true**. A future customer with a third trajectory shape (e.g. time-series rolling-window analysis, document extraction with regex computation, multi-table joins with statistical aggregation) gets the same substrate behaviour by default: trajectory accepted by gate → source captured → author parameterises and validates → helper appears in df.d.ts for next-episode use.
- **The safety mechanism is empirically validated**. Quarantine-then-promote prevents wrong answers from contaminating future episodes — a property any customer deployment needs.

This is a substantively stronger commercial proof point than "we proved SkillCraft and a SkillCraft-shaped sibling work." It's "we proved the substrate is generic across data shapes, with safety guarantees, on two structurally different public benchmarks."
