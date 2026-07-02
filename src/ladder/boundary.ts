// Pre-registered sequential promotion boundary (defeaters D6/D7, checks V0/V5).
//
// The boundary is FROZEN in prereg/ladder-boundaries.json before the first
// episode. Nothing here is tuned after seeing data: promotion requires the
// accumulated pair count to reach `minPairs` AND the counterfactual win-rate to
// clear `winFloor`. Evaluating the same pre-registered rule at every pair count
// is what makes this a *sequential* boundary rather than a single fixed-N test;
// the rule itself never changes, so there is no garden-of-forking-paths (D7).
//
// `preregHash` reproduces exactly what verify/ladder.sh computes
// (`jq -cS prereg/ladder-boundaries.json | shasum -a 256`) so a runtime
// boundary decision can be tied back to the committed prereg (V0 hash match).

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "./paths.js";

export const PREREG_PATH = path.join(REPO_ROOT, "prereg", "ladder-boundaries.json");

export interface Boundaries {
  /** minimum shadow pairs before a promotion decision may fire */
  minPairs: number;
  /** counterfactual win-rate the procedure must clear to promote */
  winFloor: number;
  /** post-promotion temporal-holdout minimum (V7:G1) */
  holdoutFloor: number;
  /** maximum |Δts| between the two arms of a pair (V3) */
  pairWindowSec: number;
}

/** Read the frozen boundaries from the committed prereg. */
export function loadBoundaries(preregPath: string = PREREG_PATH): Boundaries {
  const raw = JSON.parse(fs.readFileSync(preregPath, "utf8"));
  for (const k of ["minPairs", "winFloor", "holdoutFloor", "pairWindowSec"] as const) {
    if (typeof raw[k] !== "number") {
      throw new Error(`prereg boundary field ${k} missing or non-numeric`);
    }
  }
  return {
    minPairs: raw.minPairs,
    winFloor: raw.winFloor,
    holdoutFloor: raw.holdoutFloor,
    pairWindowSec: raw.pairWindowSec,
  };
}

/**
 * SHA-256 of the prereg, computed the EXACT way verify/ladder.sh (V0) recomputes
 * it: `jq -cS <file> | shasum -a 256`. We shell out to the same `jq -cS` so the
 * runtime `preregHash` is byte-identical to the verifier's regardless of jq's
 * number-literal formatting (jq preserves `0.70`; JSON.stringify would emit
 * `0.7`), then hash jq's exact stdout — trailing newline and all, matching how
 * `shasum` reads the piped bytes.
 */
export function preregHash(preregPath: string = PREREG_PATH): string {
  const canonical = execFileSync("jq", ["-cS", ".", preregPath]);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export interface BoundaryDecision {
  crossed: boolean;
  pairs: number;
  wins: number;
  winRate: number;
  /**
   * Reference recorded on a promotion's evidence block. Embeds the prereg hash
   * (ties the decision to the frozen boundary) and the pair count at crossing.
   * A promotion without a boundaryRef is red (V5).
   */
  boundaryRef: string;
  reason: string;
}

/**
 * Evaluate the frozen boundary against accumulated evidence. Pure: same inputs,
 * same decision — no hidden state, no data-dependent thresholds.
 */
export function evaluateBoundary(
  pairs: number,
  wins: number,
  boundaries: Boundaries,
  hash: string = preregHash(),
): BoundaryDecision {
  const winRate = pairs > 0 ? wins / pairs : 0;
  const enoughPairs = pairs >= boundaries.minPairs;
  const clearsFloor = winRate >= boundaries.winFloor;
  const crossed = enoughPairs && clearsFloor;
  const boundaryRef = `prereg:${hash}@pairs=${pairs},wins=${wins}`;
  const reason = crossed
    ? `crossed: ${pairs} pairs (>= ${boundaries.minPairs}) at winRate ${winRate.toFixed(3)} (>= ${boundaries.winFloor})`
    : !enoughPairs
      ? `under-evidenced: ${pairs} pairs (< ${boundaries.minPairs})`
      : `below win floor: winRate ${winRate.toFixed(3)} (< ${boundaries.winFloor})`;
  return { crossed, pairs, wins, winRate, boundaryRef, reason };
}
