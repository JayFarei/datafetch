import { execSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  evaluateBoundary,
  loadBoundaries,
  preregHash,
  PREREG_PATH,
} from "../../src/ladder/boundary.js";
import { REPO_ROOT } from "../../src/ladder/paths.js";

describe("frozen sequential boundary (V0 / V5, defeaters D6/D7)", () => {
  const b = loadBoundaries();

  it("loads the pre-registered boundaries", () => {
    expect(b.minPairs).toBe(30);
    expect(b.winFloor).toBeCloseTo(0.7);
    expect(b.holdoutFloor).toBeCloseTo(0.6);
    expect(b.pairWindowSec).toBe(600);
  });

  it("preregHash reproduces the verifier's `jq -cS | shasum -a 256` byte-for-byte", () => {
    // This is exactly how verify/ladder.sh (V0) recomputes the runtime hash.
    const shell = execSync(`jq -cS . "${PREREG_PATH}" | shasum -a 256 | cut -d' ' -f1`, {
      cwd: REPO_ROOT,
    })
      .toString()
      .trim();
    expect(preregHash()).toBe(shell);
  });

  it("does NOT cross below minPairs, even at a perfect win-rate", () => {
    const d = evaluateBoundary(29, 29, b);
    expect(d.crossed).toBe(false);
    expect(d.reason).toMatch(/under-evidenced/);
  });

  it("does NOT cross at minPairs when the win-rate is below the floor (D6 usage-gating)", () => {
    // 15/30 = 0.50 win-rate: high usage, sub-floor — must not promote.
    const d = evaluateBoundary(30, 15, b);
    expect(d.crossed).toBe(false);
    expect(d.reason).toMatch(/below win floor/);
  });

  it("crosses at minPairs once the win-rate clears the floor", () => {
    const d = evaluateBoundary(30, 24, b); // 0.80 >= 0.70
    expect(d.crossed).toBe(true);
    expect(d.boundaryRef).toContain(preregHash());
    expect(d.boundaryRef).toContain("pairs=30");
  });

  it("is pure: same inputs, same decision", () => {
    expect(evaluateBoundary(30, 24, b)).toEqual(evaluateBoundary(30, 24, b));
  });
});
