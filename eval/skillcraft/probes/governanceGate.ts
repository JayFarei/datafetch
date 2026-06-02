// SaC-PoC governance probes — frozen-gate harness.
//
// This module is the read-only reuse of the substrate's numeric FAC replay
// (src/observer/quarantineValidator.ts) for the R8 governance co-pillar of
// kb/plans/009-sac-aligned-poc-skillcraft.md. It owns NO substrate
// behaviour: it materialises an isolated, throwaway baseDir on disk
// (`<tmp>/lib/<tenant>/<helper>.ts` + `<tmp>/trajectories/*.json`), runs the
// FROZEN gate (`validateAuthoredFromSourceHelpers`) over it, and reports the
// gate's PASS/FAIL decision plus the actual replayed value.
//
// CONTRACT.md §(f): the deterministic probes assert "arm2 (gate on) declines
// on all three; arm3 (gate off) emits the wrong/stale value on all three."
// The gate decision is `idempotent && generic` — the exact pair the
// validator promotes on (quarantineValidator.ts:215-217). `promoted` is
// best-effort: in a probe-only context there is no installed hook registry,
// so `validateOne` leaves `promoted=false` even on a clean PASS. We
// therefore key the governance decision on the FAC checks, never on the
// registry-dependent `promoted` flag (which is a substrate side effect the
// probe must not depend on).
//
// The "arm3 would emit the wrong/stale value" half is shown by the SAME
// replay: the `got` value the frozen helper returns for the held-out sibling
// IS the value an ungoverned (arm3) path would have surfaced. The gate
// declined precisely because `got !== expected`; arm3 skips that check and
// emits `got`. We surface both numbers so the probe report is self-evident.

import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { TrajectoryRecord } from "../../../src/sdk/index.js";
import {
  validateAuthoredFromSourceHelpers,
  type QuarantineValidationResult,
} from "../../../src/observer/quarantineValidator.js";

// --- Probe fixture shape ---------------------------------------------------

// A self-contained, numerically-constructible governance fixture. The
// fixture author supplies the frozen helper source, the originating
// trajectory it was crystallised from, and exactly one held-out sibling.
// The harness writes them to an isolated baseDir and runs the frozen gate.
export interface GovernanceProbeFixture {
  // Stable id used in the report + the probe dir name.
  id: string;
  // One-line description for the report.
  description: string;
  // The tenant the helper + trajectories belong to. Both the helper dir
  // (`lib/<tenant>/`) and every trajectory's `tenantId` use this value.
  tenantId: string;
  // The crystallised helper. Must carry `@author: authorFromSource`,
  // `@quarantined: true`, and a `@source-hash:` matching `originating.sourceHash`
  // (exactly the headers quarantineValidator scans for). The export name
  // must equal `helperName`.
  helperName: string;
  helperSource: string;
  // The trajectory the helper was authored from (idempotency replay target).
  originating: TrajectoryRecord;
  // Exactly one held-out sibling (genericity replay target). Different
  // sourceHash, numeric answer. Auto-selected by validateOne as THE sibling
  // because it is the only other qualifying trajectory in the baseDir.
  sibling: TrajectoryRecord;
  // The pre-registered expected gate decision (CONTRACT.md §(f)). For all
  // three deterministic probes this is `declines` (false): the gate must NOT
  // promote because the genericity (or idempotency) replay FAC-mismatches.
  expectGatePromotes: boolean;
}

// --- Gate decision ---------------------------------------------------------

export interface GovernanceProbeOutcome {
  id: string;
  description: string;
  // The frozen gate's decision. `gatePromotes` is true iff the helper passed
  // BOTH the idempotency and genericity FAC replays (the arm2 governed flip).
  gatePromotes: boolean;
  // The raw validator result for this helper (one helper per probe).
  result: QuarantineValidationResult | null;
  // What an ungoverned (arm3) path would have emitted for the held-out
  // sibling: the value the frozen helper actually returned, even though it
  // FAC-mismatched the gold. Null when the replay could not run.
  arm3WouldEmit: number | null;
  // The gold value the sibling's trajectory recorded. Null when not numeric.
  siblingExpected: number | null;
  // PASS iff the gate decision matched the pre-registered expectation.
  passed: boolean;
  // Human-readable detail (the validator's `reason`, or the value contrast).
  detail: string;
}

// Run ONE deterministic probe through the frozen gate in an isolated baseDir.
// Cleans up the temp dir unless `keepDir` is set (the script keeps nothing).
export async function runGovernanceProbe(
  fixture: GovernanceProbeFixture,
  opts: { keepDir?: boolean } = {},
): Promise<GovernanceProbeOutcome> {
  const baseDir = await materialiseProbeBaseDir(fixture);
  try {
    const results = await validateAuthoredFromSourceHelpers({
      baseDir,
      tenantId: fixture.tenantId,
    });
    const result =
      results.find((r) => r.helperName === fixture.helperName) ??
      results[0] ??
      null;

    // The governed flip is idempotent && generic (quarantineValidator.ts
    // promotes only when both hold). NEVER key on `promoted`: with no
    // installed registry it is always false even on a clean PASS.
    const gatePromotes = Boolean(result?.idempotent && result?.generic);

    // arm3 emits whatever the frozen helper returned for the sibling — the
    // value the gate caught. Surfaced from the validator's evidence block.
    const arm3WouldEmit = result?.evidence.sibling?.got ?? null;
    const siblingExpected = result?.evidence.sibling?.expected ?? null;

    const passed = gatePromotes === fixture.expectGatePromotes;
    const detail = explain(fixture, result, gatePromotes, arm3WouldEmit, siblingExpected);

    return {
      id: fixture.id,
      description: fixture.description,
      gatePromotes,
      result,
      arm3WouldEmit,
      siblingExpected,
      passed,
      detail,
    };
  } finally {
    if (!opts.keepDir) {
      await rm(baseDir, { recursive: true, force: true });
    }
  }
}

function explain(
  fixture: GovernanceProbeFixture,
  result: QuarantineValidationResult | null,
  gatePromotes: boolean,
  arm3WouldEmit: number | null,
  siblingExpected: number | null,
): string {
  if (!result) return "validator returned no result for this helper (helper not found / no trajectories)";
  if (gatePromotes) {
    return `gate PROMOTED (idempotent=${result.idempotent}, generic=${result.generic}) — expected ${
      fixture.expectGatePromotes ? "promote" : "decline"
    }`;
  }
  const contrast =
    arm3WouldEmit !== null && siblingExpected !== null
      ? ` arm3 would emit ${arm3WouldEmit}; held-out gold is ${siblingExpected}.`
      : "";
  return `gate DECLINED (idempotent=${result.idempotent}, generic=${result.generic}): ${
    result.reason ?? "no reason recorded"
  }.${contrast}`;
}

// --- isolated baseDir materialisation --------------------------------------

async function materialiseProbeBaseDir(fixture: GovernanceProbeFixture): Promise<string> {
  const baseDir = await mkdtemp(path.join(tmpdir(), `sac-gov-probe-${fixture.id}-`));
  const libDir = path.join(baseDir, "lib", fixture.tenantId);
  const trajDir = path.join(baseDir, "trajectories");
  await mkdir(libDir, { recursive: true });
  await mkdir(trajDir, { recursive: true });

  await writeFile(path.join(libDir, `${fixture.helperName}.ts`), fixture.helperSource, "utf8");

  // Write originating + sibling so validateOne finds the originating by
  // @source-hash and auto-selects the sibling (the only other qualifying
  // trajectory). File names are stable but irrelevant — the validator scans
  // by content.
  await writeFile(
    path.join(trajDir, `${fixture.originating.id}.json`),
    JSON.stringify(fixture.originating, null, 2),
    "utf8",
  );
  await writeFile(
    path.join(trajDir, `${fixture.sibling.id}.json`),
    JSON.stringify(fixture.sibling, null, 2),
    "utf8",
  );
  return baseDir;
}
