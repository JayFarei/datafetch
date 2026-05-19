import { describe, expect, it } from "vitest";

import type { TrajectoryRecord } from "../src/sdk/index.js";
import { shouldCrystallise } from "../src/observer/gate.js";
import type { LibrarySnapshot } from "../src/observer/template.js";

const EMPTY_LIB: LibrarySnapshot = {
  shapeHashes: new Set<string>(),
  learnedNames: new Set<string>(),
};

function buildTrajectory(
  partial: Partial<TrajectoryRecord> & { calls: TrajectoryRecord["calls"] },
): TrajectoryRecord {
  return {
    id: partial.id ?? "traj_test",
    tenantId: partial.tenantId ?? "t",
    question: partial.question ?? "test",
    mode: partial.mode ?? "interpreted",
    calls: partial.calls,
    createdAt: partial.createdAt ?? new Date().toISOString(),
    ...(partial.errored !== undefined ? { errored: partial.errored } : {}),
    ...(partial.cost !== undefined ? { cost: partial.cost } : {}),
    ...(partial.provenance !== undefined ? { provenance: partial.provenance } : {}),
    ...(partial.result !== undefined ? { result: partial.result } : {}),
    ...(partial.phase !== undefined ? { phase: partial.phase } : {}),
    ...(partial.crystallisable !== undefined ? { crystallisable: partial.crystallisable } : {}),
    ...(partial.sourcePath !== undefined ? { sourcePath: partial.sourcePath } : {}),
    ...(partial.artifactDir !== undefined ? { artifactDir: partial.artifactDir } : {}),
    ...(partial.answer !== undefined ? { answer: partial.answer } : {}),
    ...(partial.answerValidation !== undefined
      ? { answerValidation: partial.answerValidation }
      : {}),
  };
}

const VALID_CALLS: TrajectoryRecord["calls"] = [
  {
    index: 0,
    primitive: "db.cases.findSimilar",
    input: { query: "AAPL 2017 revenue", limit: 5 },
    output: [
      { filename: "AAPL/2017/page_42.pdf", question: "x", searchableText: "y" },
    ],
    startedAt: new Date().toISOString(),
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
    startedAt: new Date().toISOString(),
    durationMs: 0,
  },
];

describe("shouldCrystallise", () => {
  it("approves a clean composition trajectory", () => {
    const traj = buildTrajectory({ calls: VALID_CALLS });
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "fresh",
      existing: EMPTY_LIB,
    });
    expect(out.ok).toBe(true);
  });

  it("approves visible filtered subsets of a db result set", () => {
    const calls: TrajectoryRecord["calls"] = [
      {
        ...VALID_CALLS[0]!,
        output: [
          { id: "HFC/2018/page_43.pdf-5", question: "share repurchases" },
          {
            id: "UNP/2016/page_52.pdf-4",
            filename: "UNP/2016/page_52.pdf",
            question: "chemical revenue range",
          },
        ],
      },
      {
        ...VALID_CALLS[1]!,
        input: {
          question: "chemicals revenue",
          candidates: [
            {
              id: "UNP/2016/page_52.pdf-4",
              filename: "UNP/2016/page_52.pdf",
              question: "chemical revenue range",
            },
          ],
        },
      },
    ];
    const traj = buildTrajectory({ calls, mode: "novel" });
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "filtered-subset",
      existing: EMPTY_LIB,
    });
    expect(out.ok).toBe(true);
  });

  it("approves record-backed sub-graphs whose downstream tools consume short record ids", () => {
    const calls: TrajectoryRecord["calls"] = [
      {
        index: 0,
        primitive: "db.records.search",
        input: { family: "rickmorty-multiverse-explorer", limit: 3 },
        output: [
          {
            id: "1",
            recordKey: "rickmorty-multiverse-explorer:1",
            family: "rickmorty-multiverse-explorer",
            entity: "1",
            label: "Rick Sanchez",
            attributes: { id: 1, name: "Rick Sanchez" },
          },
        ],
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 1,
        primitive: "tool.rickmorty_api.get_character",
        input: { character_id: "1" },
        output: { id: 1, name: "Rick Sanchez" },
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 2,
        primitive: "lib.per_entity",
        input: {
          rows: [{ entityId: "1", outputs: [{ id: 1, name: "Rick Sanchez" }] }],
        },
        output: [{ entityId: "1", outputs: [{ id: 1, name: "Rick Sanchez" }] }],
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
    ];
    const traj = buildTrajectory({ calls, mode: "novel" });
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "record-short-id",
      existing: EMPTY_LIB,
      subGraph: true,
      callsSlice: calls,
    });
    expect(out.ok).toBe(true);
  });

  it("approves direct record-backed tool fan-out trajectories without a seed helper", () => {
    const calls: TrajectoryRecord["calls"] = [
      {
        index: 0,
        primitive: "db.records.findExact",
        input: { family: "random-user-database", limit: 3 },
        output: [
          {
            id: "US",
            recordKey: "random-user-database:US",
            family: "random-user-database",
            entity: "US",
            label: "United States",
            attributes: { code: "US" },
          },
          {
            id: "GB",
            recordKey: "random-user-database:GB",
            family: "random-user-database",
            entity: "GB",
            label: "United Kingdom",
            attributes: { code: "GB" },
          },
        ],
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 1,
        primitive: "tool.randomuser_api.by_nationality",
        input: { nationality: "US", count: 5 },
        output: { users: [] },
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 2,
        primitive: "tool.randomuser_api.by_nationality",
        input: { nationality: "GB", count: 5 },
        output: { users: [] },
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
    ];
    const traj = buildTrajectory({ calls, mode: "novel" });
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "direct-record-fanout",
      existing: EMPTY_LIB,
    });
    expect(out.ok).toBe(true);
  });

  it("allows slot-local record tool failures when clean record slots remain", () => {
    const calls: TrajectoryRecord["calls"] = [
      {
        index: 0,
        primitive: "db.records.findExact",
        input: { family: "dnd-campaign-builder", limit: 3 },
        output: [
          { id: "a", recordKey: "dnd:a", family: "dnd", entity: "a", attributes: { class: "fighter" } },
          { id: "b", recordKey: "dnd:b", family: "dnd", entity: "b", attributes: { class: "wizard" } },
          { id: "c", recordKey: "dnd:c", family: "dnd", entity: "c", attributes: { class: "cleric" } },
        ],
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 1,
        primitive: "tool.dnd_api.local-dnd_get_class",
        input: { class_name: "fighter" },
        output: { class: "fighter" },
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 2,
        primitive: "tool.dnd_api.local-dnd_get_class_spells",
        input: { class_name: "wizard" },
        output: { success: false, error: "timeout" },
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 3,
        primitive: "tool.dnd_api.local-dnd_get_class",
        input: { class_name: "cleric" },
        output: { class: "cleric" },
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 4,
        primitive: "lib.per_entity",
        input: { entityIds: ["fighter", "wizard", "cleric"] },
        output: [],
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
    ];
    const traj = buildTrajectory({ calls, mode: "novel" });
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "slot-local-error",
      existing: EMPTY_LIB,
    });
    expect(out.ok).toBe(true);
  });

  it("allows exact record fanout promotion from learned lookup replay rows", () => {
    const calls: TrajectoryRecord["calls"] = [
      {
        index: 0,
        primitive: "db.records.findExact",
        input: { family: "tvmaze-series-analyzer", limit: 3 },
        output: [
          { id: 1, recordKey: "tv:1", family: "tvmaze-series-analyzer", entity: 1, attributes: { id: 1 } },
          { id: 2, recordKey: "tv:2", family: "tvmaze-series-analyzer", entity: 2, attributes: { id: 2 } },
        ],
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 1,
        primitive: "tool.tvmaze_api.local-get_info",
        input: { show_id: 1 },
        output: { name: "A" },
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 2,
        primitive: "tool.tvmaze_api.local-get_info",
        input: { show_id: 2 },
        output: { name: "B" },
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 3,
        primitive: "lib.recordToolLookup",
        input: { recordFilter: {}, toolNames: ["local-get_info"] },
        output: [{ entityId: 1 }, { entityId: 2 }],
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
    ];
    const traj = buildTrajectory({ calls, mode: "novel" });
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "record-tool-replay",
      existing: {
        shapeHashes: new Set<string>(),
        learnedNames: new Set<string>(["recordToolLookup"]),
      },
    });
    expect(out.ok).toBe(true);
  });

  it("does not treat arbitrary one-character object ids as substrate flow", () => {
    const calls: TrajectoryRecord["calls"] = [
      {
        index: 0,
        primitive: "db.records.search",
        input: { limit: 1 },
        output: [{ id: "1", label: "one" }],
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 1,
        primitive: "tool.example.lookup",
        input: { id: "1" },
        output: { id: "1" },
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 2,
        primitive: "lib.per_entity",
        input: { rows: [{ id: "1" }] },
        output: [{ id: "1" }],
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
    ];
    const traj = buildTrajectory({ calls, mode: "novel" });
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "arbitrary-short-id",
      existing: EMPTY_LIB,
      subGraph: true,
      callsSlice: calls,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("data-flow check failed");
  });

  it("rejects trajectories with fewer than 2 calls", () => {
    const traj = buildTrajectory({ calls: [VALID_CALLS[0]!] });
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "x",
      existing: EMPTY_LIB,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("at least 2");
  });

  it("rejects when all calls share the same primitive", () => {
    const calls: TrajectoryRecord["calls"] = [
      { ...VALID_CALLS[0]!, index: 0 },
      { ...VALID_CALLS[0]!, index: 1 },
    ];
    const traj = buildTrajectory({ calls });
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "x",
      existing: EMPTY_LIB,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("distinct primitive");
  });

  it("approves pure repeated tool fan-out trajectories", () => {
    const calls: TrajectoryRecord["calls"] = [
      {
        index: 0,
        primitive: "tool.weather.get_current",
        input: { city: "Tokyo" },
        output: { temperature: 20 },
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 1,
        primitive: "tool.weather.get_current",
        input: { city: "London" },
        output: { temperature: 12 },
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 2,
        primitive: "tool.weather.get_current",
        input: { city: "Sydney" },
        output: { temperature: 24 },
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
    ];
    const traj = buildTrajectory({ calls, mode: "novel" });
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "pure-tool-fanout",
      existing: EMPTY_LIB,
      convergenceCount: 2,
      convergenceThreshold: 2,
    });
    expect(out.ok).toBe(true);
  });

  it("allows a learned record helper plus dependent fan-out tail to crystallise as a composite", () => {
    const calls: TrajectoryRecord["calls"] = [
      {
        index: 0,
        primitive: "db.records.findExact",
        input: { family: "world-bank-economic-snapshot" },
        output: [
          {
            id: "US",
            recordKey: "world-bank-economic-snapshot:US",
            family: "world-bank-economic-snapshot",
            entity: "US",
            label: "United States",
            attributes: { code: "US" },
          },
          {
            id: "GB",
            recordKey: "world-bank-economic-snapshot:GB",
            family: "world-bank-economic-snapshot",
            entity: "GB",
            label: "United Kingdom",
            attributes: { code: "GB" },
          },
        ],
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 1,
        primitive: "tool.worldbank.snapshot",
        input: { country_code: "US" },
        output: { country_code: "US" },
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 2,
        primitive: "tool.worldbank.snapshot",
        input: { country_code: "GB" },
        output: { country_code: "GB" },
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 3,
        primitive: "lib.recordToolFanout",
        input: { recordFilter: { family: "world-bank-economic-snapshot" } },
        output: { value: [] },
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 4,
        primitive: "tool.worldbank.indicator",
        input: { country_code: "US" },
        output: { inflation: 1 },
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 5,
        primitive: "tool.worldbank.indicator",
        input: { country_code: "GB" },
        output: { inflation: 2 },
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
    ];
    const traj = buildTrajectory({ calls, mode: "novel" });
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "record-plus-dependent-tail",
      existing: {
        shapeHashes: new Set(),
        learnedNames: new Set(["recordToolFanout"]),
      },
      convergenceCount: 2,
      convergenceThreshold: 2,
    });
    expect(out.ok).toBe(true);
  });

  it("allows a learned pure tool fan-out helper plus dependent fan-out tail to crystallise as enrichment", () => {
    const calls: TrajectoryRecord["calls"] = [
      {
        index: 0,
        primitive: "tool.pokemon_tools.local-pokemon_get_species",
        input: { pokemon_id: 25 },
        output: { species: { evolution_chain_id: 10 } },
        startedAt: new Date().toISOString(),
        durationMs: 0,
        scope: { depth: 1, callPath: ["lib.toolFanout"], parentPrimitive: "lib.toolFanout" },
      },
      {
        index: 1,
        primitive: "tool.pokemon_tools.local-pokemon_get_species",
        input: { pokemon_id: 6 },
        output: { species: { evolution_chain_id: 2 } },
        startedAt: new Date().toISOString(),
        durationMs: 0,
        scope: { depth: 1, callPath: ["lib.toolFanout"], parentPrimitive: "lib.toolFanout" },
      },
      {
        index: 2,
        primitive: "lib.toolFanout",
        input: { intent: "repeated tool fan-out" },
        output: { value: [] },
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 3,
        primitive: "tool.pokemon_tools.local-pokemon_get_evolution",
        input: { chain_id: 10 },
        output: { evolution_chain: { id: 10 } },
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 4,
        primitive: "tool.pokemon_tools.local-pokemon_get_evolution",
        input: { chain_id: 2 },
        output: { evolution_chain: { id: 2 } },
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
    ];
    const traj = buildTrajectory({ calls, mode: "interpreted" });
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "tool-fanout-plus-dependent-tail",
      existing: {
        shapeHashes: new Set(),
        learnedNames: new Set(["toolFanout"]),
      },
      convergenceCount: 2,
      convergenceThreshold: 2,
    });
    expect(out.ok).toBe(true);
  });

  it("localizes unrelated optional tool errors away from record-backed learning", () => {
    const calls: TrajectoryRecord["calls"] = [
      {
        index: 0,
        primitive: "db.records.findExact",
        input: { filter: { family: "dnd-campaign-builder" }, limit: 3 },
        output: [
          { id: "Human Fighter", entity: "Human Fighter", attributes: { class: "fighter" } },
          { id: "Elf Wizard", entity: "Elf Wizard", attributes: { class: "wizard" } },
        ],
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 1,
        primitive: "tool.dnd.getClass",
        input: { class_name: "Fighter" },
        output: { name: "Fighter" },
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 2,
        primitive: "tool.dnd.getCategory",
        input: { category: "weapons" },
        output: { error: "HTTP Error 404: Not Found", success: false },
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
      {
        index: 3,
        primitive: "tool.dnd.getClass",
        input: { class_name: "Wizard" },
        output: { name: "Wizard" },
        startedAt: new Date().toISOString(),
        durationMs: 0,
      },
    ];
    const traj = buildTrajectory({ calls, mode: "novel" });
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "dnd-direct-with-optional-error",
      existing: EMPTY_LIB,
      convergenceCount: 2,
      convergenceThreshold: 2,
    });
    expect(out.ok).toBe(true);
  });

  it("approves mode='novel' trajectories (first-time successful composition)", () => {
    const traj = buildTrajectory({ calls: VALID_CALLS, mode: "novel" });
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "fresh-novel",
      existing: EMPTY_LIB,
    });
    expect(out.ok).toBe(true);
  });

  it("rejects errored trajectories regardless of mode", () => {
    const traj = buildTrajectory({
      calls: VALID_CALLS,
      mode: "novel",
      errored: true,
    });
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "x",
      existing: EMPTY_LIB,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("errored");
  });

  it("rejects mode='llm-backed' (D-015: agent authors agent-backed functions)", () => {
    const traj = buildTrajectory({ calls: VALID_CALLS, mode: "llm-backed" });
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "x",
      existing: EMPTY_LIB,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("composition pattern");
  });

  it("rejects plan-phase trajectories because only committed artifacts can be learned from", () => {
    const traj = buildTrajectory({
      calls: VALID_CALLS,
      mode: "novel",
      phase: "plan",
      crystallisable: false,
    });
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "plan",
      existing: EMPTY_LIB,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("committed");
  });

  it("approves commit-phase trajectories only after answer validation accepts", () => {
    const traj = buildTrajectory({
      calls: VALID_CALLS,
      mode: "novel",
      phase: "commit",
      crystallisable: true,
      answerValidation: { accepted: true },
    });
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "commit",
      existing: EMPTY_LIB,
    });
    expect(out.ok).toBe(true);
  });

  it("rejects commit-phase trajectories when answer validation fails", () => {
    const traj = buildTrajectory({
      calls: VALID_CALLS,
      mode: "novel",
      phase: "commit",
      crystallisable: false,
      answerValidation: { accepted: false },
    });
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "commit",
      existing: EMPTY_LIB,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("validation");
  });

  it("rejects trajectories that already call a learned interface", () => {
    const calls: TrajectoryRecord["calls"] = [
      VALID_CALLS[0]!,
      {
        ...VALID_CALLS[1]!,
        primitive: "lib.rangeTableMetric",
      },
    ];
    const traj = buildTrajectory({ calls, mode: "interpreted" });
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "nested",
      existing: {
        shapeHashes: new Set<string>(),
        learnedNames: new Set<string>(["rangeTableMetric"]),
      },
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("reuse evidence");
  });

  it("still rejects legacy crystallise-prefixed learned calls", () => {
    const calls: TrajectoryRecord["calls"] = [
      VALID_CALLS[0]!,
      {
        ...VALID_CALLS[1]!,
        primitive: "lib.crystallise_pickfiling_deadbeef",
      },
    ];
    const traj = buildTrajectory({ calls, mode: "interpreted" });
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "nested-legacy",
      existing: EMPTY_LIB,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("reuse evidence");
  });

  it("rejects when no db.* call present", () => {
    const calls: TrajectoryRecord["calls"] = [
      { ...VALID_CALLS[1]!, index: 0 },
      {
        ...VALID_CALLS[1]!,
        index: 1,
        primitive: "lib.locateFigure",
      },
    ];
    const traj = buildTrajectory({ calls });
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "x",
      existing: EMPTY_LIB,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("substrate-rooted");
  });

  it("rejects when first db.* call's output isn't a list", () => {
    const calls: TrajectoryRecord["calls"] = [
      { ...VALID_CALLS[0]!, output: { filename: "x" } },
      VALID_CALLS[1]!,
    ];
    const traj = buildTrajectory({ calls });
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "x",
      existing: EMPTY_LIB,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("did not return a list");
  });

  it("rejects when shape-hash already learned", () => {
    const traj = buildTrajectory({ calls: VALID_CALLS });
    const existing: LibrarySnapshot = {
      shapeHashes: new Set<string>(["fresh"]),
      learnedNames: new Set<string>(["rangeTableMetric"]),
    };
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "fresh",
      existing,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("already learned");
  });

  it("rejects when a call output has an error key", () => {
    const calls: TrajectoryRecord["calls"] = [
      VALID_CALLS[0]!,
      {
        ...VALID_CALLS[1]!,
        output: { error: "could not pick" },
      },
    ];
    const traj = buildTrajectory({ calls });
    const out = shouldCrystallise({
      trajectory: traj,
      shapeHash: "x",
      existing: EMPTY_LIB,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("error");
  });
});
