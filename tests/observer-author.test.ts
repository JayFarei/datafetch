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
    // The capability slots are INPUT PARAMETERS, never frozen into the
    // body — this is what makes the learned helper data-shape-agnostic.
    expect(authored.source).toContain("toolBundle: string");
    expect(authored.source).toContain("toolNames: string[]");
    expect(authored.source).toContain("paramName: string");
    expect(authored.source).toContain("df.tool[input.toolBundle]");
    // The concrete bundle name from the trajectory must NOT be frozen
    // into the body as `df.tool.tvmaze_api[...]`.
    expect(authored.source).not.toContain("df.tool.tvmaze_api[");
    // The example carries the harvested capability slots.
    expect(authored.source).toContain('"toolBundle": "tvmaze_api"');
    expect(authored.source).toContain('"paramName": "show_id"');
    // sharedInput captures the constant `lang: "en"` field.
    expect(authored.source).toContain('"sharedInput"');
  });
});
