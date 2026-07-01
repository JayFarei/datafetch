// Permanent negative-control procedures (defeaters D2/D8, checks V4/V6).
//
// These are manufactured failures that must NEVER promote (and must be caught
// if forced to). S1 needs the shim to give the ablation check (V6) teeth: a
// decorative pass-through that, if promoted, must be flagged as load-bearing-
// less. The degenerate control (always-empty answer) is the D2 fixture. The
// stale-clone control is wired by the drift probe in S2.

import { makeAbstain } from "./answerContract.js";
import { PASS, type Procedure } from "./executor.js";

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
 * Stale-clone control: a procedure that would serve a cached answer but must
 * abstain once the snapshot drifts. Modelled here as a drift-abstaining shim;
 * S2's forced-drift probe drives it across the promoted → quarantine edge.
 */
export const staleCloneControl: Procedure = {
  id: "stale-clone-control",
  run() {
    // No live index of its own; it can never validate against the snapshot, so
    // it always abstains under drift semantics.
    return makeAbstain("drift:stale-clone");
  },
};

export const CONTROL_PROCEDURES: Procedure[] = [
  shimControl,
  degenerateControl,
  staleCloneControl,
];
