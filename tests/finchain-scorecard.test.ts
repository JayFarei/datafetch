import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { locateRepoRoot } from "../src/paths.js";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function runScorecard(runBase: string, skillcraftRunBase: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const repoRoot = await locateRepoRoot();
  return new Promise((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const child = spawn(
      "pnpm",
      [
        "tsx",
        "eval/finchain/scripts/score-finchain.ts",
        "--run-base",
        runBase,
        "--skillcraft-run-base",
        skillcraftRunBase,
      ],
      { cwd: repoRoot, env: process.env },
    );
    child.stdout.on("data", (b: Buffer) => stdoutChunks.push(b));
    child.stderr.on("data", (b: Buffer) => stderrChunks.push(b));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode: code ?? -1,
      });
    });
  });
}

async function writeFixture(input: {
  finchainIntent: string | null;
  finchainLibCalls: string[];
  discoveryEvidence?: Record<string, unknown>;
}): Promise<{ runBase: string; skillcraftRunBase: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "df-finchain-score-"));
  tempDirs.push(root);
  const runBase = path.join(root, "finchain");
  const skillcraftRunBase = path.join(root, "skillcraft");
  await Promise.all([
    mkdir(runBase, { recursive: true }),
    mkdir(skillcraftRunBase, { recursive: true }),
  ]);

  const normalized = [0, 1, 2].flatMap((seedIndex) => [
    {
      armId: "datafetch-learned",
      taskKey: `topic:tpl1:seed${seedIndex}`,
      difficulty: "Basic",
      passed: true,
      facMatch: true,
      predictedFinalValue: 1,
      goldFinalValue: 1,
      goldIntermediateValues: [1],
      derivationSteps: [1],
      effectiveTokens: 80,
      wallClockMs: 80,
      topic: "topic",
      templateName: "tpl1",
      seedIndex,
    },
    {
      armId: "datafetch-control",
      taskKey: `topic:tpl1:seed${seedIndex}`,
      difficulty: "Basic",
      passed: true,
      facMatch: true,
      predictedFinalValue: 1,
      goldFinalValue: 1,
      goldIntermediateValues: [1],
      derivationSteps: [1],
      effectiveTokens: 100,
      wallClockMs: 100,
      topic: "topic",
      templateName: "tpl1",
      seedIndex,
    },
  ]);
  await writeFile(
    path.join(runBase, "normalized.jsonl"),
    normalized.map((row) => JSON.stringify(row)).join("\n") + "\n",
  );
  await writeFile(
    path.join(runBase, "artifact-walk.json"),
    JSON.stringify({
      helpers: [
        {
          helperName: "toolFanout",
          replayContract: "origin-and-heldout-replay-before-validation",
          changeContract: "preserve-public-schema-call-graph-and-evidence-semantics",
          verifier: "validate-examples-and-replay-before-promotion",
          rollback: "quarantine-or-supersede-through-workspace-head",
        },
      ],
      discoveryEvidence: input.discoveryEvidence,
      trajectories: [0, 1, 2].map((seedIndex) => ({
        trajectoryId: `traj_finchain_${seedIndex}`,
        family: "accounting_and_financial_reporting-balance_sheets",
        libCalls: input.finchainLibCalls,
        intentSignature: input.finchainIntent,
      })),
      R4R9: {
        R4: { quarantineRate: 0, quarantinedHelpers: 0, totalHelpers: 1, pass: true },
        R6: { convergenceRate: input.finchainLibCalls.length > 0 ? 1 : 0, pass: input.finchainLibCalls.length > 0 },
        R7: {
          conditionalReuseRate: input.finchainLibCalls.length > 0 ? 1 : 0,
          warmEpisodesWithHelper: 3,
          warmEpisodesReused: input.finchainLibCalls.length > 0 ? 3 : 0,
          pass: input.finchainLibCalls.length > 0,
        },
        R9: { crossShapeTransfer: null, familiesReached: [], pass: null },
      },
    }),
  );
  await writeFile(
    path.join(skillcraftRunBase, "helper-instrumentation.jsonl"),
    `${JSON.stringify({
      taskKey: "scaled_tasks/cat-facts-collector/e3",
      family: "cat-facts-collector",
      helpersCalled: ["toolFanout"],
      helperOrigins: [
        {
          name: "toolFanout",
          intentSignature: "FANOUT(tool)",
          isSeed: false,
        },
      ],
    })}\n`,
  );

  return { runBase, skillcraftRunBase };
}

describe("FinChain FC scorecard", () => {
  it("measures FC4 cross-benchmark transfer from walked artifacts", async () => {
    const passing = await writeFixture({
      finchainIntent: "FANOUT(tool)",
      finchainLibCalls: ["toolFanout"],
      discoveryEvidence: {
        status: "proven",
        inspectedSurfaces: ["df.d.ts", "lib/"],
        helperCallSeen: true,
        inspectedBeforeHelper: true,
        events: [
          { index: 0, kind: "inspect", surface: "df.d.ts" },
          { index: 1, kind: "inspect", surface: "lib/" },
          { index: 2, kind: "helper-call", surface: "df.lib.toolFanout" },
        ],
        note: "Ordered agent evidence shows inspection before helper selection.",
      },
    });
    const passRun = await runScorecard(passing.runBase, passing.skillcraftRunBase);
    expect(passRun.exitCode).toBe(0);
    const passScorecard = JSON.parse(
      await readFile(path.join(passing.runBase, "finchain-scorecard.json"), "utf8"),
    );
    expect(passScorecard.fc4.passes).toBe(true);
    expect(passScorecard.fc4.sharedIntentSignatures).toHaveLength(1);
    expect(passScorecard.codeModeHarness.layers.benchmarkSafety.status).toBe("proven");
    expect(passScorecard.codeModeHarness.layers.learningLoop.status).toBe("proven");
    expect(passScorecard.codeModeHarness.layers.compression.status).toBe("proven");
    expect(passScorecard.codeModeHarness.layers.libraryMaturity.status).toBe("proven");
    expect(passScorecard.codeModeHarness.layers.reuseEvidence.status).toBe("proven");
    expect(passScorecard.codeModeHarness.layers.reuseEvidence.filesystemDiscovered.status).toBe("proven");
    expect(passScorecard.codeModeHarness.layers.generality.crossBenchmarkSameSignature.status).toBe("proven");

    const failing = await writeFixture({
      finchainIntent: "FANOUT(tool)",
      finchainLibCalls: [],
      discoveryEvidence: {
        status: "blocked",
        inspectedSurfaces: [],
        helperCallSeen: false,
        inspectedBeforeHelper: false,
        events: [],
        note: "No non-prompt agent event artifacts were available.",
      },
    });
    const failRun = await runScorecard(failing.runBase, failing.skillcraftRunBase);
    expect(failRun.exitCode).toBe(0);
    const failScorecard = JSON.parse(
      await readFile(path.join(failing.runBase, "finchain-scorecard.json"), "utf8"),
    );
    expect(failScorecard.fc4.passes).toBe(false);
    expect(failScorecard.fc4.finchainCalledIntentSignatures).toEqual([]);
    expect(failScorecard.codeModeHarness.layers.benchmarkSafety.status).toBe("proven");
    expect(failScorecard.codeModeHarness.layers.learningLoop.status).toBe("weak");
    expect(failScorecard.codeModeHarness.layers.compression.status).toBe("weak");
    expect(failScorecard.codeModeHarness.layers.reuseEvidence.status).toBe("blocked");
    expect(failScorecard.codeModeHarness.layers.reuseEvidence.filesystemDiscovered.status).toBe("blocked");
    expect(failScorecard.codeModeHarness.layers.generality.crossBenchmarkSameSignature.status).toBe("weak");
  });
});
