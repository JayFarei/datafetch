// SaC-PoC governance probes — runnable entrypoint.
//
// Wires the three deterministic adversarial probes (CONTRACT.md §(f),
// invariant #7) and the blind 20+20 mutant/valid mini-suite into one script
// that prints PASS/FAIL per probe and writes `governance-probes.json` to the
// run out-dir.
//
// Run:
//   tsx eval/skillcraft/scripts/run-governance-probes.ts [--out <dir>] \
//       [--blind-n <N>] [--blind-seed <int>] [--no-blind]
//
// Exit code: non-zero iff any of the THREE deterministic probes failed its
// pre-registered expectation (arm2 gate declines on all three). The blind
// suite is reported qualitatively and does NOT gate the exit code (it carries
// rule-of-three uncertainty, per PRE-REGISTRATION §5), though a non-empty
// blind false-accept set is surfaced loudly.
//
// Ownership: S2 (governance). Reuses src/observer/quarantineValidator.ts
// read-only (no tolerance change); reads fixtures from ../probes/ (S2-owned).

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { deterministicProbeFixtures } from "../probes/fixtures.js";
import { runGovernanceProbe, type GovernanceProbeOutcome } from "../probes/governanceGate.js";
import { runBlindSuite, type BlindSuiteReport } from "../probes/blindSuite.js";

interface Args {
  outDir: string | null;
  blindN: number;
  blindSeed: number;
  runBlind: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { outDir: null, blindN: 20, blindSeed: 0xc0ffee, runBlind: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--out") args.outDir = argv[++i] ?? null;
    else if (a === "--blind-n") args.blindN = Number(argv[++i] ?? "20");
    else if (a === "--blind-seed") args.blindSeed = Number(argv[++i] ?? String(0xc0ffee));
    else if (a === "--no-blind") args.runBlind = false;
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.log("=== SaC-PoC governance probes (R8) ===");
  console.log("frozen gate: validateAuthoredFromSourceHelpers (numeric FAC replay, 1% tolerance, unchanged)\n");

  // --- Three deterministic probes ------------------------------------------
  console.log("--- deterministic probes (invariant #7) ---");
  const detOutcomes: GovernanceProbeOutcome[] = [];
  let detFailures = 0;
  for (const fx of deterministicProbeFixtures()) {
    const outcome = await runGovernanceProbe(fx);
    detOutcomes.push(outcome);
    const verdict = outcome.passed ? "PASS" : "FAIL";
    const gateLabel = outcome.gatePromotes ? "PROMOTED" : "DECLINED";
    console.log(`[${verdict}] ${outcome.id}: gate ${gateLabel} (expected ${fx.expectGatePromotes ? "PROMOTE" : "DECLINE"})`);
    console.log(`        ${outcome.detail}`);
    if (!outcome.passed) detFailures += 1;
  }

  // CONTRACT.md §(f): arm2 (gate on) declines on all three; arm3 (gate off)
  // would have emitted the wrong/stale value (surfaced as arm3WouldEmit).
  console.log("\n  arm2-vs-arm3 contrast (the governance co-pillar):");
  for (const o of detOutcomes) {
    const arm3 = o.arm3WouldEmit;
    const gold = o.siblingExpected;
    if (o.gatePromotes) {
      console.log(`    ${o.id}: arm2 PROMOTES (non-numeric helper validated; replayed ${String(arm3)} == held-out gold ${String(gold)})`);
    } else if (arm3 != null && gold != null) {
      console.log(`    ${o.id}: arm2 DECLINES | arm3 EMITS ${String(arm3)} (held-out gold ${String(gold)})`);
    } else {
      console.log(`    ${o.id}: arm2 DECLINES | arm3 contrast value unavailable`);
    }
  }

  // --- Blind 20+20 mini-suite ----------------------------------------------
  let blind: BlindSuiteReport | null = null;
  if (args.runBlind) {
    console.log("\n--- blind mutant/valid mini-suite (qualitative, rule-of-three) ---");
    blind = await runBlindSuite({ n: args.blindN, seed: args.blindSeed });
    console.log(`  N=${blind.n} per class (seed ${blind.seed}), ${blind.total} total`);
    console.log(`  valid:  ${blind.truePositive} promoted (TP), ${blind.falseReject} declined (false-reject)`);
    console.log(`  mutant: ${blind.trueNegative} declined (TN), ${blind.falseAccept} promoted (FALSE-ACCEPT)`);
    console.log(
      `  false-accept rate ${(blind.falseAcceptRate * 100).toFixed(1)}% ` +
        `(95% upper ~${(blind.falseAcceptUpper95 * 100).toFixed(1)}%, rule-of-three when 0 events)`,
    );
    console.log(
      `  false-reject rate ${(blind.falseRejectRate * 100).toFixed(1)}% ` +
        `(95% upper ~${(blind.falseRejectUpper95 * 100).toFixed(1)}%)`,
    );
    if (blind.falseAccept > 0) {
      console.log(`  WARNING: ${blind.falseAccept} mutant helper(s) were ACCEPTED by the gate (false-accept):`);
      for (const o of blind.outcomes) {
        if (o.label === "mutant" && o.gatePromotes) console.log(`    - ${o.id}: ${o.detail}`);
      }
    }
  } else {
    console.log("\n(blind suite skipped: --no-blind)");
  }

  // --- Write artifact ------------------------------------------------------
  if (args.outDir) {
    await mkdir(args.outDir, { recursive: true });
    const artifactPath = path.join(args.outDir, "governance-probes.json");
    const artifact = {
      generatedAt: new Date().toISOString(),
      gate: {
        module: "src/observer/quarantineValidator.ts",
        check: "idempotency + genericity numeric FAC replay",
        tolerance: 0.01,
        toleranceChanged: false,
      },
      deterministic: {
        allPassed: detFailures === 0,
        probes: detOutcomes.map((o) => ({
          id: o.id,
          description: o.description,
          gatePromotes: o.gatePromotes,
          passed: o.passed,
          arm3WouldEmit: o.arm3WouldEmit,
          siblingExpected: o.siblingExpected,
          detail: o.detail,
        })),
      },
      blind: blind
        ? {
            n: blind.n,
            seed: blind.seed,
            truePositive: blind.truePositive,
            falseReject: blind.falseReject,
            trueNegative: blind.trueNegative,
            falseAccept: blind.falseAccept,
            falseAcceptRate: blind.falseAcceptRate,
            falseAcceptUpper95: blind.falseAcceptUpper95,
            falseRejectRate: blind.falseRejectRate,
            falseRejectUpper95: blind.falseRejectUpper95,
          }
        : null,
    };
    await writeFile(artifactPath, JSON.stringify(artifact, null, 2), "utf8");
    console.log(`\nwrote ${artifactPath}`);
  }

  // --- Exit verdict --------------------------------------------------------
  console.log("");
  if (detFailures > 0) {
    console.error(`FAIL: ${detFailures}/${detOutcomes.length} deterministic governance probes did not meet the pre-registered expectation.`);
    process.exit(1);
  }
  console.log(`PASS: all ${detOutcomes.length} deterministic governance probes met the pre-registered expectation (arm2 declines, arm3 emits wrong/stale).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
