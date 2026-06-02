// SaC-PoC governance probes — the three deterministic fixtures.
//
// CONTRACT.md §(f) + PRE-REGISTRATION.md §5. Three numerically-constructible
// adversarial replay probes. Each is a FROZEN helper crystallised from an
// originating trajectory, replayed against a held-out sibling whose gold
// value differs from what the helper returns. The pre-registered outcome
// (R8): the gate (idempotency + genericity FAC replay) DECLINES on all
// three, while an ungoverned arm3 path would have EMITTED the wrong/stale
// value (the number the gate caught).
//
// OWNERSHIP NOTE: CONTRACT.md §(e) assigns `eval/skillcraft/fixtures/sac-poc/`
// to stream S4 (preseed + fixtures). To avoid a two-stream collision on that
// directory, the governance stream (S2) keeps its fixtures as numerically-
// constructible TS constructors HERE, under the probes/ directory it owns
// exclusively. The harness (governanceGate.ts) materialises them to an
// isolated temp baseDir at run time, so no on-disk fixture file is needed and
// no file owned by another stream is touched. If S4 later lands physical
// fixture files under fixtures/sac-poc/, these constructors are the canonical
// numeric source of truth for them.
//
// Helper-source shape is byte-faithful to renderFromAgentSource's emitted
// module (src/observer/authorFromSource.ts:589-630): the `@author`,
// `@quarantined: true`, and `@source-hash:` headers the validator scans for
// (quarantineValidator.ts:85-87,117), the `@datafetch/sdk` import the
// DiskLibraryResolver rewrites, and a `fn({ ... body(input) { ... } })`
// callable whose body destructures promoted params from `input` and returns
// a numeric value directly.

import type { TrajectoryRecord } from "../../../src/sdk/index.js";
import type { GovernanceProbeFixture } from "./governanceGate.js";

// --- helper-source builder -------------------------------------------------

// Emit a helper module in the exact shape renderFromAgentSource produces, so
// the frozen gate (quarantineValidator) treats it identically to an organic
// crystallised helper. `bodyReturnExpr` is the value expression returned from
// the promoted-param inputs.
function buildHelperSource(input: {
  helperName: string;
  sourceHash: string;
  promotedNames: string[];
  bodyReturnExpr: string;
  extraBodyLines?: string[];
}): string {
  const fields = input.promotedNames.map((n) => `    ${n}: v.number(),`).join("\n");
  const inputType = `{ ${input.promotedNames.map((n) => `${n}: number`).join("; ")} }`;
  const destructure = `    const { ${input.promotedNames.join(", ")} } = _input;`;
  const extra = (input.extraBodyLines ?? []).map((l) => `    ${l}`).join("\n");
  const bodyMid = extra.length > 0 ? `${destructure}\n${extra}` : destructure;
  return `/* ---
@author: authorFromSource (iter 3.3)
@status: candidate
@quarantined: true
@intent: governance probe helper ${input.helperName}
@intent-signature: source(probefingerprint000)
@shape-hash: shape_probe_${input.helperName}
@source-hash: ${input.sourceHash}
@substrate-version: sac-poc-probe
--- */
import { fn } from "@datafetch/sdk";
import * as v from "valibot";

export const ${input.helperName} = fn({
  intent: "governance probe helper ${input.helperName}",
  examples: [],
  input: v.object({
${fields}
  }),
  output: v.unknown(),
  intentSignature: "source(probefingerprint000)",
  async body(input) {
    const _input = input as ${inputType};
${bodyMid}
    return ${input.bodyReturnExpr};
  },
});
`;
}

// Build a minimal-but-valid trajectory whose sourceText carries the
// promoted-param literal `const` declarations the validator's
// extractPromotedValuesFromSource walks (top-of-main numeric literals), and
// whose answer.value is the gold the FAC replay compares against.
function buildTrajectory(input: {
  id: string;
  tenantId: string;
  sourceHash: string;
  promoted: Record<string, number>;
  answerValue: number;
  question?: string;
}): TrajectoryRecord {
  const literalLines = Object.entries(input.promoted)
    .map(([name, value]) => `  const ${name} = ${value};`)
    .join("\n");
  const sourceText = `// Question (verbatim):
// ${input.question ?? `probe trajectory ${input.id}`}
const answer = df.answer.bind(df);
async function main() {
  const siblings = await df.db.records.findExact({}, 9);
${literalLines}
  return answer({ status: "answered", value: 0, derivation: [], evidence: [] });
}
return await main();
`;
  return {
    id: input.id,
    tenantId: input.tenantId,
    question: input.question ?? `probe trajectory ${input.id}`,
    mode: "novel",
    errored: false,
    createdAt: new Date("2026-06-02T00:00:00.000Z").toISOString(),
    calls: [],
    answer: { status: "answered", value: input.answerValue },
    sourceText,
    sourceHash: input.sourceHash,
  };
}

// ===========================================================================
// PROBE 1 — wrong-sibling clone (the br-17 landmine).
//
// A helper crystallised for family A computes A's formula:
//   return principal * (1 + ratePercent / 100 * years);     [simple interest amount]
// Replayed against a family-B sibling trajectory whose gold uses a DIFFERENT
// formula (compound, monthly), the helper returns family A's value, which
// FAC-mismatches B's gold. Gate declines; arm3 would emit A's value for B's
// question (the silent wrong-sibling answer kb/br/17 warns about).
// ===========================================================================

export function wrongSiblingCloneFixture(): GovernanceProbeFixture {
  const tenantId = "sac-probe-wrong-sibling";
  const helperName = "derived_wrong_sibling_clone";
  // sourceHashes are pure lowercase hex (the validator parses them with
  // /@source-hash:\s*([a-f0-9]+|unknown)/, quarantineValidator.ts:117).
  const originSourceHash = "a51b0000aaaa1111";
  const sibSourceHash = "a51b0000bbbb2222";

  // Helper formula (family A: simple interest amount). Idempotency target
  // uses the SAME promoted literals so the helper reproduces A's gold.
  const principalA = 1000;
  const rateA = 5;
  const yearsA = 3;
  const goldA = principalA * (1 + (rateA / 100) * yearsA); // 1150

  // Sibling (family B): different inputs AND a different true formula
  // (compound, n=12). The helper applies A's simple-interest formula to B's
  // inputs, so it returns a value that mismatches B's compound gold.
  const principalB = 2000;
  const rateB = 10;
  const yearsB = 5;
  const n = 12;
  const goldB = principalB * Math.pow(1 + rateB / (100 * n), n * yearsB); // compound ≈ 3290.62
  // What the helper actually returns for B's inputs (simple interest):
  //   2000 * (1 + 0.10 * 5) = 3000  — FAC-mismatches goldB ≈ 3290.62 (8.8% > 1%).

  const helperSource = buildHelperSource({
    helperName,
    sourceHash: originSourceHash,
    promotedNames: ["principal", "ratePercent", "years"],
    bodyReturnExpr: "principal * (1 + (ratePercent / 100) * years)",
  });

  return {
    id: "wrong-sibling",
    description:
      "wrong-sibling clone: family-A simple-interest helper replayed on a family-B compound sibling; helper returns A's formula value, FAC-mismatches B's gold.",
    tenantId,
    helperName,
    helperSource,
    originating: buildTrajectory({
      id: "traj_wrong_sibling_origin",
      tenantId,
      sourceHash: originSourceHash,
      promoted: { principal: principalA, ratePercent: rateA, years: yearsA },
      answerValue: goldA,
      question: "Family A: simple interest amount on $1000 at 5% for 3 years.",
    }),
    sibling: buildTrajectory({
      id: "traj_wrong_sibling_sibling",
      tenantId,
      sourceHash: sibSourceHash,
      promoted: { principal: principalB, ratePercent: rateB, years: yearsB },
      answerValue: goldB,
      question: "Family B: compound interest (monthly) amount on $2000 at 6% for 2 years.",
    }),
    expectGatePromotes: false,
  };
}

// ===========================================================================
// PROBE 2 — under-parameterised clone.
//
// A helper that hard-codes a constant the sibling varies. The originating
// trajectory promoted only `principal`; the rate (7%) and years (4) were
// FROZEN into the helper body as literals. The held-out sibling varies the
// rate and years, but the helper ignores them (it only takes `principal`),
// so it returns the originating value scaled only by principal, which
// FAC-mismatches the sibling's gold. Gate declines; arm3 emits the
// under-parameterised value.
// ===========================================================================

export function underParameterisedCloneFixture(): GovernanceProbeFixture {
  const tenantId = "sac-probe-under-param";
  const helperName = "derived_under_parameterised_clone";
  // pure lowercase hex (see quarantineValidator.ts:117).
  const originSourceHash = "0ba12000aaaa1111";
  const sibSourceHash = "0ba12000bbbb2222";

  // Originating: principal=1000, with rate=7%, years=4 FROZEN in the body.
  const principalOrigin = 1000;
  const goldOrigin = principalOrigin * (1 + (7 / 100) * 4); // 1280 — frozen rate/years

  // Sibling: same helper input (principal only) but the TRUE answer uses a
  // different rate (3%) and years (10). The helper, taking only principal,
  // re-applies the frozen 7%/4yr and returns 1280-shape value, mismatching
  // the sibling's gold.
  const principalSibling = 1000;
  const goldSibling = principalSibling * (1 + (3 / 100) * 10); // 1300 (true) vs helper's 1280

  const helperSource = buildHelperSource({
    helperName,
    sourceHash: originSourceHash,
    promotedNames: ["principal"],
    // Rate (7) and years (4) are FROZEN constants — the under-parameterisation.
    bodyReturnExpr: "principal * (1 + (7 / 100) * 4)",
  });

  return {
    id: "under-parameterised",
    description:
      "under-parameterised clone: helper froze rate=7%/years=4 as literals and takes only principal; held-out sibling varies rate/years, so the frozen helper returns the stale-shape value and FAC-mismatches the sibling gold.",
    tenantId,
    helperName,
    helperSource,
    originating: buildTrajectory({
      id: "traj_under_param_origin",
      tenantId,
      sourceHash: originSourceHash,
      promoted: { principal: principalOrigin },
      answerValue: goldOrigin,
      question: "Originating: simple interest on $1000 at 7% for 4 years (rate/years frozen).",
    }),
    sibling: buildTrajectory({
      id: "traj_under_param_sibling",
      tenantId,
      sourceHash: sibSourceHash,
      promoted: { principal: principalSibling },
      answerValue: goldSibling,
      question: "Held-out sibling: simple interest on $1000 at 3% for 10 years (rate/years VARY).",
    }),
    expectGatePromotes: false,
  };
}

// ===========================================================================
// PROBE 3 — source-drift (numerically constructible, the only Scope-Boundary
// replay extension; no tolerance change).
//
// The frozen helper was crystallised against an originating trajectory whose
// gold was computed from the THEN-current source data. We mutate the
// originating numeric fixture: the SIBLING (held-out) trajectory carries the
// DRIFTED current data (the source changed), but the frozen helper still
// reproduces the STALE pre-drift value. Replay recomputes the gold from the
// drifted sibling inputs and FAC-mismatches the helper's stale return. Gate
// declines; arm3 emits the stale value.
//
// Construction: the helper computes `base * multiplier`. The sibling's gold
// is recomputed from a DRIFTED `multiplier` (the data source moved), but the
// helper's frozen body would, on the sibling's inputs, still produce the
// stale product because the helper hard-froze the pre-drift multiplier.
// ===========================================================================

export function sourceDriftFixture(): GovernanceProbeFixture {
  const tenantId = "sac-probe-source-drift";
  const helperName = "derived_source_drift_clone";
  // pure lowercase hex (see quarantineValidator.ts:117).
  const originSourceHash = "df1f7000aaaa1111";
  const sibSourceHash = "df1f7000bbbb2222";

  // Originating (pre-drift): base=500, multiplier baked at 2.0.
  const baseOrigin = 500;
  const staleMultiplier = 2.0;
  const goldOrigin = baseOrigin * staleMultiplier; // 1000 (pre-drift gold)

  // Sibling (post-drift): same base input, but the underlying data source
  // drifted the multiplier to 3.5. The TRUE current gold is 500 * 3.5 = 1750.
  // The frozen helper hard-froze multiplier=2.0, so on the sibling's `base`
  // it returns 500 * 2.0 = 1000 — the STALE value replay catches.
  const baseSibling = 500;
  const driftedMultiplier = 3.5;
  const goldSibling = baseSibling * driftedMultiplier; // 1750 (current, post-drift)

  const helperSource = buildHelperSource({
    helperName,
    sourceHash: originSourceHash,
    promotedNames: ["base"],
    // multiplier FROZEN at the pre-drift 2.0 — the stale value the source
    // moved away from.
    bodyReturnExpr: "base * 2.0",
  });

  return {
    id: "source-drift",
    description:
      "source-drift: data source moved the multiplier 2.0 -> 3.5; the frozen helper still returns the stale pre-drift product, and replay against the drifted held-out sibling FAC-catches the stale value.",
    tenantId,
    helperName,
    helperSource,
    originating: buildTrajectory({
      id: "traj_source_drift_origin",
      tenantId,
      sourceHash: originSourceHash,
      promoted: { base: baseOrigin },
      answerValue: goldOrigin,
      question: "Pre-drift: base 500 x multiplier 2.0 = 1000.",
    }),
    sibling: buildTrajectory({
      id: "traj_source_drift_sibling",
      tenantId,
      sourceHash: sibSourceHash,
      promoted: { base: baseSibling },
      answerValue: goldSibling,
      question: "Post-drift held-out: base 500 x DRIFTED multiplier 3.5 = 1750.",
    }),
    expectGatePromotes: false,
  };
}

// The three deterministic probes, in pinned order.
export function deterministicProbeFixtures(): GovernanceProbeFixture[] {
  return [
    wrongSiblingCloneFixture(),
    underParameterisedCloneFixture(),
    sourceDriftFixture(),
  ];
}
