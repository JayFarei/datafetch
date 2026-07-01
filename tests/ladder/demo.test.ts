import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { runDemo } from "../../src/ladder/demo.js";
import { LIBRARY_TOKENS } from "../../src/ladder/pairing.js";
import { REPO_ROOT } from "../../src/ladder/paths.js";
import type { Episode } from "../../src/ladder/types.js";

const tmp: string[] = [];
function roots() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "ladder-demo-"));
  tmp.push(base);
  return { demoDir: path.join(base, "demo"), tenant2Dir: path.join(base, "demo-tenant2") };
}
afterAll(() => {
  for (const d of tmp) fs.rmSync(d, { recursive: true, force: true });
});

describe("S3 demo driver (BUILD-SPEC §6)", () => {
  const { alpha, beta } = runDemo(roots());

  const nonControl = (out: typeof alpha) =>
    out.promoted.filter((id) => out.state[id]?.provenance !== "control");

  it("promotes each tenant's own intents — promoted sets DIVERGE (per-user learning)", () => {
    expect(nonControl(alpha).sort()).toEqual(["alpha-open-high-count", "alpha-open-topics-index"]);
    expect(nonControl(beta).sort()).toEqual(["beta-delivered-sum", "beta-open-regions-index"]);
    // no procedure promotes on both tenants from its own traffic
    const overlap = nonControl(alpha).filter((id) => nonControl(beta).includes(id));
    expect(overlap).toEqual([]);
  });

  it("gate is live in BOTH directions (anti-inert): >=1 promote and >=1 reject on alpha", () => {
    const promotes = alpha.promotions.filter((p) => p.decision === "promote").length;
    const rejects = alpha.promotions.filter((p) => p.decision === "reject").length;
    expect(promotes).toBeGreaterThanOrEqual(1);
    expect(rejects).toBeGreaterThanOrEqual(1);
  });

  it("negative controls never reach promoted", () => {
    expect(alpha.state["shallow-control"].state).not.toBe("promoted");
    expect(alpha.state["degenerate-control"].state).not.toBe("promoted");
  });

  it("every promotion is boundary-backed with pairs >= minPairs (V5)", () => {
    for (const id of nonControl(alpha)) {
      const ev = alpha.state[id].evidence!;
      expect(ev.boundaryRef).toBeTruthy();
      expect(ev.pairs).toBeGreaterThanOrEqual(30);
    }
  });

  it("promoted procedures have >=5 winning post-promotion exposed episodes (V7:G1 holdout)", () => {
    for (const id of nonControl(alpha)) {
      const t = alpha.promotedAt[id];
      const post = alpha.rows.filter(
        (r) => r.arm === "exposed" && (r.lineage ?? []).includes(id) && r.ts > t,
      );
      expect(post.length).toBeGreaterThanOrEqual(5);
      const wins = post.filter((r) => r.pairWin === true).length;
      expect(wins / post.length).toBeGreaterThanOrEqual(0.6);
    }
  });

  it("forced-drift probe observed both edges (promoted -> quarantine + abstention)", () => {
    expect(alpha.driftProbe).toEqual({
      stateBeforeMutation: "promoted",
      stateAfterNextEpisode: "quarantine",
      abstentionRecorded: true,
    });
    expect(alpha.state["stale-clone-control"].driftProbe).toEqual(alpha.driftProbe);
  });

  it("graceful floor probe: masked serves + drift abstains", () => {
    expect(alpha.floorProbe).toEqual({ maskedServeOk: true, driftAbstained: true });
  });

  it("emits the adversarial prose-in-string row and the contract actually rejects it (V1)", () => {
    const adv = alpha.rows.find((r) => r.fixture === "prose-in-string");
    expect(adv).toBeDefined();
    expect(adv!.contractRejected).toBe(true);
    expect(adv!.answerSchemaOk).toBe(true); // the fallback row itself is schema-valid
  });

  it("cross-tenant suggestion enters beta's quarantine and must earn its way (stays put here)", () => {
    // alpha's promoted proc was suggested to beta; beta's gate declined it
    expect(beta.state["alpha-open-high-count"]).toBeDefined();
    expect(beta.state["alpha-open-high-count"].state).not.toBe("promoted");
    expect(beta.rejected).toContain("alpha-open-high-count");
  });

  it("turns are MEASURED: exposed (index) strictly cheaper than masked (scan)", () => {
    const pairIds = new Set(
      alpha.rows.filter((r) => r.pairId && (r.lineage ?? []).includes("alpha-open-high-count")).map((r) => r.pairId),
    );
    const pid = [...pairIds][0]!;
    const exposed = alpha.rows.find((r) => r.pairId === pid && r.arm === "exposed")!;
    const masked = alpha.rows.find((r) => r.pairId === pid && r.arm === "masked")!;
    expect(exposed.turns).toBeGreaterThan(0);
    expect(masked.turns).toBeGreaterThan(exposed.turns);
  });

  it("masked prompt files on disk contain ZERO library tokens (V3)", () => {
    const maskedPaths = new Set(
      alpha.rows.filter((r) => r.arm === "masked" && r.pairId).map((r) => r.promptPath),
    );
    expect(maskedPaths.size).toBeGreaterThan(0);
    for (const rel of maskedPaths) {
      const text = fs.readFileSync(path.resolve(REPO_ROOT, rel), "utf8");
      expect(LIBRARY_TOKENS.test(text)).toBe(false);
    }
  });

  it("is deterministic: two runs into the same dir yield byte-identical episodes", () => {
    const r = roots();
    const first = runDemo(r);
    const second = runDemo(r);
    const serialize = (rows: Episode[]) => rows.map((row) => JSON.stringify(row)).join("\n");
    expect(serialize(second.alpha.rows)).toEqual(serialize(first.alpha.rows));
    expect(serialize(second.beta.rows)).toEqual(serialize(first.beta.rows));
  });
});
