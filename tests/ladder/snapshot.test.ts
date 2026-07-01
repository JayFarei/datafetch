import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { tenantSnapshotDir } from "../../src/ladder/paths.js";
import { fingerprintSnapshot, mountSnapshot } from "../../src/ladder/snapshot.js";

const tmpRoots: string[] = [];

function copySnapshot(tenant: string): string {
  const src = tenantSnapshotDir(tenant);
  const dst = fs.mkdtempSync(path.join(os.tmpdir(), `ladder-snap-${tenant}-`));
  tmpRoots.push(dst);
  fs.cpSync(src, dst, { recursive: true });
  return dst;
}

afterAll(() => {
  for (const d of tmpRoots) fs.rmSync(d, { recursive: true, force: true });
});

describe("snapshot mount + drift fingerprint (C1)", () => {
  it("mounts source collections and derived indexes separately", () => {
    const snap = mountSnapshot(tenantSnapshotDir("alpha"), "alpha");
    expect(snap.collections["tickets"]).toBeDefined();
    expect(snap.collections["tickets"]!.length).toBe(24);
    expect(snap.indexes["open-high-count"]).toBeDefined();
    // an index is NOT loaded as a source collection
    expect(snap.collections["indexes"]).toBeUndefined();
  });

  it("fingerprint is deterministic across repeated reads", () => {
    const dir = tenantSnapshotDir("beta");
    expect(fingerprintSnapshot(dir)).toBe(fingerprintSnapshot(dir));
  });

  it("committed index fingerprints match the live source fingerprint (fresh, not drifted)", () => {
    const snap = mountSnapshot(tenantSnapshotDir("alpha"), "alpha");
    expect(snap.indexes["open-high-count"]!.sourceFingerprint).toBe(snap.sourceFingerprint);
  });

  it("mutating a SOURCE file flips the fingerprint", () => {
    const dir = copySnapshot("alpha");
    const before = fingerprintSnapshot(dir);
    const ticketsPath = path.join(dir, "tickets.json");
    const tickets = JSON.parse(fs.readFileSync(ticketsPath, "utf8"));
    tickets[0].status = "closed"; // real mutation of source data
    fs.writeFileSync(ticketsPath, JSON.stringify(tickets));
    expect(fingerprintSnapshot(dir)).not.toBe(before);
  });

  it("mutating only a DERIVED index does NOT flip the source fingerprint", () => {
    const dir = copySnapshot("alpha");
    const before = fingerprintSnapshot(dir);
    const idxPath = path.join(dir, "indexes", "open-high-count.json");
    const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
    idx.count = 999;
    fs.writeFileSync(idxPath, JSON.stringify(idx));
    expect(fingerprintSnapshot(dir)).toBe(before);
  });
});
