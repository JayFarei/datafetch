import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { TrajectoryRecord } from "../src/sdk/index.js";
import { authorFunction } from "../src/observer/author.js";
import { extractTemplate, extractTemplateFromCalls } from "../src/observer/template.js";
import type { LibraryResolver } from "../src/sdk/index.js";

const ISO = new Date().toISOString();

function buildIntentTrajectory(): TrajectoryRecord {
  const picked = {
    filename: "UNP/2016/page_52.pdf",
    question: "what is the mathematical range for chemical revenue",
  };
  const other = {
    filename: "UNP/2017/page_12.pdf",
    question: "unrelated filing",
  };
  const plan = { operation: "range", years: [2014, 2016] };

  return {
    id: "traj_intent_shape",
    tenantId: "acme",
    question: "What is the range of chemicals revenue from 2014-2016?",
    mode: "novel",
    createdAt: ISO,
    calls: [
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
  };
}

function buildHydratedRangeTrajectory(): TrajectoryRecord {
  const searchUnit = {
    id: "unit-chemicals",
    caseId: "UNP/2016/page_52.pdf-4",
    text: "chemical revenue 2014 2016",
  };
  const picked = {
    id: "UNP/2016/page_52.pdf-4",
    filename: "UNP/2016/page_52.pdf",
    question: "what is the mathematical range for chemical revenue",
  };
  const plan = { operation: "range", years: [2014, 2016] };

  return {
    id: "traj_hydrated_range",
    tenantId: "acme",
    question: "What is the range of chemicals revenue from 2014-2016?",
    mode: "novel",
    createdAt: ISO,
    calls: [
      {
        index: 0,
        primitive: "db.finqaSearchUnits.findSimilar",
        input: { query: "chemical revenue 2014 2016", limit: 100 },
        output: [searchUnit],
        startedAt: ISO,
        durationMs: 0,
      },
      {
        index: 1,
        primitive: "db.finqaCases.findExact",
        input: { filter: { id: searchUnit.caseId }, limit: 1 },
        output: [picked],
        startedAt: ISO,
        durationMs: 0,
      },
      {
        index: 2,
        primitive: "lib.pickFiling",
        input: {
          question: "What is the range of chemicals revenue from 2014-2016?",
          candidates: [picked],
        },
        output: picked,
        startedAt: ISO,
        durationMs: 0,
      },
      {
        index: 3,
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
        index: 4,
        primitive: "lib.executeTableMath",
        input: { filing: picked, plan },
        output: { roundedAnswer: 190 },
        startedAt: ISO,
        durationMs: 0,
      },
    ],
  };
}

describe("authorFunction", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(path.join(os.tmpdir(), "df-author-"));
  });

  afterEach(async () => {
    delete (globalThis as { df?: unknown }).df;
    await rm(baseDir, { recursive: true, force: true });
  });

  it("authors intent-shaped learned interfaces that can be called without intermediate filing input", async () => {
    const trajectory = buildIntentTrajectory();
    const template = extractTemplate(trajectory);
    const resolver: LibraryResolver = {
      resolve: async () => (() => Promise.resolve(null)) as never,
      list: async () => [],
    };

    const authored = await authorFunction({
      tenantId: "acme",
      baseDir,
      trajectory,
      template,
      libraryResolver: resolver,
    });

    expect(authored.kind).toBe("authored");
    if (authored.kind !== "authored") return;
    expect(authored.source).not.toContain("input.filing");
    expect(authored.source).not.toContain('"filing": {');
    expect(authored.source).toContain("for (const candidate of candidates)");
    expect(authored.source).toContain("filing: candidate");
    expect(authored.source).toContain("missing_year_coverage");
    expect(authored.source).toContain(
      "replay-contract: origin-and-heldout-replay-before-validation",
    );
    expect(authored.source).toContain(
      "change-contract: preserve-public-schema-call-graph-and-evidence-semantics",
    );
    expect(authored.source).toContain(
      "rollback: quarantine-or-supersede-through-workspace-head",
    );
  });

  it("can supersede an existing learned interface file when the workspace HEAD advances", async () => {
    const trajectory = buildIntentTrajectory();
    const template = extractTemplate(trajectory);
    const dir = path.join(baseDir, "lib", "acme");
    const file = path.join(dir, `${template.name}.ts`);
    await mkdir(dir, { recursive: true });
    await writeFile(file, "// older workspace commit\n", "utf8");

    const resolver: LibraryResolver = {
      resolve: async () => (() => Promise.resolve(null)) as never,
      list: async () => [],
    };

    const authored = await authorFunction({
      tenantId: "acme",
      baseDir,
      trajectory: { ...trajectory, id: "traj_new_head" },
      template,
      libraryResolver: resolver,
      allowOverwrite: true,
    });

    expect(authored.kind).toBe("authored");
    await expect(readFile(file, "utf8")).resolves.toContain(
      "@origin-trajectory: traj_new_head",
    );
  });

  it("keeps rangeTableMetric signature intent-shaped when the origin hydrated search units", async () => {
    const trajectory = buildHydratedRangeTrajectory();
    const template = extractTemplate(trajectory);
    const resolver: LibraryResolver = {
      resolve: async () => (() => Promise.resolve(null)) as never,
      list: async () => [],
    };

    const authored = await authorFunction({
      tenantId: "acme",
      baseDir,
      trajectory,
      template,
      libraryResolver: resolver,
    });

    expect(authored.kind).toBe("authored");
    if (authored.kind !== "authored") return;
    expect(authored.source).toContain("type Input = { query: string; limit: number }");
    expect(authored.source).toContain(
      "df.db.finqaCases.findSimilar(input.query, input.limit)",
    );
    expect(authored.source).not.toContain("input.filter");
    expect(authored.source).not.toContain("input.candidates");
  });

  it("authors a PURE tool fan-out as a parameterised per_entity-shaped helper (Goal-4 iter 5)", async () => {
    // Agent fanned out 2 tools over 3 entities — a pure tool fan-out.
    const fanoutTrajectory: TrajectoryRecord = {
      id: "traj_fanout",
      tenantId: "acme",
      question: "analyse these shows",
      mode: "novel",
      createdAt: ISO,
      calls: [
        { index: 0, primitive: "tool.tvmaze_api.local-get_info", input: { show_id: 1, lang: "en" }, output: { n: 1 }, startedAt: ISO, durationMs: 1 },
        { index: 1, primitive: "tool.tvmaze_api.local-get_cast", input: { show_id: 1, lang: "en" }, output: { c: 1 }, startedAt: ISO, durationMs: 1 },
        { index: 2, primitive: "tool.tvmaze_api.local-get_info", input: { show_id: 2, lang: "en" }, output: { n: 2 }, startedAt: ISO, durationMs: 1 },
        { index: 3, primitive: "tool.tvmaze_api.local-get_cast", input: { show_id: 2, lang: "en" }, output: { c: 2 }, startedAt: ISO, durationMs: 1 },
        { index: 4, primitive: "tool.tvmaze_api.local-get_info", input: { show_id: 3, lang: "en" }, output: { n: 3 }, startedAt: ISO, durationMs: 1 },
        { index: 5, primitive: "tool.tvmaze_api.local-get_cast", input: { show_id: 3, lang: "en" }, output: { c: 3 }, startedAt: ISO, durationMs: 1 },
      ],
    };
    const template = extractTemplateFromCalls(
      fanoutTrajectory.calls,
      fanoutTrajectory,
      "fanout",
    );
    expect(template.name).toBe("toolFanout");
    const resolver: LibraryResolver = {
      resolve: async () => (() => Promise.resolve(null)) as never,
      list: async () => [],
    };
    const authored = await authorFunction({
      tenantId: "acme",
      baseDir,
      trajectory: fanoutTrajectory,
      template,
      libraryResolver: resolver,
    });
    expect(authored.kind).toBe("authored");
    if (authored.kind !== "authored") return;
    expect(authored.source).toContain("export const toolFanout");
    const fmEnd = authored.source.indexOf("--- */");
    const fm = fmEnd >= 0 ? authored.source.slice(0, fmEnd) : authored.source;
    expect(fm).toContain("Transferable learned datafetch fan-out helper");
    expect(fm).toContain("{ entityValues, toolBundle, toolNames, paramName, paramByTool?, limit? }");
    expect(fm).toContain("Keep these capability slots supplied by the caller");
    expect(fm).not.toContain("tvmaze_api");
    expect(fm).not.toContain("analyse these shows");
    // The capability slots are INPUT PARAMETERS, never frozen into the
    // body — this is what makes the learned helper data-shape-agnostic.
    expect(authored.source).toContain("toolBundle?: string");
    expect(authored.source).toContain("toolNames?: string[]");
    expect(authored.source).toContain("paramName?: string");
    expect(authored.source).toContain("entityValues?: Array<string | number>");
    expect(authored.source).toContain("df.tool[toolBundle]");
    // The concrete bundle name from the trajectory must NOT be frozen
    // into the body as `df.tool.tvmaze_api[...]`.
    expect(authored.source).not.toContain("df.tool.tvmaze_api[");
    // Capability slots are accepted by schema but not frozen into the public example.
    expect(authored.source).toContain("toolBundle: v.optional(v.string())");
    expect(authored.source).toContain("paramName: v.optional(v.string())");
    expect(authored.source).toContain("intent: v.optional(v.string())");
    expect(authored.source).toContain("entityId: entityValue");
    expect(authored.source).toContain("id: entityValue");
    expect(authored.source).toContain("entity: entityValue");
    expect(authored.source).toContain("...perTool");
    expect(authored.source).toContain("unwrapToolPayload(raw)");
    expect(authored.source).toContain("rawTools");
    expect(authored.source).toContain("sharedInput?: Record<string, unknown>");
    // Generic success/ok envelope unwrap: structural rule that handles wrappers
    // like {success: true, character: {...}} or {ok: true, episode: {...}}
    // without needing to enumerate every payload key. Catches tool shapes the
    // hardcoded envelopeKeys allowlist doesn't know about (rickmorty character,
    // location, episode; weather; etc).
    expect(authored.source).toContain("envelopeMetaKeys");
    expect(authored.source).toContain('typeof value.success === "boolean"');
    expect(authored.source).toContain('typeof value.ok === "boolean"');
    expect(authored.source).toContain("payloadKeys.length === 1");
  });

  it("harvests fan-out examples from the matched template slice only", async () => {
    const calls: TrajectoryRecord["calls"] = [
      { index: 0, primitive: "tool.noise_api.lookup", input: { noise_id: "n1" }, output: {}, startedAt: ISO, durationMs: 1 },
      { index: 1, primitive: "tool.noise_api.lookup", input: { noise_id: "n2" }, output: {}, startedAt: ISO, durationMs: 1 },
      { index: 2, primitive: "tool.noise_api.lookup", input: { noise_id: "n3" }, output: {}, startedAt: ISO, durationMs: 1 },
      { index: 3, primitive: "tool.noise_api.lookup", input: { noise_id: "n4" }, output: {}, startedAt: ISO, durationMs: 1 },
      { index: 4, primitive: "tool.tvmaze_api.local-get_info", input: { show_id: 1, lang: "en" }, output: { n: 1 }, startedAt: ISO, durationMs: 1 },
      { index: 5, primitive: "tool.tvmaze_api.local-get_cast", input: { show_id: 1, lang: "en" }, output: { c: 1 }, startedAt: ISO, durationMs: 1 },
      { index: 6, primitive: "tool.tvmaze_api.local-get_info", input: { show_id: 2, lang: "en" }, output: { n: 2 }, startedAt: ISO, durationMs: 1 },
      { index: 7, primitive: "tool.tvmaze_api.local-get_cast", input: { show_id: 2, lang: "en" }, output: { c: 2 }, startedAt: ISO, durationMs: 1 },
      { index: 8, primitive: "tool.tvmaze_api.local-get_info", input: { show_id: 3, lang: "en" }, output: { n: 3 }, startedAt: ISO, durationMs: 1 },
      { index: 9, primitive: "tool.tvmaze_api.local-get_cast", input: { show_id: 3, lang: "en" }, output: { c: 3 }, startedAt: ISO, durationMs: 1 },
    ];
    const fanoutTrajectory: TrajectoryRecord = {
      id: "traj_fanout_with_noise",
      tenantId: "acme",
      question: "analyse these shows",
      mode: "novel",
      createdAt: ISO,
      calls,
    };
    const template = extractTemplateFromCalls(
      calls.slice(4),
      fanoutTrajectory,
      "fanout",
    );
    const resolver: LibraryResolver = {
      resolve: async () => (() => Promise.resolve(null)) as never,
      list: async () => [],
    };
    const authored = await authorFunction({
      tenantId: "acme",
      baseDir,
      trajectory: fanoutTrajectory,
      template,
      libraryResolver: resolver,
    });
    expect(authored.kind).toBe("authored");
    if (authored.kind !== "authored") return;
    expect(authored.source).toContain("paramName: v.optional(v.string())");
    expect(authored.source).not.toContain('"paramName": "noise_id"');
    expect(authored.source).not.toContain('"noise_id"');
    expect(authored.source).not.toContain("tool.noise_api.lookup");
  });

  it("harvests fan-out examples by trajectory call index when primitives repeat", async () => {
    const calls: TrajectoryRecord["calls"] = [
      { index: 0, primitive: "tool.tvmaze_api.local-get_info", input: { show_id: 901 }, output: { n: 901 }, startedAt: ISO, durationMs: 1 },
      { index: 1, primitive: "tool.tvmaze_api.local-get_cast", input: { show_id: 901 }, output: { c: 901 }, startedAt: ISO, durationMs: 1 },
      { index: 2, primitive: "tool.tvmaze_api.local-get_info", input: { show_id: 902 }, output: { n: 902 }, startedAt: ISO, durationMs: 1 },
      { index: 3, primitive: "tool.tvmaze_api.local-get_cast", input: { show_id: 902 }, output: { c: 902 }, startedAt: ISO, durationMs: 1 },
      { index: 4, primitive: "tool.tvmaze_api.local-get_info", input: { show_id: 903 }, output: { n: 903 }, startedAt: ISO, durationMs: 1 },
      { index: 5, primitive: "tool.tvmaze_api.local-get_cast", input: { show_id: 903 }, output: { c: 903 }, startedAt: ISO, durationMs: 1 },
      { index: 6, primitive: "tool.tvmaze_api.local-get_info", input: { show_id: 1 }, output: { n: 1 }, startedAt: ISO, durationMs: 1 },
      { index: 7, primitive: "tool.tvmaze_api.local-get_cast", input: { show_id: 1 }, output: { c: 1 }, startedAt: ISO, durationMs: 1 },
      { index: 8, primitive: "tool.tvmaze_api.local-get_info", input: { show_id: 2 }, output: { n: 2 }, startedAt: ISO, durationMs: 1 },
      { index: 9, primitive: "tool.tvmaze_api.local-get_cast", input: { show_id: 2 }, output: { c: 2 }, startedAt: ISO, durationMs: 1 },
      { index: 10, primitive: "tool.tvmaze_api.local-get_info", input: { show_id: 3 }, output: { n: 3 }, startedAt: ISO, durationMs: 1 },
      { index: 11, primitive: "tool.tvmaze_api.local-get_cast", input: { show_id: 3 }, output: { c: 3 }, startedAt: ISO, durationMs: 1 },
    ];
    const fanoutTrajectory: TrajectoryRecord = {
      id: "traj_fanout_repeated_primitives",
      tenantId: "acme",
      question: "analyse these shows",
      mode: "novel",
      createdAt: ISO,
      calls,
    };
    const template = extractTemplateFromCalls(
      calls.slice(6),
      fanoutTrajectory,
      "fanout",
    );
    const resolver: LibraryResolver = {
      resolve: async () => (() => Promise.resolve(null)) as never,
      list: async () => [],
    };
    const authored = await authorFunction({
      tenantId: "acme",
      baseDir,
      trajectory: fanoutTrajectory,
      template,
      libraryResolver: resolver,
    });
    expect(authored.kind).toBe("authored");
    if (authored.kind !== "authored") return;
    expect(authored.source).toContain("paramName: v.optional(v.string())");
    expect(authored.source).toContain("@steps: tool.tvmaze_api.local-get_info -> tool.tvmaze_api.local-get_cast");
    expect(authored.source).not.toContain("901");
    expect(authored.source).not.toContain("902");
    expect(authored.source).not.toContain("903");
  });

  it("authors record-backed fan-out helpers without wrapping the per_entity seed", async () => {
    const fanoutTrajectory: TrajectoryRecord = {
      id: "traj_record_fanout",
      tenantId: "acme",
      question: "analyse these shows",
      mode: "novel",
      createdAt: ISO,
      calls: [
        { index: 0, primitive: "db.records.findExact", input: { filter: {}, limit: 999 }, output: [{ id: 1 }, { id: 2 }, { id: 3 }], startedAt: ISO, durationMs: 1 },
        { index: 1, primitive: "tool.tvmaze_api.local-get_info", input: { show_id: 1, lang: "en" }, output: { n: 1 }, startedAt: ISO, durationMs: 1 },
        { index: 2, primitive: "tool.tvmaze_api.local-get_cast", input: { show_id: 1, lang: "en" }, output: { c: 1 }, startedAt: ISO, durationMs: 1 },
        { index: 3, primitive: "tool.tvmaze_api.local-get_info", input: { show_id: 2, lang: "en" }, output: { n: 2 }, startedAt: ISO, durationMs: 1 },
        { index: 4, primitive: "tool.tvmaze_api.local-get_cast", input: { show_id: 2, lang: "en" }, output: { c: 2 }, startedAt: ISO, durationMs: 1 },
        { index: 5, primitive: "tool.tvmaze_api.local-get_info", input: { show_id: 3, lang: "en" }, output: { n: 3 }, startedAt: ISO, durationMs: 1 },
        { index: 6, primitive: "tool.tvmaze_api.local-get_cast", input: { show_id: 3, lang: "en" }, output: { c: 3 }, startedAt: ISO, durationMs: 1 },
        {
          index: 7,
          primitive: "lib.per_entity",
          input: {
            entityIds: [1, 2, 3],
            toolBundle: "tvmaze_api",
            toolNames: ["local-get_info", "local-get_cast"],
            paramName: "show_id",
          },
          output: [],
          startedAt: ISO,
          durationMs: 1,
        },
      ],
    };
    const template = extractTemplate(fanoutTrajectory);
    expect(template.name).toBe("recordToolFanout");
    const resolver: LibraryResolver = {
      resolve: async () => (() => Promise.resolve(null)) as never,
      list: async () => [],
    };
    const authored = await authorFunction({
      tenantId: "acme",
      baseDir,
      trajectory: fanoutTrajectory,
      template,
      libraryResolver: resolver,
    });

    expect(authored.kind).toBe("authored");
    if (authored.kind !== "authored") return;
    expect(authored.source).toContain("export const recordToolFanout");
    expect(authored.source).toContain("@intent-signature: db→FANOUT(tool)→lib");
    expect(authored.source).toContain("df.db.records.findExact");
    expect(authored.source).toContain("df.tool[toolBundle]");
    expect(authored.source).toContain('intent?: "record-backed repeated fan-out"');
    expect(authored.source).toContain("type InternalRecordFanoutPlan");
    expect(authored.source).toContain("paramByTool?: Record<string, string>");
    expect(authored.source).toContain("recordParamMapByTool?: Record<string, Record<string, string>>");
    expect(authored.source).toContain("plan.paramByTool?.[toolName] ?? defaultParamName");
    expect(authored.source).toContain("plan.recordParamMapByTool?.[toolName]");
    expect(authored.source).toContain("readRecordField(rec, recordField)");
    expect(authored.source).not.toContain("entityValues?:");
    expect(authored.source).not.toContain("input.entityValues");
    expect(authored.source).toContain("const entityId = normalizeId(entityValue)");
    expect(authored.source).toContain("record: rec, label, attributes");
    expect(authored.source).toContain("...perTool");
    expect(authored.source).toContain("unwrapToolPayload(raw)");
    expect(authored.source).toContain("rawTools");
    expect(authored.source).not.toContain("df.lib.per_entity(");
    expect(authored.source).not.toContain("df.tool.tvmaze_api[");
    const fmEnd = authored.source.indexOf("--- */");
    const fm = fmEnd >= 0 ? authored.source.slice(0, fmEnd) : authored.source;
    expect(fm).toContain("record-backed per-entity tool fan-out");
    expect(fm).toContain("caller-facing input is intent-shaped");
    expect(fm).not.toContain("recordParamMapByTool?");
    expect(fm).not.toContain("tvmaze_api");
  });

  it("authors exact record fan-out helpers from learned lookup reuse rows", async () => {
    const fanoutTrajectory: TrajectoryRecord = {
      id: "traj_record_lookup_reuse",
      tenantId: "acme",
      question: "reuse learned lookup, then project the answer",
      mode: "novel",
      createdAt: ISO,
      calls: [
        { index: 0, primitive: "db.records.findExact", input: { filter: {}, limit: 3 }, output: [{ id: 1 }, { id: 2 }, { id: 3 }], startedAt: ISO, durationMs: 1 },
        { index: 1, primitive: "tool.tvmaze_api.local-get_info", input: { show_id: 1 }, output: { n: 1 }, startedAt: ISO, durationMs: 1 },
        { index: 2, primitive: "tool.tvmaze_api.local-get_cast", input: { show_id: 1 }, output: { c: 1 }, startedAt: ISO, durationMs: 1 },
        { index: 3, primitive: "tool.tvmaze_api.local-get_info", input: { show_id: 2 }, output: { n: 2 }, startedAt: ISO, durationMs: 1 },
        { index: 4, primitive: "tool.tvmaze_api.local-get_cast", input: { show_id: 2 }, output: { c: 2 }, startedAt: ISO, durationMs: 1 },
        { index: 5, primitive: "tool.tvmaze_api.local-get_info", input: { show_id: 3 }, output: { n: 3 }, startedAt: ISO, durationMs: 1 },
        { index: 6, primitive: "tool.tvmaze_api.local-get_cast", input: { show_id: 3 }, output: { c: 3 }, startedAt: ISO, durationMs: 1 },
        {
          index: 7,
          primitive: "lib.recordToolLookup",
          input: {
            recordFilter: {},
            toolBundle: "tvmaze_api",
            toolNames: ["local-get_info", "local-get_cast"],
            paramName: "show_id",
          },
          output: [],
          startedAt: ISO,
          durationMs: 1,
        },
      ],
    };
    const template = extractTemplate(fanoutTrajectory);
    expect(template.intentSignature).toBe("db→FANOUT(tool)→lib");
    expect(template.name).toBe("recordToolFanout");
    const resolver: LibraryResolver = {
      resolve: async () => (() => Promise.resolve(null)) as never,
      list: async () => [],
    };
    const authored = await authorFunction({
      tenantId: "acme",
      baseDir,
      trajectory: fanoutTrajectory,
      template,
      libraryResolver: resolver,
    });

    expect(authored.kind).toBe("authored");
    if (authored.kind !== "authored") return;
    expect(authored.source).toContain("export const recordToolFanout");
    expect(authored.source).toContain("@intent-signature: db→FANOUT(tool)→lib");
    expect(authored.source).toContain("df.db.records.findExact(input.recordFilter");
    expect(authored.source).not.toContain("df.lib.recordToolLookup(");
  });

  it("authors record-backed fan-out helpers when records use short country codes", async () => {
    const fanoutTrajectory: TrajectoryRecord = {
      id: "traj_record_fanout_short_codes",
      tenantId: "acme",
      question: "analyse nationalities",
      mode: "novel",
      createdAt: ISO,
      calls: [
        {
          index: 0,
          primitive: "db.records.findExact",
          input: { filter: { family: "random-user-database" }, limit: 3 },
          output: [
            { id: "US", entity: "US", attributes: { code: "US", name: "United States" } },
            { id: "GB", entity: "GB", attributes: { code: "GB", name: "United Kingdom" } },
            { id: "DE", entity: "DE", attributes: { code: "DE", name: "Germany" } },
          ],
          startedAt: ISO,
          durationMs: 1,
        },
        { index: 1, primitive: "tool.randomuser_api.local-randomuser_by_nationality", input: { nationality: "US", count: 5 }, output: { results: [] }, startedAt: ISO, durationMs: 1 },
        { index: 2, primitive: "tool.randomuser_api.local-randomuser_by_nationality", input: { nationality: "GB", count: 5 }, output: { results: [] }, startedAt: ISO, durationMs: 1 },
        { index: 3, primitive: "tool.randomuser_api.local-randomuser_by_nationality", input: { nationality: "DE", count: 5 }, output: { results: [] }, startedAt: ISO, durationMs: 1 },
        {
          index: 4,
          primitive: "lib.per_entity",
          input: {
            entityIds: ["US", "GB", "DE"],
            toolBundle: "randomuser_api",
            toolNames: ["local-randomuser_by_nationality"],
            paramName: "nationality",
            extraInput: { count: 5 },
          },
          output: [],
          startedAt: ISO,
          durationMs: 1,
        },
      ],
    };
    const template = extractTemplate(fanoutTrajectory);
    expect(template.name).toBe("recordToolFanout");
    const resolver: LibraryResolver = {
      resolve: async () => (() => Promise.resolve(null)) as never,
      list: async () => [],
    };
    const authored = await authorFunction({
      tenantId: "acme",
      baseDir,
      trajectory: fanoutTrajectory,
      template,
      libraryResolver: resolver,
    });

    expect(authored.kind).toBe("authored");
    if (authored.kind !== "authored") return;
    expect(authored.source).toContain("recordFilter?: Record<string, unknown>");
    expect(authored.source).toContain("recordLimit?: number");
    expect(authored.source).toContain("entityField?: string");
    expect(authored.source).toContain("recordParamMapByTool?: Record<string, Record<string, string>>");
    expect(authored.source).toContain("type InternalRecordFanoutPlan");
    expect(authored.source).toContain("input: v.looseObject");
    expect(authored.source).toContain("df.db.records.findExact(input.recordFilter");
    expect(authored.source).not.toContain("filter: Record<string, unknown>; limit: number; count: number; nationality: string");
    expect(authored.source).toContain("Goal-4 learned record-backed fan-out interface");
  });

  it("authors direct record-backed fan-out helpers without requiring the per_entity seed", async () => {
    const fanoutTrajectory: TrajectoryRecord = {
      id: "traj_record_lookup_short_codes",
      tenantId: "acme",
      question: "analyse nationalities directly",
      mode: "novel",
      createdAt: ISO,
      calls: [
        {
          index: 0,
          primitive: "db.records.findExact",
          input: { filter: { family: "random-user-database" }, limit: 3 },
          output: [
            { id: "US", entity: "US", attributes: { code: "US", name: "United States" } },
            { id: "GB", entity: "GB", attributes: { code: "GB", name: "United Kingdom" } },
            { id: "DE", entity: "DE", attributes: { code: "DE", name: "Germany" } },
          ],
          startedAt: ISO,
          durationMs: 1,
        },
        { index: 1, primitive: "tool.randomuser_api.local-randomuser_by_nationality", input: { nationality: "US", count: 5 }, output: { results: [] }, startedAt: ISO, durationMs: 1 },
        { index: 2, primitive: "tool.randomuser_api.local-randomuser_by_nationality", input: { nationality: "GB", count: 5 }, output: { results: [] }, startedAt: ISO, durationMs: 1 },
        { index: 3, primitive: "tool.randomuser_api.local-randomuser_by_nationality", input: { nationality: "DE", count: 5 }, output: { results: [] }, startedAt: ISO, durationMs: 1 },
      ],
    };
    const template = extractTemplate(fanoutTrajectory);
    expect(template.intentSignature).toBe("db→FANOUT(tool)");
    expect(template.name).toBe("recordToolLookup");
    const resolver: LibraryResolver = {
      resolve: async () => (() => Promise.resolve(null)) as never,
      list: async () => [],
    };
    const authored = await authorFunction({
      tenantId: "acme",
      baseDir,
      trajectory: fanoutTrajectory,
      template,
      libraryResolver: resolver,
    });

    expect(authored.kind).toBe("authored");
    if (authored.kind !== "authored") return;
    expect(authored.source).toContain("export const recordToolLookup");
    expect(authored.source).toContain("@intent-signature: db→FANOUT(tool)");
    expect(authored.source).toContain("df.db.records.findExact(input.recordFilter");
    expect(authored.source).toContain("df.tool[toolBundle]");
    expect(authored.source).not.toContain("df.lib.per_entity(");
  });

  it("authors direct record lookups from the record-backed subset of mixed tool calls", async () => {
    const fanoutTrajectory: TrajectoryRecord = {
      id: "traj_record_lookup_mixed_tools",
      tenantId: "acme",
      question: "build mixed character summaries",
      mode: "novel",
      createdAt: ISO,
      calls: [
        {
          index: 0,
          primitive: "db.records.findExact",
          input: { filter: { family: "dnd-campaign-builder" }, limit: 3 },
          output: [
            { id: "dnd-1", entity: "dnd-1", attributes: { race: "human", class: "fighter" } },
            { id: "dnd-2", entity: "dnd-2", attributes: { race: "elf", class: "wizard" } },
            { id: "dnd-3", entity: "dnd-3", attributes: { race: "dwarf", class: "cleric" } },
          ],
          startedAt: ISO,
          durationMs: 1,
        },
        { index: 1, primitive: "tool.dnd_api.local-dnd_get_equipment_category", input: { category: "weapon" }, output: { items: [] }, startedAt: ISO, durationMs: 1 },
        { index: 2, primitive: "tool.dnd_api.local-dnd_get_race", input: { race_name: "Human" }, output: { race: "Human" }, startedAt: ISO, durationMs: 1 },
        { index: 3, primitive: "tool.dnd_api.local-dnd_get_class", input: { class_name: "Fighter" }, output: { class: "Fighter" }, startedAt: ISO, durationMs: 1 },
        { index: 4, primitive: "tool.dnd_api.local-dnd_get_race", input: { race_name: "Elf" }, output: { race: "Elf" }, startedAt: ISO, durationMs: 1 },
        { index: 5, primitive: "tool.dnd_api.local-dnd_get_class", input: { class_name: "Wizard" }, output: { class: "Wizard" }, startedAt: ISO, durationMs: 1 },
        { index: 6, primitive: "tool.dnd_api.local-dnd_get_race", input: { race_name: "Dwarf" }, output: { race: "Dwarf" }, startedAt: ISO, durationMs: 1 },
        { index: 7, primitive: "tool.dnd_api.local-dnd_get_class", input: { class_name: "Cleric" }, output: { class: "Cleric" }, startedAt: ISO, durationMs: 1 },
      ],
    };
    const template = extractTemplate(fanoutTrajectory);
    expect(template.name).toBe("recordToolLookup");
    const resolver: LibraryResolver = {
      resolve: async () => (() => Promise.resolve(null)) as never,
      list: async () => [],
    };
    const authored = await authorFunction({
      tenantId: "acme",
      baseDir,
      trajectory: fanoutTrajectory,
      template,
      libraryResolver: resolver,
    });

    expect(authored.kind).toBe("authored");
    if (authored.kind !== "authored") return;
    expect(authored.source).toContain("export const recordToolLookup");
    expect(authored.source).toContain("@intent-signature: db→FANOUT(tool)");
    expect(authored.source).toContain("type InternalRecordFanoutPlan");
    const fmEnd = authored.source.indexOf("--- */");
    const fm = fmEnd >= 0 ? authored.source.slice(0, fmEnd) : authored.source;
    expect(fm).toContain("caller-facing input is intent-shaped");
    expect(fm).not.toContain("local-dnd_get_equipment_category");
  });

  it("drops erroring record-backed tool slots from authored helpers", async () => {
    const fanoutTrajectory: TrajectoryRecord = {
      id: "traj_record_lookup_error_slot",
      tenantId: "acme",
      question: "build class summaries",
      mode: "novel",
      createdAt: ISO,
      calls: [
        {
          index: 0,
          primitive: "db.records.findExact",
          input: { filter: { family: "dnd-campaign-builder" }, limit: 3 },
          output: [
            { id: "a", entity: "a", attributes: { class: "fighter" } },
            { id: "b", entity: "b", attributes: { class: "wizard" } },
            { id: "c", entity: "c", attributes: { class: "cleric" } },
          ],
          startedAt: ISO,
          durationMs: 1,
        },
        { index: 1, primitive: "tool.dnd_api.local-dnd_get_class", input: { class_name: "fighter" }, output: { class: "fighter" }, startedAt: ISO, durationMs: 1 },
        { index: 2, primitive: "tool.dnd_api.local-dnd_get_class_spells", input: { class_name: "fighter" }, output: { spells: [] }, startedAt: ISO, durationMs: 1 },
        { index: 3, primitive: "tool.dnd_api.local-dnd_get_class", input: { class_name: "wizard" }, output: { class: "wizard" }, startedAt: ISO, durationMs: 1 },
        { index: 4, primitive: "tool.dnd_api.local-dnd_get_class_spells", input: { class_name: "wizard" }, output: { success: false, error: "timeout" }, startedAt: ISO, durationMs: 1 },
        { index: 5, primitive: "tool.dnd_api.local-dnd_get_class", input: { class_name: "cleric" }, output: { class: "cleric" }, startedAt: ISO, durationMs: 1 },
        { index: 6, primitive: "tool.dnd_api.local-dnd_get_class_spells", input: { class_name: "cleric" }, output: { spells: [] }, startedAt: ISO, durationMs: 1 },
      ],
    };
    const template = extractTemplate(fanoutTrajectory);
    expect(template.name).toBe("recordToolLookup");
    const resolver: LibraryResolver = {
      resolve: async () => (() => Promise.resolve(null)) as never,
      list: async () => [],
    };
    const authored = await authorFunction({
      tenantId: "acme",
      baseDir,
      trajectory: fanoutTrajectory,
      template,
      libraryResolver: resolver,
    });

    expect(authored.kind).toBe("authored");
    if (authored.kind !== "authored") return;
    expect(authored.source).toContain("type InternalRecordFanoutPlan");
    const publicExample = authored.source.slice(
      authored.source.indexOf("examples: ["),
      authored.source.indexOf("input: v.looseObject"),
    );
    expect(publicExample).toContain('"intent": "record-backed repeated fan-out"');
    expect(publicExample).not.toContain("local-dnd_get_class");
    expect(publicExample).not.toContain("local-dnd_get_class_spells");
  });

  it("authors record-backed dependent enrichment helpers over the record fanout helper", async () => {
    const trajectory: TrajectoryRecord = {
      id: "traj_record_enrichment",
      tenantId: "acme",
      question: "enrich records after base fanout",
      mode: "novel",
      createdAt: ISO,
      calls: [
        { index: 0, primitive: "db.records.findExact", input: { filter: {}, limit: 3 }, output: [{ id: 1 }, { id: 2 }, { id: 3 }], startedAt: ISO, durationMs: 1 },
        { index: 1, primitive: "tool.api.getBase", input: { id: 1 }, output: { id: 1 }, startedAt: ISO, durationMs: 1 },
        { index: 2, primitive: "tool.api.getBase", input: { id: 2 }, output: { id: 2 }, startedAt: ISO, durationMs: 1 },
        { index: 3, primitive: "tool.api.getBase", input: { id: 3 }, output: { id: 3 }, startedAt: ISO, durationMs: 1 },
        { index: 4, primitive: "lib.recordToolFanout", input: { recordFilter: {}, toolNames: ["getBase"] }, output: { value: [{ entityId: 1 }, { entityId: 2 }, { entityId: 3 }] }, startedAt: ISO, durationMs: 1 },
        { index: 5, primitive: "tool.api.getDependent", input: { id: 1 }, output: { dep: 1 }, startedAt: ISO, durationMs: 1 },
        { index: 6, primitive: "tool.api.getDependent", input: { id: 2 }, output: { dep: 2 }, startedAt: ISO, durationMs: 1 },
        { index: 7, primitive: "tool.api.getDependent", input: { id: 3 }, output: { dep: 3 }, startedAt: ISO, durationMs: 1 },
      ],
    };
    const template = extractTemplate(trajectory);
    expect(template.name).toBe("recordToolEnrichment");
    const resolver: LibraryResolver = {
      resolve: async () => (() => Promise.resolve(null)) as never,
      list: async () => [],
    };
    const authored = await authorFunction({
      tenantId: "acme",
      baseDir,
      trajectory,
      template,
      libraryResolver: resolver,
    });

    expect(authored.kind).toBe("authored");
    if (authored.kind !== "authored") return;
    expect(authored.source).toContain("export const recordToolEnrichment");
    expect(authored.source).toContain("@intent-signature: db→FANOUT(tool)→lib→FANOUT(tool)");
    expect(authored.source).toContain("df.lib.recordToolFanout");
    expect(authored.source).toContain("runInlineRecordToolFanout");
    expect(authored.source).toContain("df.db.records.findExact");
    expect(authored.source).toContain('intent?: "record-backed dependent enrichment"');
    expect(authored.source).toContain("type InternalRecordEnrichmentPlan");
    expect(authored.source).toContain("dependentToolNames?: string[]");
    expect(authored.source).toContain("dependentTools");
  });

  it("authors pure tool fanout dependent enrichment helpers over toolFanout", async () => {
    const trajectory: TrajectoryRecord = {
      id: "traj_tool_enrichment",
      tenantId: "acme",
      question: "enrich pokemon after base fanout",
      mode: "novel",
      createdAt: ISO,
      calls: [
        { index: 0, primitive: "tool.pokemon_tools.local-pokemon_get_species", input: { pokemon_id: 25 }, output: { species: { evolution_chain_id: 10 } }, startedAt: ISO, durationMs: 1 },
        { index: 1, primitive: "tool.pokemon_tools.local-pokemon_get_species", input: { pokemon_id: 6 }, output: { species: { evolution_chain_id: 2 } }, startedAt: ISO, durationMs: 1 },
        { index: 2, primitive: "tool.pokemon_tools.local-pokemon_get_species", input: { pokemon_id: 445 }, output: { species: { evolution_chain_id: 230 } }, startedAt: ISO, durationMs: 1 },
        { index: 3, primitive: "lib.toolFanout", input: { intent: "repeated tool fan-out" }, output: { value: [{ entityId: 25 }, { entityId: 6 }, { entityId: 445 }] }, startedAt: ISO, durationMs: 1 },
        { index: 4, primitive: "tool.pokemon_tools.local-pokemon_get_evolution", input: { chain_id: 10 }, output: { evolution_chain: { id: 10 } }, startedAt: ISO, durationMs: 1 },
        { index: 5, primitive: "tool.pokemon_tools.local-pokemon_get_evolution", input: { chain_id: 2 }, output: { evolution_chain: { id: 2 } }, startedAt: ISO, durationMs: 1 },
        { index: 6, primitive: "tool.pokemon_tools.local-pokemon_get_evolution", input: { chain_id: 230 }, output: { evolution_chain: { id: 230 } }, startedAt: ISO, durationMs: 1 },
      ],
    };
    const template = extractTemplate(trajectory);
    expect(template.name).toBe("toolFanoutEnrichment");
    const resolver: LibraryResolver = {
      resolve: async () => (() => Promise.resolve(null)) as never,
      list: async () => [],
    };
    const authored = await authorFunction({
      tenantId: "acme",
      baseDir,
      trajectory,
      template,
      libraryResolver: resolver,
    });

    expect(authored.kind).toBe("authored");
    if (authored.kind !== "authored") return;
    expect(authored.source).toContain("export const toolFanoutEnrichment");
    expect(authored.source).toContain("@intent-signature: FANOUT(tool)→lib→FANOUT(tool)");
    expect(authored.source).toContain("df.lib.toolFanout");
    expect(authored.source).toContain('intent?: "repeated tool fan-out dependent enrichment"');
    expect(authored.source).toContain("type InternalToolEnrichmentPlan");
    expect(authored.source).toContain("dependentValuePathsByTool?: Record<string, string[]>");
    expect(authored.source).toContain("intent: v.optional(v.string())");
    expect(authored.source).toContain("dependentToolBundle: v.optional(v.string())");
    expect(authored.source).toContain("dependentValuePathsByTool: v.optional(v.record(v.string(), v.array(v.string())))");
    expect(authored.source).toContain("findValueForParam");
    expect(authored.source).toContain("dependentTools");
  });

  it("does not use the record-backed shortcut when tools do not consume records", async () => {
    const fanoutTrajectory: TrajectoryRecord = {
      id: "traj_record_fanout_unrelated_tools",
      tenantId: "acme",
      question: "analyse these shows",
      mode: "novel",
      createdAt: ISO,
      calls: [
        { index: 0, primitive: "db.records.findExact", input: { filter: {}, limit: 999 }, output: [{ id: "alpha-record" }, { id: "beta-record" }], startedAt: ISO, durationMs: 1 },
        { index: 1, primitive: "tool.tvmaze_api.local-get_info", input: { show_id: 901, lang: "en" }, output: { n: 1 }, startedAt: ISO, durationMs: 1 },
        { index: 2, primitive: "tool.tvmaze_api.local-get_cast", input: { show_id: 901, lang: "en" }, output: { c: 1 }, startedAt: ISO, durationMs: 1 },
        { index: 3, primitive: "tool.tvmaze_api.local-get_info", input: { show_id: 902, lang: "en" }, output: { n: 2 }, startedAt: ISO, durationMs: 1 },
        { index: 4, primitive: "tool.tvmaze_api.local-get_cast", input: { show_id: 902, lang: "en" }, output: { c: 2 }, startedAt: ISO, durationMs: 1 },
        {
          index: 5,
          primitive: "lib.per_entity",
          input: {
            entityIds: ["alpha-record", "beta-record"],
            toolBundle: "tvmaze_api",
            toolNames: ["local-get_info", "local-get_cast"],
            paramName: "show_id",
          },
          output: [],
          startedAt: ISO,
          durationMs: 1,
        },
      ],
    };
    const template = extractTemplate(fanoutTrajectory);
    expect(template.name).toBe("recordToolFanout");
    const resolver: LibraryResolver = {
      resolve: async () => (() => Promise.resolve(null)) as never,
      list: async () => [],
    };
    const authored = await authorFunction({
      tenantId: "acme",
      baseDir,
      trajectory: fanoutTrajectory,
      template,
      libraryResolver: resolver,
    });
    if (authored.kind === "authored") {
      expect(authored.source).not.toContain("record-backed per-entity tool fan-out");
      expect(authored.source).not.toContain("fetches records itself");
    }
  });
});
