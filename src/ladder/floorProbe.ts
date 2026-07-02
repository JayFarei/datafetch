// Graceful-floor probe (check V8, claim C6).
//
// With the library fully masked the product must still serve typed answers, and
// under drift it must abstain rather than serve a stale answer. This probe RUNS
// both: a fully-masked episode over the committed snapshot (served, schema-valid,
// non-abstain) and an exposed episode over a mutated snapshot whose index has
// gone stale (abstains). Both fields are OBSERVED from real executions.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { validateAnswer } from "./answerContract.js";
import { execute } from "./executor.js";
import { tenantSnapshotDir } from "./paths.js";
import { buildRegistry } from "./registry.js";
import { mountSnapshot } from "./snapshot.js";
import { fullParam, getTask } from "./tasks.js";
import type { Answer } from "./types.js";

export interface FloorProbe {
  maskedServeOk: boolean;
  driftAbstained: boolean;
}

export interface FloorProbeResult {
  probe: FloorProbe;
  maskedAnswer: Answer;
  driftAnswer: Answer;
}

const DEFAULT_TASK: Record<string, string> = {
  alpha: "alpha-open-high",
  beta: "beta-delivered-sum",
};
const DEFAULT_SEED: Record<string, string> = {
  alpha: "alpha-open-high-count",
  beta: "beta-delivered-sum",
};
const MUTATE: Record<string, (records: Record<string, unknown>[]) => void> = {
  alpha: (r) => r.push({ id: "T-FLOOR", status: "open", priority: "high", topic: "billing" }),
  beta: (r) => r.push({ id: "O-FLOOR", state: "delivered", total: 10, region: "emea" }),
};

/** Run the floor probe for a tenant. Both edges are observed, never asserted. */
export function runFloorProbe(tenant = "alpha"): FloorProbeResult {
  const task = getTask(DEFAULT_TASK[tenant]!);
  const seedId = DEFAULT_SEED[tenant]!;
  const sourceCollection = task.sourceCollection;
  const registry = buildRegistry({ withControls: true });

  // ---- masked serve on the fresh committed snapshot ----
  const fresh = mountSnapshot(tenantSnapshotDir(tenant), tenant);
  const freshParam = fullParam((fresh.collections[sourceCollection] ?? []).length);
  const masked = execute(task, freshParam, "masked", [], registry, fresh);
  const maskedServeOk = validateAnswer(masked.answer).ok && masked.answer.kind !== "abstain";

  // ---- drift abstention on a mutated copy (index goes stale, not rebuilt) ----
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ladder-floor-${tenant}-`));
  try {
    fs.cpSync(tenantSnapshotDir(tenant), dir, { recursive: true });
    const srcPath = path.join(dir, `${sourceCollection}.json`);
    const records = JSON.parse(fs.readFileSync(srcPath, "utf8"));
    MUTATE[tenant]!(records);
    fs.writeFileSync(srcPath, JSON.stringify(records));

    const drifted = mountSnapshot(dir, tenant);
    const driftParam = fullParam((drifted.collections[sourceCollection] ?? []).length);
    const drift = execute(task, driftParam, "exposed", [seedId], registry, drifted);
    const driftAbstained = drift.answer.kind === "abstain" && drift.drifted === true;

    return {
      probe: { maskedServeOk, driftAbstained },
      maskedAnswer: masked.answer,
      driftAnswer: drift.answer,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
