import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  buildPairEpisodes,
  isWin,
  LIBRARY_TOKENS,
  scorePair,
} from "../../src/ladder/pairing.js";
import { loadBoundaries } from "../../src/ladder/boundary.js";
import { REPO_ROOT, tenantSnapshotDir } from "../../src/ladder/paths.js";
import { buildRegistry } from "../../src/ladder/registry.js";
import { mountSnapshot } from "../../src/ladder/snapshot.js";

const FULL = { asOf: 24 };

const registry = buildRegistry({ withControls: true });
const tmp: string[] = [];
function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "ladder-pair-"));
  tmp.push(d);
  return d;
}
afterAll(() => {
  for (const d of tmp) fs.rmSync(d, { recursive: true, force: true });
});

describe("shadow-pair harness (V3, defeaters D4/D5)", () => {
  const snap = mountSnapshot(tenantSnapshotDir("alpha"), "alpha");

  it("scores an index-backed exposed arm as a cost win over the inline masked arm", () => {
    const score = scorePair("alpha-open-high", FULL, ["alpha-open-high-count"], registry, snap);
    expect(score.exposed.turns).toBeLessThan(score.masked.turns); // measured, real
    expect(score.win).toBe(true);
  });

  it("excludes a degenerate empty-list answer from winning (D2)", () => {
    // list task; the degenerate control returns [] — trivial, cannot win.
    const score = scorePair("alpha-open-topics", FULL, ["degenerate-control"], registry, snap);
    expect(score.win).toBe(false);
  });

  it("an abstaining exposed arm loses its pair", () => {
    const abstain = { answer: { kind: "abstain", reason: "drift:x" }, turns: 1, drifted: true } as const;
    const masked = { answer: { kind: "count", value: 8 }, turns: 3, drifted: false } as const;
    expect(isWin(abstain, masked)).toBe(false);
  });

  it("a correct-but-not-cheaper exposed arm loses (cost is the win criterion)", () => {
    const exposed = { answer: { kind: "count", value: 8 }, turns: 3, drifted: false } as const;
    const masked = { answer: { kind: "count", value: 8 }, turns: 3, drifted: false } as const;
    expect(isWin(exposed, masked)).toBe(false);
  });

  it("a cheaper-but-WRONG exposed arm loses (correctness parity required)", () => {
    const exposed = { answer: { kind: "count", value: 7 }, turns: 1, drifted: false } as const;
    const masked = { answer: { kind: "count", value: 8 }, turns: 3, drifted: false } as const;
    expect(isWin(exposed, masked)).toBe(false);
  });

  it("emits a well-formed pair: 2 rows, shared pairId, same query+snapshot, arms alternate, |Δts|<=window", () => {
    const promptDir = path.join(tmpDir(), "prompts");
    const b = loadBoundaries();
    const { masked, exposed } = buildPairEpisodes({
      pairId: "P-1",
      tenant: "alpha",
      taskId: "alpha-open-high",
      taskParam: FULL,
      lineage: ["alpha-open-high-count"],
      tsMasked: 1_800_000_000,
      tsExposed: 1_800_000_001,
      commit: "S2-TEST",
      preregHash: "deadbeef",
      promptDir,
      registry,
      snapshot: snap,
    });

    expect(masked.pairId).toBe("P-1");
    expect(exposed.pairId).toBe("P-1");
    expect(masked.query).toBe(exposed.query);
    expect(masked.snapshotHash).toBe(exposed.snapshotHash);
    expect([masked.arm, exposed.arm].sort()).toEqual(["exposed", "masked"]);
    expect(Math.abs(exposed.ts - masked.ts)).toBeLessThanOrEqual(b.pairWindowSec);
    expect(masked.driver).toBe("scripted");
    // measured turns, not constants
    expect(exposed.turns).toBe(1);
    expect(masked.turns).toBe(3);
    // exposed carries pairWin; masked does not
    expect(exposed.pairWin).toBe(true);
    expect(masked.pairWin).toBeUndefined();
    expect(masked.lineage).toEqual([]);
  });

  it("writes masked prompt files with ZERO library tokens, and exposed prompts that DO reference the library", () => {
    const promptDir = path.join(tmpDir(), "prompts");
    const { masked, exposed } = buildPairEpisodes({
      pairId: "P-2",
      tenant: "beta",
      taskId: "beta-delivered-sum",
      taskParam: FULL,
      lineage: ["beta-delivered-sum"],
      tsMasked: 1_800_000_000,
      tsExposed: 1_800_000_002,
      commit: "S2-TEST",
      promptDir,
      registry,
      snapshot: mountSnapshot(tenantSnapshotDir("beta"), "beta"),
    });

    const maskedAbs = path.resolve(REPO_ROOT, masked.promptPath);
    const exposedAbs = path.resolve(REPO_ROOT, exposed.promptPath);
    const maskedText = fs.readFileSync(maskedAbs, "utf8");
    const exposedText = fs.readFileSync(exposedAbs, "utf8");

    // exactly the verifier's V3 grep, run against the file on disk
    expect(LIBRARY_TOKENS.test(maskedText)).toBe(false);
    // the mask is meaningful: the exposed arm genuinely sees library surface
    expect(LIBRARY_TOKENS.test(exposedText)).toBe(true);
  });
});
