// SaC-PoC governance arm wiring (CONTRACT §(e)/(f), S2-owned runner half).
//
// This is the RUNNER-INTEGRATION half of the S2 governance stream. The probe
// harness (eval/skillcraft/probes/*) proves the gate BEHAVIOUR against blind
// fixtures; this module exposes the two functions S1's runner
// (src/eval/skillcraftFullDatafetch.ts) dynamic-imports at the promote site:
//
//   - runGovernanceGate (arm2 / arm4-phase1): a thin wrapper around the
//     substrate's numeric FAC replay (validateAuthoredFromSourceHelpers,
//     src/observer/quarantineValidator.ts). A learned helper becomes callable
//     ONLY on a replay PASS (idempotent && generic). This is the
//     governance-as-callability flip (R1): the candidate-only -> callable
//     promotion IS the governed step. `passed` is true iff at least one
//     authorFromSource helper passed both FAC replays this episode.
//
//   - forceCallableWithoutGovernance (arm3 ablation): flips every quarantined
//     authorFromSource helper's `@quarantined: true` header to `false` AND
//     promotes its hook manifest maturity to `validated-typescript`, making it
//     callable under hooks-draft WITHOUT running any replay. This is the axis
//     today's DATAFETCH_DISABLE_LEARNING cannot express (that boolean kills
//     crystallisation entirely); arm3 keeps crystallisation + callability and
//     removes ONLY the gate.
//
// Both functions operate on the LIVE tenant baseDir (datafetchHome), scanning
// `<baseDir>/lib/<tenantId>/*.ts` for the exact headers the substrate emits
// (`@author: authorFromSource`, `@quarantined: true`, `@source-hash:`). No
// substrate behaviour changes; the FAC replay tolerance is reused verbatim
// (Scope Boundary — no tolerance change). The interface is pinned in
// CONTRACT §(e): S1 imports these two symbols and nothing else.

import { promises as fsp } from "node:fs";
import path from "node:path";

import { validateAuthoredFromSourceHelpers } from "../observer/quarantineValidator.js";
import { getHookRegistry } from "../hooks/registry.js";
import { freshManifest, readManifest, writeManifest } from "../hooks/manifest.js";

export interface SacGateInput {
  // The live tenant base dir (datafetchHome). `<baseDir>/lib/<tenantId>/`
  // holds the authored helpers; `<baseDir>/trajectories/` holds the replay
  // targets; `<baseDir>/hooks/<tenantId>/` holds the manifests.
  baseDir: string;
  tenantId: string;
}

export interface SacGateResult {
  // true iff at least one authorFromSource helper passed BOTH the idempotency
  // and genericity FAC replays this episode (the arm2 governed flip). When no
  // helper was eligible (none authored, or none quarantined), this is false:
  // a missing gate must never silently mint a callable helper (fail-safe).
  passed: boolean;
  // Replay/quarantine validation cost in model-context tokens. The numeric FAC
  // replay runs the helper bodies in-process (no model call), so the marginal
  // model-context cost of the gate is 0; the runner records it as
  // governanceCostTokens. Emitted as a number (not null) so the scorer's
  // per-family build/governance sum is well-defined for arm2/arm4-phase1.
  costTokens: number;
}

// --- arm2 / arm4-phase1: the governed gate ---------------------------------
//
// Wraps validateAuthoredFromSourceHelpers (the substrate's frozen numeric FAC
// replay). The validator itself flips `@quarantined: true` -> `false` and
// promotes the hook manifest to `validated-typescript` on a PASS, so this
// wrapper does not mutate anything beyond what the substrate already does — it
// only surfaces the PASS/FAIL decision to the runner's cost ledger.
export async function runGovernanceGate(input: SacGateInput): Promise<SacGateResult> {
  const { baseDir, tenantId } = input;
  let validations;
  try {
    validations = await validateAuthoredFromSourceHelpers({ baseDir, tenantId });
  } catch {
    // A validator failure must fail-safe toward NOT-promoted: a gate that
    // errored cannot vouch for a helper, so the helper stays non-callable.
    return { passed: false, costTokens: 0 };
  }
  // The governed flip is idempotent && generic — the exact pair the validator
  // promotes on (quarantineValidator.ts:215-217). NEVER key on `promoted`:
  // when no hook registry is installed it stays false even on a clean PASS.
  const passed = validations.some((v) => v.idempotent && v.generic);
  // The FAC replay runs helper bodies in-process with no model call, so the
  // marginal model-context token cost of the gate is 0.
  return { passed, costTokens: 0 };
}

// --- arm3 ablation: callable without the gate ------------------------------
//
// Crystallise + persist already happened (the runner persisted the helper to
// lib/<tenant>/ before calling us). Here we make every quarantined
// authorFromSource helper callable WITHOUT running any replay:
//   1. flip the file header `@quarantined: true` -> `false`;
//   2. promote the hook manifest maturity to `validated-typescript` so
//      decideCallability returns `callable` under hooks-draft
//      (registry.ts:548-552).
// This is the decoupled axis: crystallisation + callability kept, ONLY the
// replay gate removed. Idempotent and best-effort: a missing manifest or an
// already-flipped header is a no-op for that helper.
export async function forceCallableWithoutGovernance(input: SacGateInput): Promise<void> {
  const { baseDir, tenantId } = input;
  const libDir = path.join(baseDir, "lib", tenantId);
  let entries: string[];
  try {
    entries = await fsp.readdir(libDir);
  } catch {
    return; // no lib dir for this tenant yet — nothing authored to force.
  }

  const registry = getHookRegistry();
  for (const entry of entries) {
    if (!entry.endsWith(".ts")) continue;
    const filePath = path.join(libDir, entry);
    let source: string;
    try {
      source = await fsp.readFile(filePath, "utf8");
    } catch {
      continue;
    }
    // Same scan the validator uses: only authorFromSource helpers carry the
    // quarantine contract, so only they are the arm3 ablation surface.
    if (!/@author: authorFromSource/.test(source)) continue;
    if (!/@quarantined: true/.test(source)) continue;

    const helperName = entry.slice(0, -3);

    // 1. Flip the file header WITHOUT a replay (the decoupled step).
    const flipped = source.replace(/@quarantined: true/, "@quarantined: false");
    if (flipped !== source) {
      await fsp.writeFile(filePath, flipped, "utf8");
    }

    // 2. Promote the manifest maturity so the helper is callable under
    //    hooks-draft. Prefer the in-process registry (keeps its cache + the
    //    computed callability consistent); fall back to a direct manifest
    //    rewrite when no registry is installed (e.g. a child-process runner).
    await promoteWithoutReplay(baseDir, tenantId, helperName, filePath, registry);
  }
}

async function promoteWithoutReplay(
  baseDir: string,
  tenantId: string,
  helperName: string,
  filePath: string,
  registry: ReturnType<typeof getHookRegistry>,
): Promise<void> {
  if (registry) {
    try {
      // Register/refresh the manifest from the (now unquarantined) source,
      // then force the maturity flip. validateImplementation establishes the
      // manifest; we then promote maturity directly without smokeReplayAndPromote
      // (which would re-gate on a replay — exactly the gate arm3 skips).
      await registry.validateImplementation({
        tenantId,
        name: helperName,
        filePath,
        implementationKind: "typescript",
        intent: `arm3 ungoverned interface ${helperName}`,
        trajectoryId: `sac-arm3-force-${helperName}`,
      });
    } catch {
      // fall through to the direct manifest rewrite below.
    }
  }
  // Direct manifest rewrite: set maturity validated-typescript + callable.
  // This runs whether or not the registry path succeeded so the on-disk
  // manifest is authoritative for the next process / hydrate. When no manifest
  // exists yet (no installed registry, e.g. a child-process runner), arm3
  // still must FORCE callability — its whole premise is callable-without-gate
  // — so we mint a fresh manifest rather than skipping the helper.
  const manifest =
    (await readManifest(baseDir, tenantId, helperName)) ??
    freshManifest({
      name: helperName,
      intent: `arm3 ungoverned interface ${helperName}`,
      tenantId,
      implementationKind: "typescript",
      implementationRef: filePath,
      trajectoryId: `sac-arm3-force-${helperName}`,
    });
  // The ablation deliberately bypasses quarantine (including the
  // `quarantined` callability state); force the helper callable, mirroring the
  // gate's own header flip but WITHOUT a replay PASS.
  manifest.callability = "callable";
  if (manifest.maturity !== "provider-native") {
    manifest.maturity = "validated-typescript";
  }
  manifest.implementation.kind = "typescript";
  manifest.implementation.ref = filePath;
  manifest.origin.updatedAt = new Date().toISOString();
  await writeManifest(baseDir, manifest);
}
