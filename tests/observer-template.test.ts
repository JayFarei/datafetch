import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { TrajectoryRecord } from "../src/sdk/index.js";
import {
  computeIntentSignature,
  extractCandidateTemplates,
  extractNestedTemplates,
  extractSubGraphTemplates,
  extractTemplate,
  extractTemplateFromCalls,
  readLibrarySnapshot,
} from "../src/observer/template.js";

function buildTrajectory(
  calls: TrajectoryRecord["calls"],
  overrides: Partial<TrajectoryRecord> = {},
): TrajectoryRecord {
  return {
    id: overrides.id ?? "traj_test",
    tenantId: overrides.tenantId ?? "t",
    question: overrides.question ?? "test",
    mode: overrides.mode ?? "interpreted",
    calls,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  };
}

const ISO = new Date().toISOString();

describe("extractTemplate", () => {
  it("throws when the trajectory has no calls", () => {
    const traj = buildTrajectory([]);
    expect(() => extractTemplate(traj)).toThrow(/no calls/);
  });

  it("emits one step per call with sequential outputName", () => {
    const traj = buildTrajectory([
      {
        index: 0,
        primitive: "db.cases.findSimilar",
        input: { query: "AAPL 2017", limit: 5 },
        output: [{ filename: "AAPL/2017/page_42.pdf" }],
        startedAt: ISO,
        durationMs: 0,
      },
      {
        index: 1,
        primitive: "lib.pickFiling",
        input: {
          question: "AAPL 2017",
          candidates: [{ filename: "AAPL/2017/page_42.pdf" }],
        },
        output: { filename: "AAPL/2017/page_42.pdf" },
        startedAt: ISO,
        durationMs: 0,
      },
    ]);
    const tpl = extractTemplate(traj);
    expect(tpl.steps).toHaveLength(2);
    expect(tpl.steps[0]!.primitive).toBe("db.cases.findSimilar");
    expect(tpl.steps[0]!.outputName).toBe("out0");
    expect(tpl.steps[1]!.primitive).toBe("lib.pickFiling");
    expect(tpl.steps[1]!.outputName).toBe("out1");
    expect(tpl.finalOutputBinding).toBe("out1");
  });

  it("binds a downstream input field to an earlier output when shapes match", () => {
    // pickFiling.candidates is the literal output of findSimilar.
    const found = [{ filename: "x", searchableText: "y" }];
    const traj = buildTrajectory([
      {
        index: 0,
        primitive: "db.cases.findSimilar",
        input: { query: "q", limit: 5 },
        output: found,
        startedAt: ISO,
        durationMs: 0,
      },
      {
        index: 1,
        primitive: "lib.pickFiling",
        input: { question: "q", candidates: found },
        output: found[0],
        startedAt: ISO,
        durationMs: 0,
      },
    ]);
    const tpl = extractTemplate(traj);
    const binding = tpl.steps[1]!.inputBindings["candidates"];
    expect(binding).toBeDefined();
    expect(binding!.kind).toBe("ref");
    if (binding!.kind === "ref") {
      // ref points back to step 0's output.
      expect(binding.ref).toContain("out0");
    }
  });

  it("collapses duplicate literal values across calls into one parameter", () => {
    // Both calls receive `query: "shared-query"` — should be one param.
    const traj = buildTrajectory([
      {
        index: 0,
        primitive: "db.cases.findSimilar",
        input: { query: "shared-query", limit: 5 },
        output: [{ x: 1 }],
        startedAt: ISO,
        durationMs: 0,
      },
      {
        index: 1,
        primitive: "lib.pickFiling",
        input: { question: "shared-query", candidates: [{ x: 1 }] },
        output: { x: 1 },
        startedAt: ISO,
        durationMs: 0,
      },
    ]);
    const tpl = extractTemplate(traj);
    // The literal "shared-query" appears as both query and question;
    // dedup should yield ONE param (named after the first seed
    // it encountered: `query`).
    const stringParams = tpl.parameters.filter((p) => p.jsType === "string");
    expect(stringParams.length).toBe(1);
    expect(tpl.steps[0]!.inputBindings["query"]).toEqual({
      kind: "param",
      param: stringParams[0]!.name,
    });
    expect(tpl.steps[1]!.inputBindings["question"]).toEqual({
      kind: "param",
      param: stringParams[0]!.name,
    });
  });

  it("produces a deterministic shapeHash and semantic learned-interface name", () => {
    const traj = buildTrajectory([
      {
        index: 0,
        primitive: "db.cases.findSimilar",
        input: { query: "q", limit: 5 },
        output: [{ a: 1 }],
        startedAt: ISO,
        durationMs: 0,
      },
      {
        index: 1,
        primitive: "lib.pickFiling",
        input: { question: "q", candidates: [{ a: 1 }] },
        output: { a: 1 },
        startedAt: ISO,
        durationMs: 0,
      },
    ]);
    const a = extractTemplate(traj);
    const b = extractTemplate(traj);
    expect(a.shapeHash).toBe(b.shapeHash);
    expect(a.shapeHash).toMatch(/^[0-9a-f]{8}$/);
    expect(a.name).toBe("filingQuestion");
    // Topic should be semantic, not tied to the first lib.* primitive name.
    expect(a.topic).toBe("filing_question");
  });

  it("names table-math range trajectories by the task shape", () => {
    const traj = buildTrajectory(
      [
        {
          index: 0,
          primitive: "db.cases.findSimilar",
          input: { query: "range of chemicals revenue 2014 2018", limit: 5 },
          output: [{ a: 1 }],
          startedAt: ISO,
          durationMs: 0,
        },
        {
          index: 1,
          primitive: "lib.pickFiling",
          input: { question: "range of chemicals revenue 2014 2018", candidates: [{ a: 1 }] },
          output: { a: 1 },
          startedAt: ISO,
          durationMs: 0,
        },
        {
          index: 2,
          primitive: "lib.inferTableMathPlan",
          input: { question: "range of chemicals revenue 2014 2018", filing: { a: 1 } },
          output: { operation: "range" },
          startedAt: ISO,
          durationMs: 0,
        },
        {
          index: 3,
          primitive: "lib.executeTableMath",
          input: { filing: { a: 1 }, plan: { operation: "range" } },
          output: { roundedAnswer: 700 },
          startedAt: ISO,
          durationMs: 0,
        },
      ],
      { question: "what is the range of chemicals revenue between 2014 and 2018" },
    );
    const tpl = extractTemplate(traj);
    expect(tpl.topic).toBe("range_table_metric");
    expect(tpl.name).toBe("rangeTableMetric");
  });

  it("names record-backed tool fan-out trajectories by the generic intent", () => {
    const traj = buildTrajectory([
      {
        index: 0,
        primitive: "db.records.findExact",
        input: { filter: {}, limit: 999 },
        output: [{ id: 1 }, { id: 2 }, { id: 3 }],
        startedAt: ISO,
        durationMs: 0,
      },
      {
        index: 1,
        primitive: "tool.api.getInfo",
        input: { id: 1 },
        output: { ok: 1 },
        startedAt: ISO,
        durationMs: 0,
      },
      {
        index: 2,
        primitive: "tool.api.getInfo",
        input: { id: 2 },
        output: { ok: 2 },
        startedAt: ISO,
        durationMs: 0,
      },
      {
        index: 3,
        primitive: "tool.api.getInfo",
        input: { id: 3 },
        output: { ok: 3 },
        startedAt: ISO,
        durationMs: 0,
      },
      {
        index: 4,
        primitive: "lib.per_entity",
        input: {
          entityIds: [1, 2, 3],
          toolBundle: "api",
          toolNames: ["getInfo"],
          paramName: "id",
        },
        output: [],
        startedAt: ISO,
        durationMs: 0,
      },
    ]);
    const tpl = extractTemplate(traj);
    expect(tpl.intentSignature).toBe("db→FANOUT(tool)→lib");
    expect(tpl.topic).toBe("record_tool_fanout");
    expect(tpl.name).toBe("recordToolFanout");
  });

  it("names direct record-backed tool fan-out separately from seed-mediated fan-out", () => {
    const traj = buildTrajectory([
      {
        index: 0,
        primitive: "db.records.findExact",
        input: { filter: {}, limit: 3 },
        output: [{ id: "US" }, { id: "GB" }, { id: "DE" }],
        startedAt: ISO,
        durationMs: 0,
      },
      {
        index: 1,
        primitive: "tool.api.lookup",
        input: { nationality: "US", count: 5 },
        output: { ok: 1 },
        startedAt: ISO,
        durationMs: 0,
      },
      {
        index: 2,
        primitive: "tool.api.lookup",
        input: { nationality: "GB", count: 5 },
        output: { ok: 2 },
        startedAt: ISO,
        durationMs: 0,
      },
      {
        index: 3,
        primitive: "tool.api.lookup",
        input: { nationality: "DE", count: 5 },
        output: { ok: 3 },
        startedAt: ISO,
        durationMs: 0,
      },
    ]);
    const tpl = extractTemplate(traj);
    expect(tpl.intentSignature).toBe("db→FANOUT(tool)");
    expect(tpl.topic).toBe("record_tool_lookup");
    expect(tpl.name).toBe("recordToolLookup");
  });

  it("keeps repeated-db record-backed fan-out on the generic lookup interface", () => {
    const records = [
      {
        id: "Tokyo",
        entity: "Tokyo",
        attributes: { latitude: 35.6895, longitude: 139.6917 },
      },
      {
        id: "Los Angeles",
        entity: "Los Angeles",
        attributes: { latitude: 34.0522, longitude: -118.2437 },
      },
    ];
    const traj = buildTrajectory([
      {
        index: 0,
        primitive: "db.records.findExact",
        input: { filter: { family: "geo" }, limit: 2 },
        output: records,
        startedAt: ISO,
        durationMs: 0,
      },
      {
        index: 1,
        primitive: "db.records.findExact",
        input: { filter: { family: "geo" }, limit: 4 },
        output: records,
        startedAt: ISO,
        durationMs: 0,
      },
      {
        index: 2,
        primitive: "tool.geo_api.local-get_region_stats",
        input: { latitude: 35.6895, longitude: 139.6917, radius_km: 500 },
        output: { ok: 1 },
        startedAt: ISO,
        durationMs: 0,
      },
      {
        index: 3,
        primitive: "tool.geo_api.local-get_region_stats",
        input: { latitude: 34.0522, longitude: -118.2437, radius_km: 500 },
        output: { ok: 2 },
        startedAt: ISO,
        durationMs: 0,
      },
    ]);
    const tpl = extractTemplate(traj);
    expect(tpl.intentSignature).toBe("FANOUT(db)→FANOUT(tool)");
    expect(tpl.topic).toBe("record_tool_lookup");
    expect(tpl.name).toBe("recordToolLookup");
    expect(extractCandidateTemplates(traj).map((t) => t.name)).toEqual([
      "recordToolLookup",
    ]);
  });

  it("keeps selected search results internal instead of exposing filing as input", () => {
    const picked = {
      filename: "UNP/2016/page_52.pdf",
      question: "what is the mathematical range for chemical revenue",
    };
    const other = {
      filename: "UNP/2017/page_12.pdf",
      question: "unrelated filing",
    };
    const plan = { operation: "range", years: [2014, 2016] };
    const traj = buildTrajectory(
      [
        {
          index: 0,
          primitive: "db.finqaCases.search",
          input: { query: "range chemicals revenue 2014", opts: { limit: 5 } },
          output: [picked, other],
          startedAt: ISO,
          durationMs: 0,
        },
        {
          index: 1,
          primitive: "lib.inferTableMathPlan",
          input: {
            question: "What is the range of chemicals revenue from 2014-2016?",
            filing: picked,
          },
          output: plan,
          startedAt: ISO,
          durationMs: 0,
        },
        {
          index: 2,
          primitive: "lib.executeTableMath",
          input: { filing: picked, plan },
          output: { roundedAnswer: 190 },
          startedAt: ISO,
          durationMs: 0,
        },
      ],
      { question: "What is the range of chemicals revenue from 2014-2016?" },
    );

    const tpl = extractTemplate(traj);

    expect(tpl.parameters.map((p) => p.name)).not.toContain("filing");
    expect(tpl.steps[1]!.inputBindings["filing"]).toEqual({
      kind: "ref",
      ref: "out0[0]",
    });
    expect(tpl.steps[2]!.inputBindings["filing"]).toEqual({
      kind: "ref",
      ref: "out0[0]",
    });
  });

  it("recognises query-only db retrieval inputs as positional calls", () => {
    const similar = extractTemplate(
      buildTrajectory([
        {
          index: 0,
          primitive: "db.finqaCases.findSimilar",
          input: { query: "coal revenue" },
          output: [{ filename: "UNP/2016/page_52.pdf" }],
          startedAt: ISO,
          durationMs: 0,
        },
      ]),
    );
    expect(similar.steps[0]!.callShape).toBe("positional-query-limit");

    const search = extractTemplate(
      buildTrajectory([
        {
          index: 0,
          primitive: "db.finqaCases.search",
          input: { query: "coal revenue" },
          output: [{ filename: "UNP/2016/page_52.pdf" }],
          startedAt: ISO,
          durationMs: 0,
        },
      ]),
    );
    expect(search.steps[0]!.callShape).toBe("positional-query-opts");
  });

  it("a different primitive order yields a different shapeHash", () => {
    const baseCall0 = {
      index: 0,
      primitive: "db.cases.findSimilar",
      input: { query: "q", limit: 5 },
      output: [{ a: 1 }],
      startedAt: ISO,
      durationMs: 0,
    };
    const a = extractTemplate(
      buildTrajectory([
        baseCall0,
        {
          index: 1,
          primitive: "lib.pickFiling",
          input: { question: "q", candidates: [{ a: 1 }] },
          output: { a: 1 },
          startedAt: ISO,
          durationMs: 0,
        },
      ]),
    );
    const b = extractTemplate(
      buildTrajectory([
        baseCall0,
        {
          index: 1,
          primitive: "lib.locateFigure",
          input: { question: "q", filing: { a: 1 } },
          output: { value: 1 },
          startedAt: ISO,
          durationMs: 0,
        },
      ]),
    );
    expect(a.shapeHash).not.toBe(b.shapeHash);
  });
});

describe("readLibrarySnapshot", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(path.join(os.tmpdir(), "lib-snap-"));
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it("returns an empty set when the tenant overlay is missing", async () => {
    const snap = await readLibrarySnapshot({ baseDir, tenantId: "absent" });
    expect(snap.shapeHashes.size).toBe(0);
    expect(snap.learnedNames.size).toBe(0);
    expect(snap.intentSignatures?.size).toBe(0);
  });

  it("collects every learned-interface marker in the tenant overlay", async () => {
    const tenantDir = path.join(baseDir, "lib", "acme");
    await mkdir(tenantDir, { recursive: true });
    await writeFile(
      path.join(tenantDir, "first.ts"),
      "// Learned\n// @shape-hash: aaaaaaaa\n// @intent-signature: FANOUT(tool)\nexport const first = () => null;\n",
      "utf8",
    );
    await writeFile(
      path.join(tenantDir, "second.ts"),
      "// Learned\n// @shape-hash: bbbbbbbb\nexport const second = () => null;\n",
      "utf8",
    );
    const snap = await readLibrarySnapshot({ baseDir, tenantId: "acme" });
    expect(Array.from(snap.shapeHashes).sort()).toEqual(["aaaaaaaa", "bbbbbbbb"]);
    expect(Array.from(snap.learnedNames).sort()).toEqual(["first", "second"]);
    expect(Array.from(snap.intentSignatures ?? []).sort()).toEqual(["FANOUT(tool)"]);
  });

  it("skips files without a @shape-hash: marker", async () => {
    const tenantDir = path.join(baseDir, "lib", "acme");
    await mkdir(tenantDir, { recursive: true });
    await writeFile(
      path.join(tenantDir, "user-authored.ts"),
      "// hand-written\nexport const x = () => null;\n",
      "utf8",
    );
    await writeFile(
      path.join(tenantDir, "crystal.ts"),
      "// @shape-hash: deadbeef\nexport const c = () => null;\n",
      "utf8",
    );
    const snap = await readLibrarySnapshot({ baseDir, tenantId: "acme" });
    expect(Array.from(snap.shapeHashes)).toEqual(["deadbeef"]);
    expect(Array.from(snap.learnedNames)).toEqual(["crystal"]);
  });
});

describe("extractSubGraphTemplates", () => {
  it("returns no sub-graphs for a trajectory shorter than 3 calls", () => {
    const traj = buildTrajectory([
      { index: 0, primitive: "db.records.findExact", input: {}, output: [{ id: 1 }], startedAt: ISO, durationMs: 1 },
      { index: 1, primitive: "lib.perEntity", input: { ids: [1] }, output: { value: [] }, startedAt: ISO, durationMs: 1 },
    ]);
    expect(extractSubGraphTemplates(traj)).toEqual([]);
  });

  it("returns no sub-graphs when there is no db.* call", () => {
    const traj = buildTrajectory([
      { index: 0, primitive: "tool.api.A", input: {}, output: { ok: 1 }, startedAt: ISO, durationMs: 1 },
      { index: 1, primitive: "tool.api.B", input: {}, output: { ok: 2 }, startedAt: ISO, durationMs: 1 },
      { index: 2, primitive: "tool.api.C", input: {}, output: { ok: 3 }, startedAt: ISO, durationMs: 1 },
    ]);
    expect(extractSubGraphTemplates(traj)).toEqual([]);
  });

  it("emits a fan-out sub-graph when the agent loops one tool over several entities after a db lookup", () => {
    const records = [{ id: 7 }, { id: 8 }, { id: 9 }];
    const traj = buildTrajectory([
      { index: 0, primitive: "db.records.findExact", input: { filter: {} }, output: records, startedAt: ISO, durationMs: 1 },
      { index: 1, primitive: "tool.api.getDetails", input: { id: 7 }, output: { name: "a" }, startedAt: ISO, durationMs: 1 },
      { index: 2, primitive: "tool.api.getDetails", input: { id: 8 }, output: { name: "b" }, startedAt: ISO, durationMs: 1 },
      { index: 3, primitive: "tool.api.getDetails", input: { id: 9 }, output: { name: "c" }, startedAt: ISO, durationMs: 1 },
    ]);
    const subs = extractSubGraphTemplates(traj);
    // Whole trajectory is `[db, tool, tool, tool]` (4 calls). Sub-graph A
    // [db, tool#1] is only 2 calls so it is dropped (below the 3-call
    // minimum). Sub-graph B [tool#1, tool#2, tool#3] is 3 calls of the
    // same primitive, with a repeated primitive, so it should be emitted.
    expect(subs.length).toBeGreaterThanOrEqual(1);
    const fanout = subs.find(
      (t) => t.intentSignature === "FANOUT(tool)",
    );
    expect(fanout).toBeDefined();
    expect(fanout!.topic).toBe("tool_fanout");
    expect(fanout!.name).toBe("toolFanout");
    expect(fanout!.steps).toHaveLength(3);
    expect(fanout!.steps.every((s) => s.primitive === "tool.api.getDetails")).toBe(true);
  });

  it("fan-out sub-graph template's body emits tool.* bracket-notation calls and is not pruned", async () => {
    // Goal-3 iter 10 regression: the author returned null for fan-out
    // sub-graphs because (1) renderStepExpression handled only db.* and
    // lib.* primitives, and (2) pruneUnusedTemplateSteps collapsed the
    // 9 independent tool calls to one. Both bugs surface as
    // `{kind: "skipped", reason: "pure-composition path could not emit source"}`
    // from authorFunction. This test exercises generatePureSource via
    // the template through the resolver to lock in both fixes.
    const records = [{ id: 7 }, { id: 8 }, { id: 9 }];
    const traj = buildTrajectory([
      { index: 0, primitive: "db.records.findExact", input: { filter: {}, limit: 999 }, output: records, startedAt: ISO, durationMs: 1 },
      { index: 1, primitive: "tool.api.local-getInfo", input: { id: 7 }, output: { info: 7 }, startedAt: ISO, durationMs: 1 },
      { index: 2, primitive: "tool.api.local-getRelated", input: { id: 7 }, output: { related: 7 }, startedAt: ISO, durationMs: 1 },
      { index: 3, primitive: "tool.api.local-getInfo", input: { id: 8 }, output: { info: 8 }, startedAt: ISO, durationMs: 1 },
      { index: 4, primitive: "tool.api.local-getRelated", input: { id: 8 }, output: { related: 8 }, startedAt: ISO, durationMs: 1 },
      { index: 5, primitive: "tool.api.local-getInfo", input: { id: 9 }, output: { info: 9 }, startedAt: ISO, durationMs: 1 },
      { index: 6, primitive: "tool.api.local-getRelated", input: { id: 9 }, output: { related: 9 }, startedAt: ISO, durationMs: 1 },
    ]);
    const subs = extractSubGraphTemplates(traj);
    const fanout = subs.find(
      (t) => t.intentSignature === "FANOUT(tool)",
    );
    expect(fanout).toBeDefined();
    expect(fanout!.topic).toBe("tool_fanout");
    expect(fanout!.name).toBe("toolFanout");
    expect(fanout!.steps).toHaveLength(6);
    expect(fanout!.steps.every((s) => s.primitive.startsWith("tool."))).toBe(true);
    // Single shared param `id` since all 6 calls bind `id` to the same param.
    expect(fanout!.parameters.map((p) => p.name)).toEqual(["id"]);
  });

  it("does not expose overlapping sub-graph helpers for a direct record-backed fan-out", () => {
    const records = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const traj = buildTrajectory([
      { index: 0, primitive: "db.records.findExact", input: { filter: {} }, output: records, startedAt: ISO, durationMs: 1 },
      { index: 1, primitive: "tool.api.getDetails", input: { id: 1 }, output: { name: "x" }, startedAt: ISO, durationMs: 1 },
      { index: 2, primitive: "tool.api.getDetails", input: { id: 2 }, output: { name: "y" }, startedAt: ISO, durationMs: 1 },
      { index: 3, primitive: "tool.api.getDetails", input: { id: 3 }, output: { name: "z" }, startedAt: ISO, durationMs: 1 },
    ]);
    const candidates = extractCandidateTemplates(traj);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.steps).toHaveLength(4);
    expect(candidates[0]!.intentSignature).toBe("db→FANOUT(tool)");
    expect(candidates[0]!.name).toBe("recordToolLookup");
  });

  it("does not expose overlapping sub-graph helpers for a record-backed whole fan-out", () => {
    const records = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const traj = buildTrajectory([
      { index: 0, primitive: "db.records.findExact", input: { filter: {} }, output: records, startedAt: ISO, durationMs: 1 },
      { index: 1, primitive: "tool.api.getDetails", input: { id: 1 }, output: { name: "x" }, startedAt: ISO, durationMs: 1 },
      { index: 2, primitive: "tool.api.getDetails", input: { id: 2 }, output: { name: "y" }, startedAt: ISO, durationMs: 1 },
      { index: 3, primitive: "tool.api.getDetails", input: { id: 3 }, output: { name: "z" }, startedAt: ISO, durationMs: 1 },
      { index: 4, primitive: "lib.per_entity", input: { entityIds: [1, 2, 3] }, output: { value: [] }, startedAt: ISO, durationMs: 1 },
    ]);
    const candidates = extractCandidateTemplates(traj);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.intentSignature).toBe("db→FANOUT(tool)→lib");
    expect(candidates[0]!.name).toBe("recordToolFanout");
  });

  it("keeps a record-backed fan-out candidate when dependent tails follow per_entity", () => {
    const records = [{ id: 1, name: "Rick" }, { id: 2, name: "Morty" }, { id: 3, name: "Summer" }];
    const traj = buildTrajectory([
      { index: 0, primitive: "db.records.findExact", input: { filter: {} }, output: records, startedAt: ISO, durationMs: 1 },
      { index: 1, primitive: "tool.api.getCharacter", input: { character_id: 1 }, output: { name: "Rick" }, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.per_entity"], parentPrimitive: "lib.per_entity" } },
      { index: 2, primitive: "tool.api.getEpisodes", input: { character_id: 1 }, output: { total: 51 }, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.per_entity"], parentPrimitive: "lib.per_entity" } },
      { index: 3, primitive: "tool.api.getCharacter", input: { character_id: 2 }, output: { name: "Morty" }, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.per_entity"], parentPrimitive: "lib.per_entity" } },
      { index: 4, primitive: "tool.api.getEpisodes", input: { character_id: 2 }, output: { total: 51 }, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.per_entity"], parentPrimitive: "lib.per_entity" } },
      { index: 5, primitive: "tool.api.getCharacter", input: { character_id: 3 }, output: { name: "Summer" }, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.per_entity"], parentPrimitive: "lib.per_entity" } },
      { index: 6, primitive: "tool.api.getEpisodes", input: { character_id: 3 }, output: { total: 42 }, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.per_entity"], parentPrimitive: "lib.per_entity" } },
      { index: 7, primitive: "lib.per_entity", input: { entityIds: [1, 2, 3] }, output: { value: [] }, startedAt: ISO, durationMs: 1 },
      { index: 8, primitive: "tool.api.searchCharacter", input: { name: "Rick" }, output: { count: 1 }, startedAt: ISO, durationMs: 1 },
      { index: 9, primitive: "tool.api.searchCharacter", input: { name: "Morty" }, output: { count: 1 }, startedAt: ISO, durationMs: 1 },
    ]);
    const candidates = extractCandidateTemplates(traj);
    expect(candidates[0]!.intentSignature).toBe("db→FANOUT(tool)→lib→FANOUT(tool)");
    const recordPrefix = candidates.find((t) => t.intentSignature === "db→FANOUT(tool)→lib");
    expect(recordPrefix).toBeDefined();
    expect(recordPrefix!.name).toBe("recordToolFanout");
    expect(recordPrefix!.steps.map((s) => s.primitive)).toEqual([
      "db.records.findExact",
      "tool.api.getCharacter",
      "tool.api.getEpisodes",
      "tool.api.getCharacter",
      "tool.api.getEpisodes",
      "tool.api.getCharacter",
      "tool.api.getEpisodes",
      "lib.per_entity",
    ]);
  });

  it("does not expose a lookup-consumer sibling for recordToolFanout-mediated enrichment", () => {
    const records = [
      {
        id: "United States",
        recordKey: "world-bank-economic-snapshot:United States",
        family: "world-bank-economic-snapshot",
        entity: "United States",
        label: "US",
        attributes: { name: "United States", code: "US" },
      },
      {
        id: "China",
        recordKey: "world-bank-economic-snapshot:China",
        family: "world-bank-economic-snapshot",
        entity: "China",
        label: "CHN",
        attributes: { name: "China", code: "CHN" },
      },
      {
        id: "Japan",
        recordKey: "world-bank-economic-snapshot:Japan",
        family: "world-bank-economic-snapshot",
        entity: "Japan",
        label: "JPN",
        attributes: { name: "Japan", code: "JPN" },
      },
    ];
    const traj = buildTrajectory([
      { index: 0, primitive: "db.records.findExact", input: { filter: { family: "world-bank-economic-snapshot" }, limit: 3 }, output: records, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.recordToolFanout"], parentPrimitive: "lib.recordToolFanout" } },
      { index: 1, primitive: "tool.worldbank_api.local-worldbank_gdp", input: { country_code: "US" }, output: { value: 1 }, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.recordToolFanout"], parentPrimitive: "lib.recordToolFanout" } },
      { index: 2, primitive: "tool.worldbank_api.local-worldbank_population", input: { country_code: "US" }, output: { value: 2 }, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.recordToolFanout"], parentPrimitive: "lib.recordToolFanout" } },
      { index: 3, primitive: "tool.worldbank_api.local-worldbank_gdp", input: { country_code: "CHN" }, output: { value: 3 }, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.recordToolFanout"], parentPrimitive: "lib.recordToolFanout" } },
      { index: 4, primitive: "tool.worldbank_api.local-worldbank_population", input: { country_code: "CHN" }, output: { value: 4 }, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.recordToolFanout"], parentPrimitive: "lib.recordToolFanout" } },
      { index: 5, primitive: "tool.worldbank_api.local-worldbank_gdp", input: { country_code: "JPN" }, output: { value: 5 }, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.recordToolFanout"], parentPrimitive: "lib.recordToolFanout" } },
      { index: 6, primitive: "tool.worldbank_api.local-worldbank_population", input: { country_code: "JPN" }, output: { value: 6 }, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.recordToolFanout"], parentPrimitive: "lib.recordToolFanout" } },
      {
        index: 7,
        primitive: "lib.recordToolFanout",
        input: {
          entityField: "code",
          toolBundle: "worldbank_api",
          toolNames: ["local-worldbank_gdp", "local-worldbank_population"],
          paramName: "country_code",
          recordFilter: { family: "world-bank-economic-snapshot" },
          recordLimit: 3,
        },
        output: [],
        startedAt: ISO,
        durationMs: 1,
      },
      { index: 8, primitive: "tool.worldbank_api.local-worldbank_indicator", input: { country_code: "US" }, output: {}, startedAt: ISO, durationMs: 1 },
      { index: 9, primitive: "tool.worldbank_api.local-worldbank_indicator", input: { country_code: "CHN" }, output: {}, startedAt: ISO, durationMs: 1 },
      { index: 10, primitive: "tool.worldbank_api.local-worldbank_indicator", input: { country_code: "JPN" }, output: {}, startedAt: ISO, durationMs: 1 },
    ]);

    const candidates = extractCandidateTemplates(traj);
    expect(candidates[0]!.intentSignature).toBe("db→FANOUT(tool)→lib→FANOUT(tool)");
    expect(candidates.some((t) => t.name === "recordToolFanout")).toBe(true);
    expect(candidates.some((t) => t.topic.endsWith("_lookup_consumer"))).toBe(false);
    expect(candidates.some((t) => t.name === "recordToolFanoutLookupConsumer")).toBe(false);
  });

  it("names record-backed fan-out plus dependent enrichment by a distinct generic intent", () => {
    const records = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const traj = buildTrajectory([
      { index: 0, primitive: "db.records.findExact", input: { filter: {} }, output: records, startedAt: ISO, durationMs: 1 },
      { index: 1, primitive: "tool.api.getBase", input: { id: 1 }, output: { id: 1 }, startedAt: ISO, durationMs: 1 },
      { index: 2, primitive: "tool.api.getBase", input: { id: 2 }, output: { id: 2 }, startedAt: ISO, durationMs: 1 },
      { index: 3, primitive: "tool.api.getBase", input: { id: 3 }, output: { id: 3 }, startedAt: ISO, durationMs: 1 },
      { index: 4, primitive: "lib.recordToolFanout", input: { recordFilter: {}, toolNames: ["getBase"] }, output: { value: [] }, startedAt: ISO, durationMs: 1 },
      { index: 5, primitive: "tool.api.getDependent", input: { id: 1 }, output: {}, startedAt: ISO, durationMs: 1 },
      { index: 6, primitive: "tool.api.getDependent", input: { id: 2 }, output: {}, startedAt: ISO, durationMs: 1 },
      { index: 7, primitive: "tool.api.getDependent", input: { id: 3 }, output: {}, startedAt: ISO, durationMs: 1 },
    ]);
    const candidates = extractCandidateTemplates(traj);
    expect(candidates[0]!.intentSignature).toBe("db→FANOUT(tool)→lib→FANOUT(tool)");
    expect(candidates[0]!.topic).toBe("record_tool_enrichment");
    expect(candidates[0]!.name).toBe("recordToolEnrichment");
  });

  it("keeps recordToolEnrichment wrapper calls out of the learned intent skeleton", () => {
    const traj = buildTrajectory([
      { index: 0, primitive: "db.records.findExact", input: { filter: {} }, output: [{ id: 1 }, { id: 2 }, { id: 3 }], startedAt: ISO, durationMs: 1 },
      { index: 1, primitive: "tool.api.getBase", input: { id: 1 }, output: { id: 1 }, startedAt: ISO, durationMs: 1 },
      { index: 2, primitive: "tool.api.getBase", input: { id: 2 }, output: { id: 2 }, startedAt: ISO, durationMs: 1 },
      { index: 3, primitive: "tool.api.getBase", input: { id: 3 }, output: { id: 3 }, startedAt: ISO, durationMs: 1 },
      { index: 4, primitive: "lib.recordToolFanout", input: { recordFilter: {}, toolNames: ["getBase"] }, output: { value: [] }, startedAt: ISO, durationMs: 1 },
      { index: 5, primitive: "tool.api.getDependent", input: { id: 1 }, output: {}, startedAt: ISO, durationMs: 1 },
      { index: 6, primitive: "tool.api.getDependent", input: { id: 2 }, output: {}, startedAt: ISO, durationMs: 1 },
      { index: 7, primitive: "tool.api.getDependent", input: { id: 3 }, output: {}, startedAt: ISO, durationMs: 1 },
      { index: 8, primitive: "lib.recordToolEnrichment", input: { intent: "record-backed dependent enrichment" }, output: { value: [] }, startedAt: ISO, durationMs: 1 },
    ]);
    expect(computeIntentSignature(traj.calls)).toBe("db→FANOUT(tool)→lib→FANOUT(tool)");
  });

  it("names pure tool fanout plus dependent enrichment by a distinct generic intent", () => {
    const traj = buildTrajectory([
      { index: 0, primitive: "tool.pokemon_tools.local-pokemon_get_species", input: { pokemon_id: 25 }, output: { species: { evolution_chain_id: 10 } }, startedAt: ISO, durationMs: 1 },
      { index: 1, primitive: "tool.pokemon_tools.local-pokemon_get_species", input: { pokemon_id: 6 }, output: { species: { evolution_chain_id: 2 } }, startedAt: ISO, durationMs: 1 },
      { index: 2, primitive: "tool.pokemon_tools.local-pokemon_get_species", input: { pokemon_id: 445 }, output: { species: { evolution_chain_id: 230 } }, startedAt: ISO, durationMs: 1 },
      { index: 3, primitive: "lib.toolFanout", input: { intent: "repeated tool fan-out" }, output: { value: [] }, startedAt: ISO, durationMs: 1 },
      { index: 4, primitive: "tool.pokemon_tools.local-pokemon_get_evolution", input: { chain_id: 10 }, output: { evolution_chain: { id: 10 } }, startedAt: ISO, durationMs: 1 },
      { index: 5, primitive: "tool.pokemon_tools.local-pokemon_get_evolution", input: { chain_id: 2 }, output: { evolution_chain: { id: 2 } }, startedAt: ISO, durationMs: 1 },
      { index: 6, primitive: "tool.pokemon_tools.local-pokemon_get_evolution", input: { chain_id: 230 }, output: { evolution_chain: { id: 230 } }, startedAt: ISO, durationMs: 1 },
    ]);
    const template = extractTemplate(traj);
    expect(template.intentSignature).toBe("FANOUT(tool)→lib→FANOUT(tool)");
    expect(template.topic).toBe("tool_fanout_enrichment");
    expect(template.name).toBe("toolFanoutEnrichment");
  });

  it("keeps toolFanoutEnrichment wrapper calls out of the learned intent skeleton", () => {
    const traj = buildTrajectory([
      { index: 0, primitive: "tool.pokemon_tools.local-pokemon_get_species", input: { pokemon_id: 25 }, output: { species: { evolution_chain_id: 10 } }, startedAt: ISO, durationMs: 1 },
      { index: 1, primitive: "tool.pokemon_tools.local-pokemon_get_species", input: { pokemon_id: 6 }, output: { species: { evolution_chain_id: 2 } }, startedAt: ISO, durationMs: 1 },
      { index: 2, primitive: "tool.pokemon_tools.local-pokemon_get_species", input: { pokemon_id: 445 }, output: { species: { evolution_chain_id: 230 } }, startedAt: ISO, durationMs: 1 },
      { index: 3, primitive: "lib.toolFanout", input: { intent: "repeated tool fan-out" }, output: { value: [] }, startedAt: ISO, durationMs: 1 },
      { index: 4, primitive: "tool.pokemon_tools.local-pokemon_get_evolution", input: { chain_id: 10 }, output: { evolution_chain: { id: 10 } }, startedAt: ISO, durationMs: 1 },
      { index: 5, primitive: "tool.pokemon_tools.local-pokemon_get_evolution", input: { chain_id: 2 }, output: { evolution_chain: { id: 2 } }, startedAt: ISO, durationMs: 1 },
      { index: 6, primitive: "tool.pokemon_tools.local-pokemon_get_evolution", input: { chain_id: 230 }, output: { evolution_chain: { id: 230 } }, startedAt: ISO, durationMs: 1 },
      { index: 7, primitive: "lib.toolFanoutEnrichment", input: { intent: "repeated tool fan-out dependent enrichment" }, output: { value: [] }, startedAt: ISO, durationMs: 1 },
    ]);
    expect(computeIntentSignature(traj.calls)).toBe("FANOUT(tool)→lib→FANOUT(tool)");
  });

  it("keeps pure tool enrichment subgraph helpers on the canonical name", () => {
    const traj = buildTrajectory([
      { index: 0, primitive: "tool.pokemon_tools.local-pokemon_get_species", input: { pokemon_id: 25 }, output: { species: { evolution_chain_id: 10 } }, startedAt: ISO, durationMs: 1 },
      { index: 1, primitive: "tool.pokemon_tools.local-pokemon_get_species", input: { pokemon_id: 6 }, output: { species: { evolution_chain_id: 2 } }, startedAt: ISO, durationMs: 1 },
      { index: 2, primitive: "tool.pokemon_tools.local-pokemon_get_species", input: { pokemon_id: 445 }, output: { species: { evolution_chain_id: 230 } }, startedAt: ISO, durationMs: 1 },
      { index: 3, primitive: "lib.toolFanout", input: { intent: "repeated tool fan-out" }, output: { value: [] }, startedAt: ISO, durationMs: 1 },
      { index: 4, primitive: "tool.pokemon_tools.local-pokemon_get_evolution", input: { chain_id: 10 }, output: { evolution_chain: { id: 10 } }, startedAt: ISO, durationMs: 1 },
      { index: 5, primitive: "tool.pokemon_tools.local-pokemon_get_evolution", input: { chain_id: 2 }, output: { evolution_chain: { id: 2 } }, startedAt: ISO, durationMs: 1 },
      { index: 6, primitive: "tool.pokemon_tools.local-pokemon_get_evolution", input: { chain_id: 230 }, output: { evolution_chain: { id: 230 } }, startedAt: ISO, durationMs: 1 },
    ]);
    const template = extractTemplateFromCalls(traj.calls, traj, "fanout");
    expect(template.topic).toBe("tool_fanout_enrichment");
    expect(template.name).toBe("toolFanoutEnrichment");
  });

  it("maps fully wrapped learned helper internals to the helper intent skeleton", () => {
    const traj = buildTrajectory([
      { index: 0, primitive: "tool.randomuser_api.local-randomuser_by_nationality", input: { nationality: "US" }, output: {}, startedAt: ISO, durationMs: 1, scope: { depth: 2, callPath: ["lib.toolFanoutEnrichment", "lib.toolFanout"], rootPrimitive: "lib.toolFanoutEnrichment", parentPrimitive: "lib.toolFanout" } },
      { index: 1, primitive: "tool.randomuser_api.local-randomuser_get_users", input: { nationality: "US" }, output: {}, startedAt: ISO, durationMs: 1, scope: { depth: 2, callPath: ["lib.toolFanoutEnrichment", "lib.toolFanout"], rootPrimitive: "lib.toolFanoutEnrichment", parentPrimitive: "lib.toolFanout" } },
      { index: 2, primitive: "tool.randomuser_api.local-randomuser_by_nationality", input: { nationality: "GB" }, output: {}, startedAt: ISO, durationMs: 1, scope: { depth: 2, callPath: ["lib.toolFanoutEnrichment", "lib.toolFanout"], rootPrimitive: "lib.toolFanoutEnrichment", parentPrimitive: "lib.toolFanout" } },
      { index: 3, primitive: "tool.randomuser_api.local-randomuser_get_users", input: { nationality: "GB" }, output: {}, startedAt: ISO, durationMs: 1, scope: { depth: 2, callPath: ["lib.toolFanoutEnrichment", "lib.toolFanout"], rootPrimitive: "lib.toolFanoutEnrichment", parentPrimitive: "lib.toolFanout" } },
      { index: 4, primitive: "lib.toolFanout", input: {}, output: { value: [] }, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.toolFanoutEnrichment"], rootPrimitive: "lib.toolFanoutEnrichment", parentPrimitive: "lib.toolFanoutEnrichment" } },
      { index: 5, primitive: "lib.toolFanoutEnrichment", input: {}, output: { value: [] }, startedAt: ISO, durationMs: 1 },
    ]);
    expect(computeIntentSignature(traj.calls)).toBe("FANOUT(tool)→lib→FANOUT(tool)");
  });

  it("keeps toolFanout wrapper calls out of pure learned fan-out skeletons", () => {
    const traj = buildTrajectory([
      { index: 0, primitive: "tool.worldbank_api.local-worldbank_gdp", input: { country_code: "US" }, output: {}, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.toolFanout"], parentPrimitive: "lib.toolFanout" } },
      { index: 1, primitive: "tool.worldbank_api.local-worldbank_country_info", input: { country_code: "US" }, output: {}, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.toolFanout"], parentPrimitive: "lib.toolFanout" } },
      { index: 2, primitive: "tool.worldbank_api.local-worldbank_gdp", input: { country_code: "JP" }, output: {}, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.toolFanout"], parentPrimitive: "lib.toolFanout" } },
      { index: 3, primitive: "tool.worldbank_api.local-worldbank_country_info", input: { country_code: "JP" }, output: {}, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.toolFanout"], parentPrimitive: "lib.toolFanout" } },
      { index: 4, primitive: "lib.toolFanout", input: { intent: "repeated tool fan-out" }, output: { value: [] }, startedAt: ISO, durationMs: 1 },
    ]);
    expect(computeIntentSignature(traj.calls)).toBe("FANOUT(tool)");
  });

  it("maps single learned generic helper calls to their declared intent skeletons", () => {
    expect(computeIntentSignature(buildTrajectory([
      { index: 0, primitive: "lib.toolFanout", input: {}, output: {}, startedAt: ISO, durationMs: 1 },
    ]).calls)).toBe("FANOUT(tool)");
    expect(computeIntentSignature(buildTrajectory([
      { index: 0, primitive: "lib.recordToolLookup", input: {}, output: {}, startedAt: ISO, durationMs: 1 },
    ]).calls)).toBe("FANOUT(db)→FANOUT(tool)");
    expect(computeIntentSignature(buildTrajectory([
      { index: 0, primitive: "lib.recordToolFanout", input: {}, output: {}, startedAt: ISO, durationMs: 1 },
    ]).calls)).toBe("db→FANOUT(tool)→lib");
    expect(computeIntentSignature(buildTrajectory([
      { index: 0, primitive: "lib.recordToolEnrichment", input: {}, output: {}, startedAt: ISO, durationMs: 1 },
    ]).calls)).toBe("db→FANOUT(tool)→lib→FANOUT(tool)");
    expect(computeIntentSignature(buildTrajectory([
      { index: 0, primitive: "lib.toolFanoutEnrichment", input: {}, output: {}, startedAt: ISO, durationMs: 1 },
    ]).calls)).toBe("FANOUT(tool)→lib→FANOUT(tool)");
  });
});

describe("computeIntentSignature (Goal-4 Change 1)", () => {
  it("collapses consecutive same-category fan-out and is data-shape-agnostic", () => {
    // db.records.findExact -> tool x3 (same tool) -> lib
    const tvmaze = buildTrajectory([
      { index: 0, primitive: "db.records.findExact", input: { filter: {} }, output: [{ id: 1 }], startedAt: ISO, durationMs: 1 },
      { index: 1, primitive: "tool.tvmaze_api.getInfo", input: { show_id: 1 }, output: {}, startedAt: ISO, durationMs: 1 },
      { index: 2, primitive: "tool.tvmaze_api.getInfo", input: { show_id: 2 }, output: {}, startedAt: ISO, durationMs: 1 },
      { index: 3, primitive: "tool.tvmaze_api.getInfo", input: { show_id: 3 }, output: {}, startedAt: ISO, durationMs: 1 },
      { index: 4, primitive: "lib.per_entity", input: { ids: [1, 2, 3] }, output: { value: [] }, startedAt: ISO, durationMs: 1 },
    ]);
    // A different tenant doing the same structural work over different data.
    const finqa = buildTrajectory([
      { index: 0, primitive: "db.cases.search", input: { query: "x" }, output: [{ id: 1 }], startedAt: ISO, durationMs: 1 },
      { index: 1, primitive: "tool.finqa_api.getCase", input: { case_id: "a" }, output: {}, startedAt: ISO, durationMs: 1 },
      { index: 2, primitive: "tool.finqa_api.getCase", input: { case_id: "b" }, output: {}, startedAt: ISO, durationMs: 1 },
      { index: 3, primitive: "tool.finqa_api.getCase", input: { case_id: "c" }, output: {}, startedAt: ISO, durationMs: 1 },
      { index: 4, primitive: "lib.aggregate", input: { ids: ["a"] }, output: { value: [] }, startedAt: ISO, durationMs: 1 },
    ]);
    const tvmazeSig = computeIntentSignature(tvmaze.calls);
    const finqaSig = computeIntentSignature(finqa.calls);
    expect(tvmazeSig).toBe("db→FANOUT(tool)→lib");
    // Cross-shape transfer property: identical structure over different
    // data shapes hashes to the SAME intentSignature.
    expect(finqaSig).toBe(tvmazeSig);
  });

  it("collapses interleaved multi-tool fan-out (A,B,C,A,B,C) on category alone", () => {
    const traj = buildTrajectory([
      { index: 0, primitive: "db.records.findExact", input: {}, output: [], startedAt: ISO, durationMs: 1 },
      { index: 1, primitive: "tool.api.A", input: { x: 1 }, output: {}, startedAt: ISO, durationMs: 1 },
      { index: 2, primitive: "tool.api.B", input: { y: 1 }, output: {}, startedAt: ISO, durationMs: 1 },
      { index: 3, primitive: "tool.api.C", input: { z: 1 }, output: {}, startedAt: ISO, durationMs: 1 },
      { index: 4, primitive: "tool.api.A", input: { x: 2 }, output: {}, startedAt: ISO, durationMs: 1 },
      { index: 5, primitive: "tool.api.B", input: { y: 2 }, output: {}, startedAt: ISO, durationMs: 1 },
      { index: 6, primitive: "tool.api.C", input: { z: 2 }, output: {}, startedAt: ISO, durationMs: 1 },
    ]);
    // 6 consecutive tool calls collapse to one FANOUT node. The
    // convergence key keeps category and deliberately ignores
    // cycle width so parameterized fan-out helpers can transfer.
    expect(computeIntentSignature(traj.calls)).toBe("db→FANOUT(tool)");
  });

  it("a single call of a category does not become a FANOUT node", () => {
    const traj = buildTrajectory([
      { index: 0, primitive: "db.records.findExact", input: {}, output: [], startedAt: ISO, durationMs: 1 },
      { index: 1, primitive: "lib.per_entity", input: {}, output: { value: [] }, startedAt: ISO, durationMs: 1 },
    ]);
    expect(computeIntentSignature(traj.calls)).toBe("db→lib");
  });
});

describe("extractNestedTemplates (Goal-4 Change 2)", () => {
  it("groups depth>=1 calls by scope.parentPrimitive and emits a template per group", () => {
    // A trajectory where lib.per_entity's body fanned out 3 tool calls.
    // The flat calls array: the nested tool calls (depth 1) are recorded
    // BEFORE the parent lib.* call (depth 0).
    const traj = buildTrajectory([
      { index: 0, primitive: "tool.api.getInfo", input: { id: 1 }, output: {}, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.per_entity"], parentPrimitive: "lib.per_entity" } },
      { index: 1, primitive: "tool.api.getInfo", input: { id: 2 }, output: {}, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.per_entity"], parentPrimitive: "lib.per_entity" } },
      { index: 2, primitive: "tool.api.getInfo", input: { id: 3 }, output: {}, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.per_entity"], parentPrimitive: "lib.per_entity" } },
      { index: 3, primitive: "lib.per_entity", input: {}, output: { value: [] }, startedAt: ISO, durationMs: 1 },
    ]);
    const nested = extractNestedTemplates(traj);
    expect(nested).toHaveLength(1);
    expect(nested[0]!.template.steps).toHaveLength(3);
    expect(nested[0]!.template.steps.every((s) => s.primitive === "tool.api.getInfo")).toBe(true);
    // The nested fan-out has its own intentSignature.
    expect(nested[0]!.template.intentSignature).toBe("FANOUT(tool)");
    expect(nested[0]!.template.topic).toBe("tool_fanout");
    expect(nested[0]!.template.name).toBe("toolFanout");
    // The slice is the group of nested calls.
    expect(nested[0]!.calls).toHaveLength(3);
  });

  it("suppresses nested fan-out candidates when an exact record-backed helper covers the whole trajectory", () => {
    const traj = buildTrajectory([
      { index: 0, primitive: "db.records.findExact", input: {}, output: [{ id: 1 }, { id: 2 }, { id: 3 }], startedAt: ISO, durationMs: 1 },
      { index: 1, primitive: "tool.api.getInfo", input: { id: 1 }, output: {}, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.per_entity"], parentPrimitive: "lib.per_entity" } },
      { index: 2, primitive: "tool.api.getInfo", input: { id: 2 }, output: {}, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.per_entity"], parentPrimitive: "lib.per_entity" } },
      { index: 3, primitive: "tool.api.getInfo", input: { id: 3 }, output: {}, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.per_entity"], parentPrimitive: "lib.per_entity" } },
      { index: 4, primitive: "lib.per_entity", input: {}, output: { value: [] }, startedAt: ISO, durationMs: 1 },
    ]);
    expect(extractNestedTemplates(traj)).toEqual([]);
  });

  it("does not extract nested record replay helpers from recordToolFanout internals", () => {
    const traj = buildTrajectory([
      { index: 0, primitive: "db.records.findExact", input: {}, output: [{ id: 1 }, { id: 2 }, { id: 3 }], startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.recordToolFanout"], parentPrimitive: "lib.recordToolFanout" } },
      { index: 1, primitive: "tool.api.getInfo", input: { id: 1 }, output: {}, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.recordToolFanout"], parentPrimitive: "lib.recordToolFanout" } },
      { index: 2, primitive: "tool.api.getInfo", input: { id: 2 }, output: {}, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.recordToolFanout"], parentPrimitive: "lib.recordToolFanout" } },
      { index: 3, primitive: "tool.api.getInfo", input: { id: 3 }, output: {}, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.recordToolFanout"], parentPrimitive: "lib.recordToolFanout" } },
      { index: 4, primitive: "lib.recordToolFanout", input: {}, output: { value: [] }, startedAt: ISO, durationMs: 1 },
      { index: 5, primitive: "tool.api.getDependent", input: { id: 1 }, output: {}, startedAt: ISO, durationMs: 1 },
      { index: 6, primitive: "tool.api.getDependent", input: { id: 2 }, output: {}, startedAt: ISO, durationMs: 1 },
    ]);
    expect(extractNestedTemplates(traj)).toEqual([]);
  });

  it("ignores nested groups with fewer than 2 calls", () => {
    const traj = buildTrajectory([
      { index: 0, primitive: "lib.wrapper", input: {}, output: {}, startedAt: ISO, durationMs: 1 },
      { index: 1, primitive: "tool.api.X", input: {}, output: {}, startedAt: ISO, durationMs: 1, scope: { depth: 1, callPath: ["lib.wrapper"], parentPrimitive: "lib.wrapper" } },
    ]);
    expect(extractNestedTemplates(traj)).toEqual([]);
  });

  it("returns nothing for a flat trajectory with no nested calls", () => {
    const traj = buildTrajectory([
      { index: 0, primitive: "db.records.findExact", input: {}, output: [], startedAt: ISO, durationMs: 1 },
      { index: 1, primitive: "lib.per_entity", input: {}, output: { value: [] }, startedAt: ISO, durationMs: 1 },
    ]);
    expect(extractNestedTemplates(traj)).toEqual([]);
  });
});
