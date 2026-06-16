// SaC-PoC C4 (governance-under-staleness) — the drift/staleness injector.
//
// Build item B-2 from the research-program kickoff
// (experiments/2026-06-sac-poc/KICKOFF.md). This is the $0, in-process A0
// KILL-GATE for claim C4: before any live CRAG run, prove the frozen
// governance gate's decline decision is actually SENSITIVE to source drift.
//
// It generalises the static `sourceDriftFixture` (probes/fixtures.ts): a helper
// is crystallised freezing `base * staleMultiplier`; the data source then
// drifts the multiplier by a multiplicative `magnitude` (1.0 = no drift), so
// the held-out sibling's CURRENT gold is `base * staleMultiplier * magnitude`.
// Replayed by the FROZEN gate, the helper returns the STALE product; the gate
// promotes iff that is within the answer-kit FAC tolerance of the drifted gold,
// declines otherwise. Sweeping `magnitude` across the tolerance boundary and
// confirming the decision MOVES is the mechanism-liveness check C4 rests on.
//
// Read-only over the substrate: it reuses the existing frozen gate via
// runGovernanceProbe and the existing fixture builders. No substrate change.

import { ANSWER_FAC_REL_TOLERANCE } from "../../../src/runtime/answerKit.js";
import { buildHelperSource, buildTrajectory } from "./fixtures.js";
import { runGovernanceProbe, type GovernanceProbeFixture } from "./governanceGate.js";

export type DriftMode = "multiplier";

export interface DriftSpec {
  // The promoted numeric input the helper is parameterised over (e.g. 500).
  base: number;
  // The multiplier the helper FROZE at crystallisation time (e.g. 2.0).
  staleMultiplier: number;
  // Multiplicative drift applied to the multiplier by the data source between
  // crystallise and reuse. 1.0 = no drift; 1.75 = the multiplier grew 1.75x
  // (the `sourceDriftFixture` case: 2.0 -> 3.5). >1 or <1 both drift.
  magnitude: number;
  driftMode?: DriftMode;
  // Identity overrides (auto-derived from magnitude when omitted), so a sweep
  // produces distinct, isolated tenants/hashes.
  id?: string;
  description?: string;
  tenantId?: string;
  helperName?: string;
  originSourceHash?: string;
  sibSourceHash?: string;
}

// Relative FAC distance, byte-identical to answerEquals' numeric branch
// (denominator max(|got|,|expected|,1)).
export function relDiff(got: number, expected: number): number {
  return Math.abs(got - expected) / Math.max(Math.abs(got), Math.abs(expected), 1);
}

// The gate PROMOTES iff the frozen stale value is within FAC tolerance of the
// drifted current gold — i.e. the drift is below the noise floor and the helper
// is still (numerically) correct. This is the pre-registered expected decision.
export function expectPromoteUnderDrift(spec: DriftSpec): boolean {
  const staleGold = spec.base * spec.staleMultiplier;
  const driftedGold = staleGold * spec.magnitude;
  return relDiff(staleGold, driftedGold) <= ANSWER_FAC_REL_TOLERANCE;
}

// Hex source-hash derived from a magnitude tag (lowercase hex only — the
// validator requires it, quarantineValidator.ts:117). Deterministic, no PRNG.
function hexTag(seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// Render a multiplier as a stable TS numeric literal (keeps a trailing .0-style
// only when needed; cosmetic — the gate executes the value).
function numLit(n: number): string {
  return Number.isInteger(n) ? `${n}` : `${n}`;
}

// Build a self-contained drift probe fixture for one magnitude.
export function injectDrift(spec: DriftSpec): GovernanceProbeFixture {
  const mode: DriftMode = spec.driftMode ?? "multiplier";
  if (mode !== "multiplier") throw new Error(`unsupported driftMode: ${mode}`);

  const staleGold = spec.base * spec.staleMultiplier;
  const driftedGold = staleGold * spec.magnitude;

  const tag = hexTag(`drift:${spec.base}:${spec.staleMultiplier}:${spec.magnitude}`);
  const id = spec.id ?? `drift-m${spec.magnitude}`;
  const tenantId = spec.tenantId ?? `sac-probe-drift-${tag}`;
  const helperName = spec.helperName ?? "derived_drift_clone";
  const originSourceHash = spec.originSourceHash ?? `d71f7${tag.slice(0, 3)}aaaa1111`;
  const sibSourceHash = spec.sibSourceHash ?? `d71f7${tag.slice(0, 3)}bbbb2222`;
  const promote = expectPromoteUnderDrift(spec);

  const helperSource = buildHelperSource({
    helperName,
    sourceHash: originSourceHash,
    promotedNames: ["base"],
    // The frozen stale multiplier — the value the source moved away from.
    bodyReturnExpr: `base * ${numLit(spec.staleMultiplier)}`,
  });

  return {
    id,
    description:
      spec.description ??
      `drift (magnitude ${spec.magnitude}x): source multiplier ${spec.staleMultiplier} -> ${spec.staleMultiplier * spec.magnitude}; ` +
        `frozen helper returns the stale ${staleGold}; held-out sibling's current gold is ${driftedGold}; ` +
        `gate expected to ${promote ? "PROMOTE (within FAC tol)" : "DECLINE (stale)"}.`,
    tenantId,
    helperName,
    helperSource,
    originating: buildTrajectory({
      id: `traj_${id}_origin`,
      tenantId,
      sourceHash: originSourceHash,
      promoted: { base: spec.base },
      answerValue: staleGold,
      question: `Pre-drift: base ${spec.base} x multiplier ${spec.staleMultiplier} = ${staleGold}.`,
    }),
    sibling: buildTrajectory({
      id: `traj_${id}_sibling`,
      tenantId,
      sourceHash: sibSourceHash,
      promoted: { base: spec.base },
      answerValue: driftedGold,
      question: `Post-drift held-out: base ${spec.base} x DRIFTED multiplier ${spec.staleMultiplier * spec.magnitude} = ${driftedGold}.`,
    }),
    expectGatePromotes: promote,
  };
}

export interface DriftSweepPoint {
  magnitude: number;
  staleGold: number;
  driftedGold: number;
  relDiff: number;
  expectPromote: boolean;
  gatePromotes: boolean;
  matched: boolean; // gate decision == expected
  arm3WouldEmit: unknown; // the stale value an ungoverned-persistent arm would emit
  siblingExpected: unknown; // the current (drifted) gold
}

export interface DriftLiveness {
  points: DriftSweepPoint[];
  // The gate's decision MOVED across the swept magnitudes (it does not
  // promote-everywhere or decline-everywhere): the mechanism is alive.
  decisionMoved: boolean;
  // No supra-tolerance drift was silently PROMOTED (no false-accept of a stale
  // clone): the C4 kill condition.
  noSupraToleranceFalseAccept: boolean;
  // Every swept point's gate decision matched its pre-registered expectation.
  allMatched: boolean;
  // C4-A0 PASSES iff the gate is drift-sensitive AND never false-accepts a
  // stale clone. A failure here KILLS C4 for $0 (DONE-HONEST-NEGATIVE).
  pass: boolean;
}

// Run the frozen gate across a magnitude sweep and report mechanism liveness.
// magnitudes should straddle the FAC tolerance: e.g. [1.0, 1.005, 1.05, 1.75].
export async function runDriftSweep(
  base: number,
  staleMultiplier: number,
  magnitudes: number[],
): Promise<DriftLiveness> {
  const points: DriftSweepPoint[] = [];
  for (const magnitude of magnitudes) {
    const spec: DriftSpec = { base, staleMultiplier, magnitude };
    const fx = injectDrift(spec);
    const outcome = await runGovernanceProbe(fx);
    const staleGold = base * staleMultiplier;
    const driftedGold = staleGold * magnitude;
    points.push({
      magnitude,
      staleGold,
      driftedGold,
      relDiff: relDiff(staleGold, driftedGold),
      expectPromote: spec ? expectPromoteUnderDrift(spec) : false,
      gatePromotes: outcome.gatePromotes,
      matched: outcome.gatePromotes === fx.expectGatePromotes,
      arm3WouldEmit: outcome.arm3WouldEmit,
      siblingExpected: outcome.siblingExpected,
    });
  }
  const promotes = points.map((p) => p.gatePromotes);
  const decisionMoved = promotes.some((x) => x) && promotes.some((x) => !x);
  const noSupraToleranceFalseAccept = points.every(
    (p) => p.expectPromote || !p.gatePromotes,
  );
  const allMatched = points.every((p) => p.matched);
  return {
    points,
    decisionMoved,
    noSupraToleranceFalseAccept,
    allMatched,
    pass: decisionMoved && noSupraToleranceFalseAccept && allMatched,
  };
}
