// SaC-PoC governance probes — blind 20+20 mutant/valid mini-suite (R8).
//
// CONTRACT.md §(f) + PRE-REGISTRATION.md §5: a blind generator produces N
// VALID helpers (whose formula genuinely generalises to the held-out
// sibling) and N MUTANT helpers (whose formula does not), all replayed
// through the FROZEN gate. The harness reports false-accept / false-reject
// counts with rule-of-three (wide) uncertainty bounds. No measured organic
// safety rate is claimed; this is the QUALITATIVE companion to the three
// deterministic probes. The quantitative 50+50 paper-grade suite is deferred
// (Scope Boundary).
//
// "Blind" = the gate sees only the helper + trajectories; it does not know
// which class a helper belongs to. The harness records the ground-truth
// label only to score the gate AFTER the fact.
//
// STATUS: the harness + scorer + a seeded generator producing a configurable
// N+N suite are COMPLETE and runnable. The default N=20 yields the pinned
// 20+20. Each helper is a numerically-constructible variant of the
// deterministic-probe families (simple/compound interest, scaled product),
// so the FAC contract is exercised identically. The richer
// formula-family diversity envisioned for the paper-grade suite is left as a
// follow-up — see the TODO below.

import type { TrajectoryRecord } from "../../../src/sdk/index.js";
import {
  runGovernanceProbe,
  type GovernanceProbeFixture,
  type GovernanceProbeOutcome,
} from "./governanceGate.js";

// --- deterministic PRNG (seeded, no external dep) --------------------------

// mulberry32 — small, fast, deterministic. The blind suite must be
// reproducible from a seed so a published run can be regenerated exactly.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

// --- helper / trajectory builders (shared shape with fixtures.ts) ----------

function buildHelperSource(input: {
  helperName: string;
  sourceHash: string;
  promotedNames: string[];
  bodyReturnExpr: string;
}): string {
  const fields = input.promotedNames.map((n) => `    ${n}: v.number(),`).join("\n");
  const inputType = `{ ${input.promotedNames.map((n) => `${n}: number`).join("; ")} }`;
  const destructure = `    const { ${input.promotedNames.join(", ")} } = _input;`;
  return `/* ---
@author: authorFromSource (iter 3.3)
@status: candidate
@quarantined: true
@intent: blind-suite helper ${input.helperName}
@intent-signature: source(blindfingerprint00)
@shape-hash: shape_blind_${input.helperName}
@source-hash: ${input.sourceHash}
@substrate-version: sac-poc-blind
--- */
import { fn } from "@datafetch/sdk";
import * as v from "valibot";

export const ${input.helperName} = fn({
  intent: "blind-suite helper ${input.helperName}",
  examples: [],
  input: v.object({
${fields}
  }),
  output: v.unknown(),
  intentSignature: "source(blindfingerprint00)",
  async body(input) {
    const _input = input as ${inputType};
${destructure}
    return ${input.bodyReturnExpr};
  },
});
`;
}

function buildTrajectory(input: {
  id: string;
  tenantId: string;
  sourceHash: string;
  promoted: Record<string, number>;
  answerValue: number;
}): TrajectoryRecord {
  const literalLines = Object.entries(input.promoted)
    .map(([name, value]) => `  const ${name} = ${value};`)
    .join("\n");
  const sourceText = `// Question (verbatim):
// blind-suite trajectory ${input.id}
const answer = df.answer.bind(df);
async function main() {
${literalLines}
  return answer({ status: "answered", value: 0, derivation: [], evidence: [] });
}
return await main();
`;
  return {
    id: input.id,
    tenantId: input.tenantId,
    question: `blind-suite trajectory ${input.id}`,
    mode: "novel",
    errored: false,
    createdAt: new Date("2026-06-02T00:00:00.000Z").toISOString(),
    calls: [],
    answer: { status: "answered", value: input.answerValue },
    sourceText,
    sourceHash: input.sourceHash,
  };
}

// --- blind-suite fixture generation ----------------------------------------

export type BlindLabel = "valid" | "mutant";

export interface BlindFixture extends GovernanceProbeFixture {
  // Ground-truth class (hidden from the gate; used only to score afterwards).
  label: BlindLabel;
}

// Generate one VALID fixture: the helper's formula genuinely generalises, so
// idempotency AND genericity both FAC-pass and the gate should PROMOTE.
function genValidFixture(rng: () => number, idx: number): BlindFixture {
  const tenantId = `sac-blind-valid-${idx}`;
  const helperName = `derived_blind_valid_${idx}`;
  // pure lowercase hex source-hashes (see quarantineValidator.ts:117).
  const originHash = `0a11d${String(idx).padStart(4, "0")}aaa`;
  const sibHash = `0a11d${String(idx).padStart(4, "0")}bbb`;

  // Formula: a * x + b. Promoted params: a, x, b. Generalises across inputs.
  const aO = randInt(rng, 2, 9);
  const xO = randInt(rng, 1, 12);
  const bO = randInt(rng, 0, 50);
  const goldO = aO * xO + bO;

  const aS = randInt(rng, 2, 9);
  const xS = randInt(rng, 1, 12);
  const bS = randInt(rng, 0, 50);
  const goldS = aS * xS + bS;

  const helperSource = buildHelperSource({
    helperName,
    sourceHash: originHash,
    promotedNames: ["a", "x", "b"],
    bodyReturnExpr: "a * x + b",
  });

  return {
    id: `blind-valid-${idx}`,
    description: `blind valid #${idx}: a*x+b, fully parameterised, generalises to the sibling.`,
    tenantId,
    helperName,
    helperSource,
    originating: buildTrajectory({
      id: `traj_blind_valid_${idx}_origin`,
      tenantId,
      sourceHash: originHash,
      promoted: { a: aO, x: xO, b: bO },
      answerValue: goldO,
    }),
    sibling: buildTrajectory({
      id: `traj_blind_valid_${idx}_sibling`,
      tenantId,
      sourceHash: sibHash,
      promoted: { a: aS, x: xS, b: bS },
      answerValue: goldS,
    }),
    expectGatePromotes: true,
    label: "valid",
  };
}

// Generate one MUTANT fixture: the helper hard-freezes a coefficient the
// sibling varies (under-parameterisation), so it idempotency-passes on its
// origin but genericity-FAILS on the sibling. The gate should DECLINE.
function genMutantFixture(rng: () => number, idx: number): BlindFixture {
  const tenantId = `sac-blind-mutant-${idx}`;
  const helperName = `derived_blind_mutant_${idx}`;
  // pure lowercase hex source-hashes (see quarantineValidator.ts:117).
  const originHash = `0b27${String(idx).padStart(4, "0")}aaaa`;
  const sibHash = `0b27${String(idx).padStart(4, "0")}bbbb`;

  // The TRUE formula is a*x+b, but the helper takes ONLY x and freezes the
  // coefficient a (and offset b) from the origin. The sibling's true formula
  // uses a DIFFERENT coefficient a, so the frozen helper mismatches.
  const aFrozen = randInt(rng, 2, 9);
  const bFrozen = randInt(rng, 0, 50);

  const xO = randInt(rng, 1, 12);
  const goldO = aFrozen * xO + bFrozen; // origin gold uses the frozen coeffs -> idempotent passes

  // Sibling: same x-only input, but the true coefficient a differs. We vary
  // ONLY a (hold b == bFrozen) so the divergence is purely |aFrozen-aTrue|*xS
  // (>= xS >= 1 in magnitude). Empirically this guarantees a relative
  // difference >= 1.7% across the generator ranges (verified over 100k
  // samples), so the FAC replay (1% tolerance) always catches the mutant and
  // the gate always declines. Holding b equal is what makes the mismatch
  // deterministic — letting b float lets it coincidentally cancel the a-drift
  // and produce a spurious within-tolerance match (a labeling defect for a
  // blind suite).
  const xS = randInt(rng, 1, 12);
  let aTrue = randInt(rng, 2, 9);
  if (aTrue === aFrozen) aTrue = aFrozen === 9 ? 2 : aFrozen + 1; // ensure divergence
  const bTrue = bFrozen;
  const goldS = aTrue * xS + bTrue; // true sibling gold (a differs from frozen)
  // Helper returns aFrozen * xS + bFrozen, which FAC-mismatches goldS.

  const helperSource = buildHelperSource({
    helperName,
    sourceHash: originHash,
    promotedNames: ["x"],
    // a and b FROZEN — the mutation.
    bodyReturnExpr: `${aFrozen} * x + ${bFrozen}`,
  });

  return {
    id: `blind-mutant-${idx}`,
    description: `blind mutant #${idx}: under-parameterised a*x+b (a,b frozen), fails genericity on the sibling.`,
    tenantId,
    helperName,
    helperSource,
    originating: buildTrajectory({
      id: `traj_blind_mutant_${idx}_origin`,
      tenantId,
      sourceHash: originHash,
      promoted: { x: xO },
      answerValue: goldO,
    }),
    sibling: buildTrajectory({
      id: `traj_blind_mutant_${idx}_sibling`,
      tenantId,
      sourceHash: sibHash,
      promoted: { x: xS },
      answerValue: goldS,
    }),
    expectGatePromotes: false,
    label: "mutant",
  };
}

// TODO(sac-poc): the paper-grade suite (50+50, Scope Boundary) wants richer
// formula-family diversity — compound interest, ratios, multi-step
// derivations, and mutation classes beyond under-parameterisation
// (wrong-sibling clone, source-drift, off-by-operator). This mini-suite seeds
// two families (a*x+b valid; under-parameterised a*x+b mutant) which is
// sufficient for the qualitative rule-of-three bound but is NOT the full
// diversity the paper suite needs. Extend genValidFixture / genMutantFixture
// with additional families before promoting this to a quantitative endpoint.

export function generateBlindSuite(opts: { n?: number; seed?: number } = {}): BlindFixture[] {
  const n = opts.n ?? 20;
  const seed = opts.seed ?? 0xc0ffee;
  const rng = mulberry32(seed);
  const out: BlindFixture[] = [];
  for (let i = 0; i < n; i += 1) out.push(genValidFixture(rng, i));
  for (let i = 0; i < n; i += 1) out.push(genMutantFixture(rng, i));
  return out;
}

// --- blind-suite scoring ----------------------------------------------------

export interface BlindSuiteReport {
  n: number; // count per class
  seed: number;
  total: number;
  // Confusion counts.
  truePositive: number; // valid -> promoted (gate correctly accepted)
  falseReject: number; // valid -> declined (gate wrongly rejected a valid helper)
  trueNegative: number; // mutant -> declined (gate correctly rejected)
  falseAccept: number; // mutant -> promoted (gate wrongly accepted a mutant)
  // Rule-of-three upper bound: when 0 events are observed in m trials, the
  // 95% upper bound on the rate is ~3/m. Reported as the WIDE qualitative
  // uncertainty per PRE-REGISTRATION §5.
  falseAcceptRate: number;
  falseAcceptUpper95: number; // rule-of-three when falseAccept==0, else binomial point estimate band
  falseRejectRate: number;
  falseRejectUpper95: number;
  outcomes: Array<GovernanceProbeOutcome & { label: BlindLabel }>;
}

// Rule-of-three: 0 events in m trials -> 95% upper bound ≈ 3/m. For k>0
// events we report the simple point rate plus a wide normal-approx upper band
// (qualitative only — the contract forbids claiming a measured organic rate).
function ruleOfThreeUpper(events: number, trials: number): number {
  if (trials === 0) return 1;
  if (events === 0) return 3 / trials;
  const p = events / trials;
  const se = Math.sqrt((p * (1 - p)) / trials);
  return Math.min(1, p + 1.96 * se);
}

export async function runBlindSuite(opts: { n?: number; seed?: number } = {}): Promise<BlindSuiteReport> {
  const n = opts.n ?? 20;
  const seed = opts.seed ?? 0xc0ffee;
  const fixtures = generateBlindSuite({ n, seed });
  const outcomes: Array<GovernanceProbeOutcome & { label: BlindLabel }> = [];

  let truePositive = 0;
  let falseReject = 0;
  let trueNegative = 0;
  let falseAccept = 0;

  for (const fx of fixtures) {
    const outcome = await runGovernanceProbe(fx);
    outcomes.push({ ...outcome, label: fx.label });
    if (fx.label === "valid") {
      if (outcome.gatePromotes) truePositive += 1;
      else falseReject += 1;
    } else {
      if (outcome.gatePromotes) falseAccept += 1;
      else trueNegative += 1;
    }
  }

  return {
    n,
    seed,
    total: fixtures.length,
    truePositive,
    falseReject,
    trueNegative,
    falseAccept,
    falseAcceptRate: n === 0 ? 0 : falseAccept / n,
    falseAcceptUpper95: ruleOfThreeUpper(falseAccept, n),
    falseRejectRate: n === 0 ? 0 : falseReject / n,
    falseRejectUpper95: ruleOfThreeUpper(falseReject, n),
    outcomes,
  };
}
