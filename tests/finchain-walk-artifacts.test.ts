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

async function runWalker(runBase: string): Promise<{
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
        "eval/finchain/scripts/walk-artifacts.ts",
        "--run-base",
        runBase,
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

describe("FinChain artifact walker", () => {
  it("exports validated helper maturity contracts without treating declarations as proof", async () => {
    const runBase = await mkdtemp(path.join(os.tmpdir(), "df-finchain-walk-"));
    tempDirs.push(runBase);
    const helperDir = path.join(
      runBase,
      "datafetch-home",
      "accounting_and_financial_reporting-balance_sheets",
      "lib",
      "tenant-acme",
    );
    await mkdir(helperDir, { recursive: true });
    await writeFile(
      path.join(helperDir, "toolFanout.ts"),
      [
        "/* ---",
        "name: toolFanout",
        "description: |",
        "  Reuses a learned fanout workflow.",
        "trajectory: traj_origin",
        "shape-hash: shape_123",
        "source-hash: source_123",
        "promotion-state: validated",
        "replay-contract: origin-and-heldout-replay-before-validation",
        "change-contract: preserve-public-schema-call-graph-and-evidence-semantics",
        "verifier: validate-examples-and-replay-before-promotion",
        "rollback: quarantine-or-supersede-through-workspace-head",
        "--- */",
        "// @intent-signature: FANOUT(tool)",
        "// @shape-hash: shape_123",
        "// @origin-trajectory: traj_origin",
        "// @replay-contract: origin=traj_origin exp=1 got=1; heldout=traj_heldout exp=2 got=2",
        "// @change-contract: held-out replay matched on traj_heldout; public schema and answer semantics preserved",
        "// @verifier: quarantineValidator idempotency+genericity replay pass",
        "// @rollback: hook-manifest quarantine/supersede on regression",
        "export async function toolFanout(): Promise<number> {",
        "  return 1;",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(helperDir, "declaredOnly.ts"),
      [
        "/* ---",
        "name: declaredOnly",
        "description: |",
        "  Declares a contract but has not passed validator replay.",
        "trajectory: traj_declared",
        "shape-hash: shape_declared",
        "source-hash: source_declared",
        "promotion-state: candidate",
        "replay-contract: origin-and-heldout-replay-before-validation",
        "change-contract: preserve-public-schema-call-graph-and-evidence-semantics",
        "verifier: validate-examples-and-replay-before-promotion",
        "rollback: quarantine-or-supersede-through-workspace-head",
        "--- */",
        "// @intent-signature: DECLARED_ONLY",
        "// @shape-hash: shape_declared",
        "// @origin-trajectory: traj_declared",
        "export async function declaredOnly(): Promise<number> {",
        "  return 2;",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await runWalker(runBase);
    expect(result.exitCode, result.stderr).toBe(0);
    const artifactWalk = JSON.parse(
      await readFile(path.join(runBase, "artifact-walk.json"), "utf8"),
    );
    expect(artifactWalk.helpers).toHaveLength(2);
    const validated = artifactWalk.helpers.find(
      (helper: { helperName: string }) => helper.helperName === "toolFanout",
    );
    expect(validated).toMatchObject({
      helperName: "toolFanout",
      intentSignature: "FANOUT(tool)",
      shapeHash: "shape_123",
      originTrajectory: "traj_origin",
      replayContract: "origin=traj_origin exp=1 got=1; heldout=traj_heldout exp=2 got=2",
      changeContract: "held-out replay matched on traj_heldout; public schema and answer semantics preserved",
      verifier: "quarantineValidator idempotency+genericity replay pass",
      rollback: "hook-manifest quarantine/supersede on regression",
      contractSource: "validated-header",
      declaredReplayContract: "origin-and-heldout-replay-before-validation",
      quarantined: false,
    });
    const declaredOnly = artifactWalk.helpers.find(
      (helper: { helperName: string }) => helper.helperName === "declaredOnly",
    );
    expect(declaredOnly).toMatchObject({
      contractSource: "declared-frontmatter",
      declaredReplayContract: "origin-and-heldout-replay-before-validation",
      replayContract: null,
      changeContract: null,
      verifier: null,
      rollback: null,
    });
  });
});
