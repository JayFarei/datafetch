// Permanent negative-control procedures (defeaters D2/D8, checks V4/V6).
//
// These are manufactured failures that must NEVER promote (and must be caught
// if forced to). S1 needs the shim to give the ablation check (V6) teeth: a
// decorative pass-through that, if promoted, must be flagged as load-bearing-
// less. The degenerate control (always-empty answer) is the D2 fixture. The
// stale-clone control is wired by the drift probe in S2.

import { PASS, type Procedure } from "./executor.js";
import { seedProcedure, type Seed } from "./seed.js";

/**
 * Decorative shim: always PASSes. On the answer path it contributes nothing,
 * so removing it never changes the answer — which is exactly what the ablation
 * check must flag if this ever reaches `promoted`.
 */
export const shimControl: Procedure = {
  id: "shallow-control",
  run() {
    return PASS;
  },
};

/**
 * Degenerate control: always answers with an empty list regardless of the task.
 * Trivial/empty answers are excluded from win counting by rule (D2), so this
 * can never earn a promotion.
 */
export const degenerateControl: Procedure = {
  id: "degenerate-control",
  run() {
    return { kind: "list", items: [] };
  },
};

/**
 * Stale-clone control: a REAL index-backed procedure (a clone of the alpha
 * open+high count) with the standard drift guard. On a fresh snapshot its index
 * matches the source fingerprint, so it serves the correct answer cheaply and
 * can earn its way to `promoted` through the ladder like any procedure. Once the
 * snapshot source is mutated, its committed index goes stale and the drift guard
 * makes it ABSTAIN instead of serving the stale answer — the promoted ->
 * quarantine demotion the forced-drift probe (src/ladder/driftProbe.ts) drives
 * and observes on both edges (V4:drift). It is a `control` provenance so it can
 * never satisfy V5's non-control promotion requirement.
 *
 * On the committed tenant snapshots no `stale-clone-count` index exists, so in
 * normal traffic it simply abstains (drift:index-missing) and never promotes;
 * the probe builds the index in an isolated workspace to exercise both edges.
 */
export const staleCloneSeed: Seed = {
  id: "stale-clone-control",
  taskId: "alpha-open-high",
  provenance: "control",
  indexName: "stale-clone-count",
  buildIndex(records) {
    const matchPositions = records
      .map((r, pos) => ({ r, pos }))
      .filter(({ r }) => r["status"] === "open" && r["priority"] === "high")
      .map(({ pos }) => pos);
    return { matchPositions };
  },
  reduceIndex(index, param) {
    const positions = (index["matchPositions"] as number[]) ?? [];
    return { kind: "count", value: positions.filter((p) => p < param.asOf).length };
  },
};

export const staleCloneControl: Procedure = seedProcedure(staleCloneSeed);

export const CONTROL_PROCEDURES: Procedure[] = [
  shimControl,
  degenerateControl,
  staleCloneControl,
];
