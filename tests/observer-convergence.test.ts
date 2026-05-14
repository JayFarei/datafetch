// Goal-4 Change 3 — convergence index + intent-convergence gate.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  convergenceCounts,
  convergenceThreshold,
  intentConvergenceCount,
  readConvergenceIndex,
  recordIntent,
} from "../src/observer/convergenceIndex.js";
import { shouldCrystallise } from "../src/observer/gate.js";
import type { LibrarySnapshot } from "../src/observer/template.js";
import type { TrajectoryRecord } from "../src/sdk/index.js";

const ISO = new Date().toISOString();
const EMPTY_SNAPSHOT: LibrarySnapshot = {
  shapeHashes: new Set<string>(),
  learnedNames: new Set<string>(),
};

function buildTrajectory(
  calls: TrajectoryRecord["calls"],
  overrides: Partial<TrajectoryRecord> = {},
): TrajectoryRecord {
  return {
    id: overrides.id ?? "traj_test",
    tenantId: overrides.tenantId ?? "t",
    question: overrides.question ?? "test",
    mode: overrides.mode ?? "novel",
    calls,
    createdAt: overrides.createdAt ?? ISO,
    ...overrides,
  };
}

// A well-formed db->lib trajectory that clears the structural gate.
function dbLibTrajectory(id: string): TrajectoryRecord {
  return buildTrajectory(
    [
      {
        index: 0,
        primitive: "db.records.findExact",
        input: { filter: {} },
        output: [{ id: "row-1" }],
        startedAt: ISO,
        durationMs: 1,
      },
      {
        index: 1,
        primitive: "lib.per_entity",
        input: { rows: [{ id: "row-1" }] },
        output: { value: [] },
        startedAt: ISO,
        durationMs: 1,
      },
    ],
    { id },
  );
}

describe("convergenceIndex", () => {
  let baseDir: string;
  beforeEach(async () => {
    baseDir = await mkdtemp(path.join(os.tmpdir(), "df-convergence-"));
  });
  afterEach(async () => {
    delete process.env["DATAFETCH_CONVERGENCE_N"];
    await rm(baseDir, { recursive: true, force: true });
  });

  it("records and reads back entries; counts distinct trajectories", async () => {
    await recordIntent(baseDir, "tenant-a", {
      intentSignature: "db→lib",
      trajectoryId: "traj_1",
      shapeHash: "aaaaaaaa",
      templateName: "helperA",
    });
    await recordIntent(baseDir, "tenant-a", {
      intentSignature: "db→lib",
      trajectoryId: "traj_2",
      shapeHash: "bbbbbbbb",
      templateName: "helperA",
    });
    // Same trajectory contributing the same signature twice (whole +
    // sub-graph) must NOT double-count.
    await recordIntent(baseDir, "tenant-a", {
      intentSignature: "db→lib",
      trajectoryId: "traj_2",
      shapeHash: "cccccccc",
      templateName: "helperASub",
    });
    const entries = await readConvergenceIndex(baseDir, "tenant-a");
    expect(entries).toHaveLength(3);
    expect(await intentConvergenceCount(baseDir, "tenant-a", "db→lib")).toBe(2);
    expect(await intentConvergenceCount(baseDir, "tenant-a", "db→FANOUT(tool,2,cycle1)")).toBe(0);
  });

  it("convergenceCounts returns the distinct-trajectory map per signature", async () => {
    await recordIntent(baseDir, "t", { intentSignature: "A", trajectoryId: "x", shapeHash: "1", templateName: "n" });
    await recordIntent(baseDir, "t", { intentSignature: "A", trajectoryId: "y", shapeHash: "2", templateName: "n" });
    await recordIntent(baseDir, "t", { intentSignature: "B", trajectoryId: "x", shapeHash: "3", templateName: "n" });
    const counts = await convergenceCounts(baseDir, "t");
    expect(counts.get("A")).toBe(2);
    expect(counts.get("B")).toBe(1);
  });

  it("readConvergenceIndex tolerates a missing file", async () => {
    expect(await readConvergenceIndex(baseDir, "never-written")).toEqual([]);
  });

  it("convergenceThreshold defaults to 2 and honours DATAFETCH_CONVERGENCE_N", () => {
    expect(convergenceThreshold()).toBe(2);
    process.env["DATAFETCH_CONVERGENCE_N"] = "3";
    expect(convergenceThreshold()).toBe(3);
    process.env["DATAFETCH_CONVERGENCE_N"] = "0";
    // <1 is rejected, falls back to 2.
    expect(convergenceThreshold()).toBe(2);
  });
});

describe("shouldCrystallise — intent-convergence gate (check #7)", () => {
  it("rejects a candidate whose intent has not yet converged", () => {
    const traj = dbLibTrajectory("traj_first");
    const outcome = shouldCrystallise({
      trajectory: traj,
      shapeHash: "shape-1",
      existing: EMPTY_SNAPSHOT,
      convergenceCount: 1,
      convergenceThreshold: 2,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain("not converged");
  });

  it("accepts a candidate once its intent has converged across N trajectories", () => {
    const traj = dbLibTrajectory("traj_second");
    const outcome = shouldCrystallise({
      trajectory: traj,
      shapeHash: "shape-1",
      existing: EMPTY_SNAPSHOT,
      convergenceCount: 2,
      convergenceThreshold: 2,
    });
    expect(outcome.ok).toBe(true);
  });

  it("is a no-op when convergenceCount is not supplied (pre-Goal-4 callers unchanged)", () => {
    const traj = dbLibTrajectory("traj_legacy");
    const outcome = shouldCrystallise({
      trajectory: traj,
      shapeHash: "shape-1",
      existing: EMPTY_SNAPSHOT,
    });
    // No convergence arg → check #7 is skipped → the structural gate
    // alone decides (and a clean db->lib trajectory passes it).
    expect(outcome.ok).toBe(true);
  });
});
