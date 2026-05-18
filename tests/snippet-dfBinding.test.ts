import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, beforeEach } from "vitest";

import { buildDf } from "../src/snippet/dfBinding.js";
import { isAnswerEnvelope } from "../src/snippet/answer.js";
import {
  InMemoryMountRuntimeRegistry,
  makeMountRuntime,
  setMountRuntimeRegistry,
} from "../src/adapter/runtime.js";
import {
  costZero,
  TrajectoryRecorder,
  type CollectionHandle,
  type DispatchContext,
  type MountAdapter,
} from "../src/sdk/index.js";

function buildAdapter(handle: CollectionHandle<unknown>): MountAdapter & {
  close: () => Promise<void>;
} {
  return {
    id: "stub",
    capabilities: () => ({ vector: false, lex: false, stream: false, compile: false }),
    probe: async () => ({ collections: [] }),
    sample: async () => [],
    collection: <T>() => handle as unknown as CollectionHandle<T>,
    close: async () => {},
  };
}

function buildHandle(rows: unknown[]): CollectionHandle<unknown> {
  return {
    findExact: async () => rows,
    search: async () => rows,
    findSimilar: async () => rows,
    hybrid: async () => rows,
  };
}

function buildDispatchCtx(recorder?: TrajectoryRecorder): DispatchContext {
  return {
    tenant: "t",
    mount: "m",
    pins: {},
    cost: costZero(),
    ...(recorder !== undefined ? { trajectory: recorder } : {}),
  };
}

describe("buildDf — df.db.<ident>", () => {
  beforeEach(() => {
    setMountRuntimeRegistry(new InMemoryMountRuntimeRegistry());
  });

  it("resolves df.db.<ident> via the registered MountRuntime", async () => {
    const reg = new InMemoryMountRuntimeRegistry();
    setMountRuntimeRegistry(reg);
    const handle = buildHandle([{ id: "a" }, { id: "b" }]);
    reg.register(
      "demo",
      makeMountRuntime({
        mountId: "demo",
        adapter: buildAdapter(handle),
        identMap: [{ ident: "cases", name: "raw_cases" }],
      }),
    );

    const recorder = new TrajectoryRecorder({ tenantId: "t", question: "q" });
    const df = buildDf({
      sessionCtx: { tenantId: "t", mountIds: ["demo"], baseDir: "/tmp/x" },
      dispatchCtx: buildDispatchCtx(recorder),
    });
    const result = await df.db.cases!.findExact({}, 5);
    expect(result).toEqual([{ id: "a" }, { id: "b" }]);
    // The call should have produced a trajectory record under
    // primitive `db.cases.findExact`.
    const calls = recorder.snapshot.calls;
    expect(calls.find((c) => c.primitive === "db.cases.findExact")).toBeDefined();
  });

  it("throws when accessing an ident that no registered mount publishes", async () => {
    const df = buildDf({
      sessionCtx: { tenantId: "t", mountIds: [], baseDir: "/tmp/x" },
      dispatchCtx: buildDispatchCtx(),
    });
    expect(() => df.db.unknownIdent).toThrow(/ident not found/);
  });

  it("throws an ambiguity error when two mounts publish the same ident", async () => {
    const reg = new InMemoryMountRuntimeRegistry();
    setMountRuntimeRegistry(reg);
    const ident = { ident: "shared", name: "x" };
    reg.register(
      "m1",
      makeMountRuntime({
        mountId: "m1",
        adapter: buildAdapter(buildHandle([])),
        identMap: [ident],
      }),
    );
    reg.register(
      "m2",
      makeMountRuntime({
        mountId: "m2",
        adapter: buildAdapter(buildHandle([])),
        identMap: [ident],
      }),
    );
    const df = buildDf({
      sessionCtx: { tenantId: "t", mountIds: ["m1", "m2"], baseDir: "/tmp/x" },
      dispatchCtx: buildDispatchCtx(),
    });
    expect(() => df.db.shared).toThrow(/ambiguous/);
  });

  it("charges substrate tier (2) and accumulates ms.cold on each call", async () => {
    const reg = new InMemoryMountRuntimeRegistry();
    setMountRuntimeRegistry(reg);
    reg.register(
      "demo",
      makeMountRuntime({
        mountId: "demo",
        adapter: buildAdapter(buildHandle([])),
        identMap: [{ ident: "rows", name: "rows" }],
      }),
    );
    const ctx = buildDispatchCtx();
    const df = buildDf({
      sessionCtx: { tenantId: "t", mountIds: ["demo"], baseDir: "/tmp/x" },
      dispatchCtx: ctx,
    });
    expect(ctx.cost.tier).toBe(0);
    await df.db.rows!.findExact({}, 1);
    expect(ctx.cost.tier).toBeGreaterThanOrEqual(2);
    expect(ctx.cost.llmCalls).toBe(0);
    expect(ctx.cost.ms.cold).toBeGreaterThanOrEqual(0);
  });

  it("creates marked structured answer envelopes via df.answer", () => {
    const df = buildDf({
      sessionCtx: { tenantId: "t", mountIds: [], baseDir: "/tmp/x" },
      dispatchCtx: buildDispatchCtx(),
    });

    const answer = df.answer({
      intent: {
        name: "constantAnswer",
        parent: "count rows",
        relation: "derived",
      },
      status: "answered",
      value: 42,
      evidence: [{ ref: "case-1" }],
      derivation: { operation: "constant" },
    });

    expect(answer).toMatchObject({
      intent: {
        name: "constantAnswer",
        parent: "count rows",
        relation: "derived",
      },
      status: "answered",
      value: 42,
      evidence: [{ ref: "case-1" }],
      derivation: { operation: "constant" },
    });
    expect(answer.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(isAnswerEnvelope(answer)).toBe(true);
  });

  it("returns a structured tool error when a SkillCraft runner ignores SIGTERM", async () => {
    const dir = mkdtempSync(join(tmpdir(), "df-tool-timeout-"));
    const runnerPath = join(dir, "hang-runner.mjs");
    writeFileSync(
      runnerPath,
      [
        "process.on('SIGTERM', () => {});",
        "setInterval(() => {}, 1000);",
      ].join("\n"),
    );

    try {
      const df = buildDf({
        sessionCtx: {
          tenantId: "t",
          mountIds: [],
          baseDir: dir,
          toolBridge: {
            datasetDir: dir,
            bundles: ["demo"],
            runnerPath,
            python: process.execPath,
            toolTimeoutMs: 25,
          },
        },
        dispatchCtx: buildDispatchCtx(),
      });

      const result = await df.tool.demo!.hangs({});
      expect(result).toMatchObject({
        success: false,
        tool: "hangs",
        input: {},
      });
      expect(String((result as { error?: unknown }).error)).toContain("timed out");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 10_000);

  it("memoizes identical tool calls within one snippet binding", async () => {
    const dir = mkdtempSync(join(tmpdir(), "df-tool-memo-"));
    const runnerPath = join(dir, "count-runner.mjs");
    const countPath = join(dir, "count.txt");
    writeFileSync(
      runnerPath,
      [
        'import { readFileSync, writeFileSync, existsSync } from "node:fs";',
        `const countPath = ${JSON.stringify(countPath)};`,
        "const count = existsSync(countPath) ? Number(readFileSync(countPath, 'utf8')) : 0;",
        "writeFileSync(countPath, String(count + 1));",
        "const args = JSON.parse(process.argv[process.argv.indexOf('--args') + 1] ?? '{}');",
        "console.log(JSON.stringify({ result: { success: true, args } }));",
      ].join("\n"),
    );

    try {
      const df = buildDf({
        sessionCtx: {
          tenantId: "t",
          mountIds: [],
          baseDir: dir,
          toolBridge: {
            datasetDir: dir,
            bundles: ["demo"],
            runnerPath,
            python: process.execPath,
            toolTimeoutMs: 1_000,
          },
        },
        dispatchCtx: buildDispatchCtx(),
      });

      const first = await df.tool.demo!.lookup({ b: 2, a: 1 });
      const second = await df.tool.demo!.lookup({ a: 1, b: 2 });
      expect(first).toEqual(second);
      expect(readFileSync(countPath, "utf8")).toBe("1");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
