import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { execute, executeInline } from "../../src/ladder/executor.js";
import { tenantSnapshotDir } from "../../src/ladder/paths.js";
import { buildRegistry, without } from "../../src/ladder/registry.js";
import { mountSnapshot } from "../../src/ladder/snapshot.js";
import { getTask } from "../../src/ladder/tasks.js";

const tmpRoots: string[] = [];
afterAll(() => {
  for (const d of tmpRoots) fs.rmSync(d, { recursive: true, force: true });
});

function copySnapshot(tenant: string): string {
  const dst = fs.mkdtempSync(path.join(os.tmpdir(), `ladder-exec-${tenant}-`));
  tmpRoots.push(dst);
  fs.cpSync(tenantSnapshotDir(tenant), dst, { recursive: true });
  return dst;
}

const registry = buildRegistry({ withControls: true });

describe("executor with measured turns (C1)", () => {
  it("masked inline pages the whole collection; exposed index reads one page", () => {
    const snap = mountSnapshot(tenantSnapshotDir("alpha"), "alpha");
    const task = getTask("alpha-open-high");

    const inline = executeInline(task, snap);
    const exposed = execute(task, "exposed", ["alpha-open-high-count"], registry, snap);

    // 24 records / pageSize 8 = 3 pages of inline scanning
    expect(inline.turns).toBe(3);
    // index-backed procedure reads exactly one aggregate
    expect(exposed.turns).toBe(1);
    // turns are measured, not equal — the cost win is real
    expect(exposed.turns).toBeLessThan(inline.turns);
  });

  it("inline and index paths produce the SAME answer (correctness parity)", () => {
    const snap = mountSnapshot(tenantSnapshotDir("beta"), "beta");
    const task = getTask("beta-delivered-sum");
    const inline = executeInline(task, snap);
    const exposed = execute(task, "exposed", ["beta-delivered-sum"], registry, snap);
    expect(exposed.answer).toEqual(inline.answer);
    expect(exposed.answer).toEqual({ kind: "count", value: 1224 });
  });

  it("exposed with empty lineage falls to the inline baseline", () => {
    const snap = mountSnapshot(tenantSnapshotDir("alpha"), "alpha");
    const task = getTask("alpha-open-high");
    const r = execute(task, "exposed", [], registry, snap);
    expect(r.turns).toBe(3);
    expect(r.answer).toEqual({ kind: "count", value: 8 });
  });

  it("exposed with a REMOVED procedure abstains (load-bearing, not silent inline)", () => {
    const snap = mountSnapshot(tenantSnapshotDir("alpha"), "alpha");
    const task = getTask("alpha-open-high");
    const ablated = without(registry, "alpha-open-high-count");
    const r = execute(task, "exposed", ["alpha-open-high-count"], ablated, snap);
    expect(r.answer.kind).toBe("abstain");
  });

  it("a decorative shim before the solver leaves the answer unchanged", () => {
    const snap = mountSnapshot(tenantSnapshotDir("alpha"), "alpha");
    const task = getTask("alpha-open-high");
    const withShim = execute(task, "exposed", ["shallow-control", "alpha-open-high-count"], registry, snap);
    const solo = execute(task, "exposed", ["alpha-open-high-count"], registry, snap);
    expect(withShim.answer).toEqual(solo.answer);
  });

  it("drift: a stale index makes the procedure abstain instead of serving stale", () => {
    const dir = copySnapshot("alpha");
    // mutate the SOURCE so the committed index fingerprint goes stale
    const ticketsPath = path.join(dir, "tickets.json");
    const tickets = JSON.parse(fs.readFileSync(ticketsPath, "utf8"));
    tickets.push({ id: "T-999", status: "open", priority: "high", topic: "billing" });
    fs.writeFileSync(ticketsPath, JSON.stringify(tickets));

    const snap = mountSnapshot(dir, "alpha");
    const task = getTask("alpha-open-high");
    const r = execute(task, "exposed", ["alpha-open-high-count"], registry, snap);
    expect(r.answer.kind).toBe("abstain");
    expect(r.drifted).toBe(true);

    // the masked inline path still serves a fresh, correct answer under drift
    const inline = execute(task, "masked", [], registry, snap);
    expect(inline.answer).toEqual({ kind: "count", value: 9 });
    expect(inline.drifted).toBe(false);
  });
});
