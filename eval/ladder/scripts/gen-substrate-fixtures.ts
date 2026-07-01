// Generates the committed S1 substrate fixtures, deterministically, by running
// the real executor over the real snapshots. Re-run after changing fixtures or
// executor semantics; commit the output.
//
//   pnpm ladder:gen-fixtures   (or: tsx eval/ladder/scripts/gen-substrate-fixtures.ts)
//
// Produces:
//   fixtures/tenants/{alpha,beta}/snapshot/indexes/*.json  (derived, stamped)
//   eval/ladder/selftest/episodes.jsonl                    (pinned replay set)
//   eval/ladder/selftest/ladder-state.json                 (positive: all load-bearing)
//   eval/ladder/selftest/ladder-state-decorative.json      (negative: decorative shim promoted)
//
// Turns and answers here are MEASURED by the executor, never constants.

import fs from "node:fs";
import path from "node:path";

import { buildIndexes } from "../../../src/ladder/buildIndexes.js";
import { execute } from "../../../src/ladder/executor.js";
import { REPO_ROOT, tenantSnapshotDir } from "../../../src/ladder/paths.js";
import { buildRegistry } from "../../../src/ladder/registry.js";
import { mountSnapshot } from "../../../src/ladder/snapshot.js";
import { getTask } from "../../../src/ladder/tasks.js";
import type { Arm, Episode, LadderState } from "../../../src/ladder/types.js";

const SELFTEST_DIR = path.join(REPO_ROOT, "eval", "ladder", "selftest");
const PROMPTS_DIR = path.join(SELFTEST_DIR, "prompts");

// ---- 1. build derived indexes for both tenants (stamps current fingerprint) ----
for (const tenant of ["alpha", "beta"]) {
  buildIndexes(tenant, tenantSnapshotDir(tenant));
}

// ---- 2. pin self-test episodes by running the executor over real snapshots ----
const registry = buildRegistry({ withControls: true });

interface Spec {
  episodeId: string;
  tenant: string;
  taskId: string;
  arm: Arm;
  lineage: string[];
}

const specs: Spec[] = [
  { episodeId: "st-alpha-exposed", tenant: "alpha", taskId: "alpha-open-high", arm: "exposed", lineage: ["alpha-open-high-count"] },
  { episodeId: "st-alpha-masked", tenant: "alpha", taskId: "alpha-open-high", arm: "masked", lineage: [] },
  { episodeId: "st-beta-exposed", tenant: "beta", taskId: "beta-delivered-sum", arm: "exposed", lineage: ["beta-delivered-sum"] },
  { episodeId: "st-beta-masked", tenant: "beta", taskId: "beta-delivered-sum", arm: "masked", lineage: [] },
  // origin episode for the decorative-shim ablation negative fixture
  { episodeId: "st-alpha-decorated", tenant: "alpha", taskId: "alpha-open-high", arm: "exposed", lineage: ["shallow-control", "alpha-open-high-count"] },
];

fs.mkdirSync(PROMPTS_DIR, { recursive: true });

const rows: Episode[] = specs.map((s) => {
  const snapshot = mountSnapshot(tenantSnapshotDir(s.tenant), s.tenant);
  const task = getTask(s.taskId);
  const { answer, turns, drifted } = execute(task, s.arm, s.lineage, registry, snapshot);

  // write the outbound prompt file; masked arm contains zero library surface
  const promptPath = path.join(PROMPTS_DIR, `${s.episodeId}.txt`);
  const body =
    s.arm === "masked"
      ? `TENANT ${s.tenant}\nQUERY: ${task.query}\nInstructions: answer from the raw ${task.sourceCollection} records only.`
      : `TENANT ${s.tenant}\nQUERY: ${task.query}\nInstructions: use the library procedure(s): ${s.lineage.join(", ")}.`;
  fs.writeFileSync(promptPath, body + "\n");

  return {
    episodeId: s.episodeId,
    ts: 1_800_000_000,
    commit: "SELFTEST",
    tenant: s.tenant,
    driver: "scripted",
    query: task.query,
    taskId: s.taskId,
    snapshotHash: snapshot.sourceFingerprint,
    arm: s.arm,
    pairId: null,
    promptPath: path.relative(REPO_ROOT, promptPath),
    answer,
    answerSchemaOk: answer.kind !== "abstain",
    abstained: answer.kind === "abstain",
    drifted,
    turns,
    lineage: s.lineage,
  };
});

fs.writeFileSync(
  path.join(SELFTEST_DIR, "episodes.jsonl"),
  rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
);

// ---- 3. self-test ladder states (positive + decorative negative) ----
const positive: LadderState = {
  "alpha-open-high-count": {
    state: "promoted",
    provenance: "curated",
    promotedAt: 1_800_000_000,
    evidence: { pairs: 30, wins: 25, boundaryRef: "selftest-boundary" },
  },
  "beta-delivered-sum": {
    state: "promoted",
    provenance: "curated",
    promotedAt: 1_800_000_000,
    evidence: { pairs: 30, wins: 24, boundaryRef: "selftest-boundary" },
  },
};
fs.writeFileSync(
  path.join(SELFTEST_DIR, "ladder-state.json"),
  JSON.stringify(positive, null, 2) + "\n",
);

const decorative: LadderState = {
  "alpha-open-high-count": positive["alpha-open-high-count"],
  // deliberately promote a decorative shim: the ablation check must catch it
  "shallow-control": {
    state: "promoted",
    provenance: "control",
    promotedAt: 1_800_000_000,
    evidence: { pairs: 30, wins: 20, boundaryRef: "selftest-boundary" },
  },
};
fs.writeFileSync(
  path.join(SELFTEST_DIR, "ladder-state-decorative.json"),
  JSON.stringify(decorative, null, 2) + "\n",
);

console.log(`generated ${rows.length} self-test episodes; indexes stamped for alpha + beta`);
