// Forced-drift probe on the stale-clone control (defeater D3, check V4:drift).
//
// This is RUN, never hand-written. It:
//   1. copies a tenant snapshot into an isolated workspace,
//   2. builds the stale clone's index against the FRESH source,
//   3. drives the clone up the ladder to `promoted` on real winning pairs
//      (fresh index reads in one turn; the inline baseline scans every record),
//      observing that it genuinely SERVES the correct answer at that point,
//   4. mutates the source (appends a record) WITHOUT rebuilding the index,
//   5. runs the next episode — the drift guard now fires, the clone ABSTAINS,
//      and the ladder demotes it promoted -> quarantine.
//
// The returned DriftProbe carries only OBSERVED values: the pre-mutation rung,
// the post-episode rung, and whether the next episode actually abstained. The
// verifier reads exactly these three fields.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { execute } from "./executor.js";
import { defaultLadderConfig, Ladder, type LadderConfig } from "./stateMachine.js";
import { staleCloneSeed } from "./controls.js";
import { isWin } from "./pairing.js";
import { tenantSnapshotDir } from "./paths.js";
import { seedProcedure } from "./seed.js";
import { mountSnapshot } from "./snapshot.js";
import { getTask } from "./tasks.js";
import type { Answer, DriftProbe } from "./types.js";

const CLONE_ID = "stale-clone-control";

export interface DriftProbeResult {
  probe: DriftProbe;
  /** observed answer before the forced drift (must be a served, non-abstain answer) */
  servedBefore: Answer;
  /** observed answer after the forced drift (must be an abstain) */
  servedAfter: Answer;
  /** rung the clone fell from (observed) */
  demotedFrom: string;
}

function writeCloneIndex(dir: string): void {
  const snap = mountSnapshot(dir, "alpha");
  const task = getTask(staleCloneSeed.taskId);
  const records = snap.collections[task.sourceCollection] ?? [];
  const payload = staleCloneSeed.buildIndex(records);
  const indexDir = path.join(dir, "indexes");
  fs.mkdirSync(indexDir, { recursive: true });
  fs.writeFileSync(
    path.join(indexDir, `${staleCloneSeed.indexName}.json`),
    JSON.stringify({ sourceFingerprint: snap.sourceFingerprint, ...payload }, null, 2) + "\n",
  );
}

/**
 * Run the forced-drift probe end to end. `cfg` defaults to the standard ladder
 * config; callers may inject a smaller-boundary config only for isolated unit
 * scheduling — the demo uses the real prereg boundary.
 */
export function runForcedDriftProbe(cfg: LadderConfig = defaultLadderConfig()): DriftProbeResult {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ladder-drift-alpha-"));
  try {
    fs.cpSync(tenantSnapshotDir("alpha"), dir, { recursive: true });
    writeCloneIndex(dir);

    const registry = new Map([[CLONE_ID, seedProcedure(staleCloneSeed)]]);
    const task = getTask(staleCloneSeed.taskId);
    const ladder = new Ladder(cfg);
    ladder.admit(CLONE_ID, "control");

    // ---- edge 1: earn promotion on fresh winning pairs, observing it serves ----
    const fresh = mountSnapshot(dir, "alpha");
    let servedBefore: Answer | undefined;
    let ts = 1_800_000_000;
    // enough pairs to cross the frozen boundary
    const need = cfg.boundaries.minPairs;
    for (let i = 0; i < need; i++) {
      const exposed = execute(task, "exposed", [CLONE_ID], registry, fresh);
      const masked = execute(task, "masked", [], registry, fresh);
      if (i === 0) servedBefore = exposed.answer; // the served (non-abstain) edge
      ladder.observePair(CLONE_ID, { win: isWin(exposed, masked), ts: ts++ });
    }
    const stateBeforeMutation = ladder.stateOf(CLONE_ID);

    // ---- edge 2: force drift, run the next episode, observe demotion + abstain ----
    const ticketsPath = path.join(dir, "tickets.json");
    const tickets = JSON.parse(fs.readFileSync(ticketsPath, "utf8"));
    tickets.push({ id: "T-DRIFT", status: "open", priority: "high", topic: "billing" });
    fs.writeFileSync(ticketsPath, JSON.stringify(tickets)); // index NOT rebuilt

    const drifted = mountSnapshot(dir, "alpha");
    const next = execute(task, "exposed", [CLONE_ID], registry, drifted);
    const abstentionRecorded = next.answer.kind === "abstain" && next.drifted === true;
    let demotedFrom = stateBeforeMutation;
    if (abstentionRecorded) demotedFrom = ladder.demote(CLONE_ID, next.answer.kind === "abstain" ? next.answer.reason : "drift");
    const stateAfterNextEpisode = ladder.stateOf(CLONE_ID);

    const probe: DriftProbe = {
      stateBeforeMutation,
      stateAfterNextEpisode,
      abstentionRecorded,
    };
    ladder.attachDriftProbe(CLONE_ID, probe);

    if (!servedBefore) throw new Error("drift probe never ran a fresh episode");
    return { probe, servedBefore, servedAfter: next.answer, demotedFrom };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
