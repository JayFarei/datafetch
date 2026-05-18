import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildFanoutToolPlan,
  buildPureToolEnrichmentPlan,
  buildPureToolFanoutPlan,
  inferPureFanoutEntityValuesFromTaskMarkdown,
  isTransferableHelperSource,
  prepareAnswerSourceForRuntime,
  renderColdStartFanoutGuidance,
  renderAnswerScaffold,
  renderInputHygieneRules,
  renderLearnedReuseSurface,
  renderRecordIntentHelperSource,
  renderTaskLiteralHints,
  rewriteHyphenatedLocalPropertyAccess,
} from "../src/eval/skillcraftFullDatafetch.js";
import {
  renderAnswerKitSource,
  rewriteMixedNullishLogicalExpressions,
  rewriteUnsafeStringCoercionCalls,
} from "../src/runtime/answerKit.js";

function task(family: string, toolsUsed: string[], bundle = "api"): any {
  return {
    taskKey: `scaled_tasks/${family}/e1`,
    family,
    expectedOutputFiles: ["out.json"],
    taskConfig: {
      meta: {
        tools_used: toolsUsed,
        expected_repetitions: 3,
      },
      needed_local_tools: [bundle],
    },
  };
}

function dfDts(bundle: string, tools: string[]): string {
  return [
    "declare const df: {",
    "  db: { records: { findExact(filter: Record<string, unknown>, limit?: number): Promise<any[]> } };",
    "  tool: {",
    `    ${bundle}: {`,
    ...tools,
    "    };",
    "  };",
    "  lib: { recordToolFanout(input: any): Promise<any>; };",
    "};",
  ].join("\n");
}

describe("Goal 4 fanout planner", () => {
  it("treats parameterised pure fan-out enrichment helpers as cross-family transferable", () => {
    const source = [
      "// @intent-signature: FANOUT(tool)→lib→FANOUT(tool)",
      "type InternalToolEnrichmentPlan = {};",
      "async function body(plan: any) {",
      "  await df.lib.toolFanout({ toolBundle: plan.toolBundle });",
      "  const bundle = df.tool[plan.dependentToolBundle ?? plan.toolBundle ?? \"\"];",
      "  return bundle;",
      "}",
    ].join("\n");
    expect(isTransferableHelperSource(source)).toBe(true);
  });

  it("does not transfer concrete or non-parameterised enrichment helpers", () => {
    const source = [
      "// @intent-signature: FANOUT(tool)→lib→FANOUT(tool)",
      "type InternalToolEnrichmentPlan = {};",
      "async function body() {",
      "  return df.tool.pokemon_tools.local_pokemon_get_species({ pokemon_id: 25 });",
      "}",
    ].join("\n");
    expect(isTransferableHelperSource(source)).toBe(false);
  });

  it("maps one-param tools to the concrete record field instead of hard-coding id", () => {
    const plan = buildFanoutToolPlan(
      task("world-bank-economic-snapshot", [
        "worldbank_country_info",
        "worldbank_gdp",
        "worldbank_indicator",
      ], "worldbank_api"),
      dfDts("worldbank_api", [
        '      "local-worldbank_country_info"(input: { "country_code": string }): Promise<any>;',
        '      "local-worldbank_gdp"(input: { "country_code": string }): Promise<any>;',
        '      "local-worldbank_indicator"(input: { "country_code": string; "indicator": string }): Promise<any>;',
      ]),
      [{
        id: "United States",
        entity: "United States",
        recordKey: "world-bank-economic-snapshot:United States",
        family: "world-bank-economic-snapshot",
        label: "US",
        attributes: { name: "United States", code: "US" },
      }],
    );

    expect(plan.sameEntityToolNames).toEqual([
      "local-worldbank_country_info",
      "local-worldbank_gdp",
    ]);
    expect(plan.dependentToolNames).toEqual(["local-worldbank_indicator"]);
    expect(plan.entityField).toBe("code");
    expect(plan.recordParamMapByTool).toEqual({
      "local-worldbank_country_info": { country_code: "code" },
      "local-worldbank_gdp": { country_code: "code" },
    });
  });

  it("admits multi-field record-backed tools only when every required input is on the record", () => {
    const plan = buildFanoutToolPlan(
      task("usgs-earthquake-monitor", [
        "usgs_query_earthquakes",
        "usgs_get_region_stats",
      ], "usgs_earthquake_api"),
      dfDts("usgs_earthquake_api", [
        '      "local-usgs_query_earthquakes"(input: { "latitude": number; "longitude": number; "radius_km"?: number }): Promise<any>;',
        '      "local-usgs_get_region_stats"(input: { "latitude": number; "longitude": number; "radius_km"?: number }): Promise<any>;',
      ]),
      [{
        id: "Tokyo, Japan",
        entity: "Tokyo, Japan",
        recordKey: "usgs-earthquake-monitor:Tokyo, Japan",
        family: "usgs-earthquake-monitor",
        label: "Tokyo, Japan",
        attributes: { name: "Tokyo, Japan", latitude: 35.6895, longitude: 139.6917 },
      }],
    );

    expect(plan.sameEntityToolNames).toEqual([
      "local-usgs_query_earthquakes",
      "local-usgs_get_region_stats",
    ]);
    expect(plan.recordParamMapByTool).toEqual({
      "local-usgs_query_earthquakes": { latitude: "latitude", longitude: "longitude" },
      "local-usgs_get_region_stats": { latitude: "latitude", longitude: "longitude" },
    });
  });

  it("fails closed when task tools do not have a record-backed input contract", () => {
    const plan = buildFanoutToolPlan(
      task("random-user-database", [
        "randomuser_profile",
      ], "randomuser_api"),
      dfDts("randomuser_api", [
        '      "local-randomuser_profile"(input: { "email": string }): Promise<any>;',
      ]),
      [{
        id: "US",
        entity: "US",
        recordKey: "random-user-database:US",
        family: "random-user-database",
        label: "United States",
        attributes: { code: "US", name: "United States" },
      }],
    );

    expect(plan.sameEntityToolNames).toEqual([]);
    const surface = renderLearnedReuseSurface(
      task("random-user-database", ["randomuser_profile"], "randomuser_api"),
      dfDts("randomuser_api", [
        '      "local-randomuser_profile"(input: { "email": string }): Promise<any>;',
      ]),
      [{
        id: "US",
        entity: "US",
        recordKey: "random-user-database:US",
        family: "random-user-database",
        label: "United States",
        attributes: { code: "US", name: "United States" },
      }],
    );
    expect(surface).toContain("No verified record-backed fan-out call shape");
    expect(surface).toContain("const records = await df.db.records.findExact");
    expect(surface).not.toContain("const rows = rowsOf(await df.lib.recordToolFanout({");
  });

  it("selects a learned pure tool fanout group by shared required parameter", () => {
    const plan = buildPureToolFanoutPlan(
      task("pokeapi-pokedex", [
        "pokemon_get_details",
        "pokemon_get_species",
        "pokemon_get_evolution",
        "pokemon_get_moves",
        "pokemon_get_abilities",
      ], "pokemon_tools"),
      [
        "declare const df: {",
        "  tool: { pokemon_tools: {",
        '    "local-pokemon_get_details"(input: { "pokemon_id": string }): Promise<any>;',
        '    "local-pokemon_get_species"(input: { "pokemon_id": string }): Promise<any>;',
        '    "local-pokemon_get_evolution"(input: { "chain_id": number }): Promise<any>;',
        '    "local-pokemon_get_moves"(input: { "pokemon_id": string }): Promise<any>;',
        '    "local-pokemon_get_abilities"(input: { "ability_names": unknown[] }): Promise<any>;',
        "  } };",
        '  lib: { "toolFanout"(input: any): Promise<any>; };',
        "};",
      ].join("\n"),
    );

    expect(plan).toMatchObject({
      toolBundle: "pokemon_tools",
      paramName: "pokemon_id",
      toolNames: [
        "local-pokemon_get_details",
        "local-pokemon_get_species",
        "local-pokemon_get_moves",
      ],
      dependentToolNames: [
        "local-pokemon_get_evolution",
        "local-pokemon_get_abilities",
      ],
    });
  });

  it("infers pure tool fanout entity values from markdown ID tables", () => {
    const values = inferPureFanoutEntityValuesFromTaskMarkdown([
      "## Pokemon to Analyze",
      "",
      "| # | ID | Name | Type |",
      "|---|-----|------|------|",
      "| 1 | 25 | Pikachu | Electric |",
      "| 2 | 6 | Charizard | Fire/Flying |",
      "| 3 | 445 | Garchomp | Dragon/Ground |",
      "| 4 | 94 | Gengar | Ghost/Poison |",
      "| 5 | 150 | Mewtwo | Psychic |",
    ].join("\n"), "pokemon_id");

    expect(values).toEqual([25, 6, 445, 94, 150]);
  });

  it("plans pure tool fanout dependent enrichment with per-tool dependent params", () => {
    const plan = buildPureToolEnrichmentPlan(
      task("pokeapi-pokedex", [
        "pokemon_get_details",
        "pokemon_get_species",
        "pokemon_get_evolution",
        "pokemon_get_moves",
        "pokemon_get_abilities",
      ], "pokemon_tools"),
      [
        "declare const df: {",
        "  tool: { pokemon_tools: {",
        '    "local-pokemon_get_details"(input: { "pokemon_id": string }): Promise<any>;',
        '    "local-pokemon_get_species"(input: { "pokemon_id": string }): Promise<any>;',
        '    "local-pokemon_get_evolution"(input: { "chain_id": number }): Promise<any>;',
        '    "local-pokemon_get_moves"(input: { "pokemon_id": string }): Promise<any>;',
        '    "local-pokemon_get_abilities"(input: { "ability_names": unknown[] }): Promise<any>;',
        "  } };",
        '  lib: { "toolFanoutEnrichment"(input: any): Promise<any>; "toolFanout"(input: any): Promise<any>; };',
        "};",
      ].join("\n"),
    );

    expect(plan).toMatchObject({
      toolBundle: "pokemon_tools",
      paramName: "pokemon_id",
      toolNames: [
        "local-pokemon_get_details",
        "local-pokemon_get_species",
        "local-pokemon_get_moves",
      ],
      dependentToolNames: [
        "local-pokemon_get_evolution",
        "local-pokemon_get_abilities",
      ],
      dependentParamByTool: {
        "local-pokemon_get_evolution": "chain_id",
        "local-pokemon_get_abilities": "ability_names",
      },
    });
    expect(plan?.dependentValuePathsByTool["local-pokemon_get_abilities"]).toContain(
      "tools.local-pokemon_get_details.abilities",
    );
  });

  it("allows a single base fanout tool when dependent tools remain", () => {
    const plan = buildPureToolFanoutPlan(
      task("pokeapi-pokedex", [
        "pokemon_get_species",
        "pokemon_get_evolution",
        "pokemon_get_abilities",
      ], "pokemon_tools"),
      [
        "declare const df: {",
        "  tool: { pokemon_tools: {",
        '    "local-pokemon_get_species"(input: { "pokemon_id": string }): Promise<any>;',
        '    "local-pokemon_get_evolution"(input: { "chain_id": number }): Promise<any>;',
        '    "local-pokemon_get_abilities"(input: { "ability_names": unknown[] }): Promise<any>;',
        "  } };",
        '  lib: { "toolFanout"(input: any): Promise<any>; };',
        "};",
      ].join("\n"),
    );

    expect(plan).toMatchObject({
      toolNames: ["local-pokemon_get_species"],
      dependentToolNames: [
        "local-pokemon_get_evolution",
        "local-pokemon_get_abilities",
      ],
      paramName: "pokemon_id",
    });
  });

  it("renders learned reuse setup for direct record lookup helpers", () => {
    const surface = renderLearnedReuseSurface(
      task("dnd-campaign-builder", ["dnd_get_race"], "dnd_api"),
      [
        "declare const df: {",
        "  db: { records: { findExact(filter: Record<string, unknown>, limit?: number): Promise<any[]> } };",
        "  tool: { dnd_api: {",
        '    "local-dnd_get_race"(input: { "race_name": string }): Promise<any>;',
        "  } };",
        "  lib: { recordToolLookup(input: any): Promise<any>; };",
        "};",
      ].join("\n"),
      [{
        id: "Human Fighter",
        entity: "Human Fighter",
        recordKey: "dnd-campaign-builder:Human Fighter",
        family: "dnd-campaign-builder",
        label: "Human Fighter",
        attributes: { race: "Human", class: "Fighter" },
      }],
      "recordToolLookup",
    );

    expect(surface).toContain('import { getRowTool, loadRecordIntentRows } from "./datafetch_record_intent.ts";');
    expect(surface).toContain("const rows = await loadRecordIntentRows();");
    expect(surface).toContain("recordToolLookup(input: Record<string, unknown>)");
    expect(surface).not.toContain("recordParamMapByTool");
    expect(surface).not.toContain("df.lib.recordToolFanout({");
  });

  it("keeps the learned public surface intent-shaped while hiding tool plumbing in the internal plan", () => {
    const surface = renderLearnedReuseSurface(
      task("world-bank-economic-snapshot", [
        "worldbank_country_info",
        "worldbank_gdp",
        "worldbank_indicator",
      ], "worldbank_api"),
      dfDts("worldbank_api", [
        '      "local-worldbank_country_info"(input: { "country_code": string }): Promise<any>;',
        '      "local-worldbank_gdp"(input: { "country_code": string }): Promise<any>;',
        '      "local-worldbank_indicator"(input: { "country_code": string; "indicator": string }): Promise<any>;',
      ]),
      [{
        id: "United States",
        entity: "United States",
        recordKey: "world-bank-economic-snapshot:United States",
        family: "world-bank-economic-snapshot",
        label: "US",
        attributes: { name: "United States", code: "US" },
      }],
    );

    const libDeclaration = surface.split("\n").find((line) => line.includes("recordToolFanout(input:"));
    expect(libDeclaration).toBe('    recordToolFanout(input: Record<string, unknown>): Promise<{ value: any[] }>;');
    expect(surface).toContain('import { getRowTool, loadRecordIntentRows } from "./datafetch_record_intent.ts";');
    expect(surface).toContain("const rows = await loadRecordIntentRows();");
    expect(surface).not.toContain("const __datafetchRecordIntentPlan = {");
    expect(surface).not.toContain('const __datafetchIntentEntityField = "code";');
    expect(surface).not.toContain("recordParamMapByTool");
    expect(surface).not.toContain("Suggested learned-helper call shape");
    expect(surface).not.toContain("paramByTool?: Record<string, string>");
    expect(surface).not.toContain("recordParamMapByTool?: Record<string, Record<string, string>>");
  });

  it("renders record/tool plumbing only inside the internal record intent helper", () => {
    const plan = buildFanoutToolPlan(
      task("world-bank-economic-snapshot", [
        "worldbank_country_info",
        "worldbank_gdp",
      ], "worldbank_api"),
      dfDts("worldbank_api", [
        '      "local-worldbank_country_info"(input: { "country_code": string }): Promise<any>;',
        '      "local-worldbank_gdp"(input: { "country_code": string }): Promise<any>;',
      ]),
      [{
        id: "United States",
        entity: "United States",
        recordKey: "world-bank-economic-snapshot:United States",
        family: "world-bank-economic-snapshot",
        label: "US",
        attributes: { name: "United States", code: "US" },
      }],
    );

    const helper = renderRecordIntentHelperSource({
      task: task("world-bank-economic-snapshot", ["worldbank_country_info", "worldbank_gdp"], "worldbank_api"),
      learnedRecordHelperName: "recordToolFanout",
      plan,
      toolBundle: "worldbank_api",
      expectedRepetitions: 3,
    });

    expect(helper).toContain("const __datafetchRecordIntentPlan = {");
    expect(helper).toContain("recordParamMapByTool");
    expect(helper).toContain("export const loadRecordIntentRows");
    expect(helper).toContain("export const getRowTool");
    expect(helper).toContain('const recordLabel = g(row, "label", "record.label", "record.entity", "entity", "entityValue", "id");');
    expect(helper).toContain("label: row.label ?? recordLabel");
    expect(helper).not.toContain("label: intentEntity || row.label");
  });

  it("renders cold-start seed fanout inside the internal record intent helper", () => {
    const taskInput = task("world-bank-economic-snapshot", ["worldbank_gdp"], "worldbank_api");
    const plan = buildFanoutToolPlan(
      taskInput,
      dfDts("worldbank_api", [
        '      "local-worldbank_gdp"(input: { "country_code": string }): Promise<any>;',
      ]),
      [{
        id: "United States",
        entity: "United States",
        recordKey: "world-bank-economic-snapshot:United States",
        family: "world-bank-economic-snapshot",
        label: "US",
        attributes: { name: "United States", code: "US" },
      }],
    );

    const helper = renderRecordIntentHelperSource({
      task: taskInput,
      learnedRecordHelperName: "per_entity",
      plan,
      toolBundle: "worldbank_api",
      expectedRepetitions: 3,
    });

    expect(helper).toContain("df.db.records.findExact");
    expect(helper).toContain("df.lib.per_entity({");
    expect(helper).toContain("entityIds: records.map");
    expect(helper).toContain('toolNames: ["local-worldbank_gdp"]');
    expect(helper).toContain("export const loadRecordIntentRows");
  });

  it("keeps cold per_entity tools on one record field", () => {
    const guidance = renderColdStartFanoutGuidance(
      task("dnd-campaign-builder", [
        "dnd_get_class",
        "dnd_get_race",
        "dnd_get_class_spells",
      ], "dnd_api"),
      [
        "declare const df: {",
        "  db: { records: { findExact(filter: Record<string, unknown>, limit?: number): Promise<any[]> } };",
        "  tool: { dnd_api: {",
        '      "local-dnd_get_class"(input: { "class_name": string }): Promise<any>;',
        '      "local-dnd_get_race"(input: { "race_name": string }): Promise<any>;',
        '      "local-dnd_get_class_spells"(input: { "class_name": string }): Promise<any>;',
        "  } };",
        "  lib: { per_entity(input: any): Promise<any>; };",
        "};",
      ].join("\n"),
      [{
        id: "Human Fighter",
        entity: "Human Fighter",
        recordKey: "dnd-campaign-builder:Human Fighter",
        family: "dnd-campaign-builder",
        label: "fighter",
        attributes: { race: "human", class: "fighter" },
      }],
    );

    const setup = guidance.block.split("```ts")[1] ?? guidance.block;
    expect(setup).toContain('entityIds: records.map((r: any) => g(r, "attributes.class", "class", "entity", "id"))');
    expect(setup).toContain('toolNames: ["local-dnd_get_class", "local-dnd_get_class_spells"]');
    expect(setup).not.toContain("local-dnd_get_race");
    expect(setup).not.toContain("paramByTool");
  });

  it("maps nationality parameters to mounted country code records", () => {
    const plan = buildFanoutToolPlan(
      task("random-user-database", [
        "randomuser_by_nationality",
      ], "randomuser_api"),
      dfDts("randomuser_api", [
        '      "local-randomuser_by_nationality"(input: { "nationality": string; "count"?: number }): Promise<any>;',
      ]),
      [{
        id: "US",
        entity: "US",
        recordKey: "random-user-database:US",
        family: "random-user-database",
        label: "United States",
        attributes: { code: "US", name: "United States" },
      }],
    );

    expect(plan.sameEntityToolNames).toEqual(["local-randomuser_by_nationality"]);
    expect(plan.entityField).toBe("code");
    expect(plan.recordParamMapByTool).toEqual({
      "local-randomuser_by_nationality": { nationality: "code" },
    });
  });

  it("admits all-optional tools only when a record-backed scope parameter is available", () => {
    const plan = buildFanoutToolPlan(
      task("university-directory-builder", [
        "university_search",
        "university_details",
      ], "university_api"),
      dfDts("university_api", [
        '      "local-university_search"(input: { "country"?: string; "name"?: string }): Promise<any>;',
        '      "local-university_details"(input: { "name": string; "country"?: string }): Promise<any>;',
      ]),
      [{
        id: "Canada",
        entity: "Canada",
        recordKey: "university-directory-builder:Canada",
        family: "university-directory-builder",
        label: "CA",
        attributes: { country: "Canada", alpha_code: "CA" },
      }],
    );

    expect(plan.sameEntityToolNames).toEqual(["local-university_search"]);
    expect(plan.dependentToolNames).toEqual(["local-university_details"]);
    expect(plan.recordParamMapByTool).toEqual({
      "local-university_search": { country: "country" },
    });
  });

  it("rewrites per_entity record id maps to the verified tool parameter field", async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), "df-per-entity-rewrite-"));
    await writeFile(path.join(workspace, ".datafetch-ctx.json"), JSON.stringify({
      records: [
        {
          id: "Human Fighter",
          entity: "Human Fighter",
          recordKey: "dnd-campaign-builder:Human Fighter",
          family: "dnd-campaign-builder",
          label: "fighter",
          attributes: { class: "fighter", race: "human" },
        },
      ],
    }));
    const source = [
      "const recs = await df.db.records.findExact({ family: \"dnd-campaign-builder\" }, 3);",
      "const ids = recs.map((r: any) => r.id).filter(Boolean);",
      "await df.lib.per_entity({",
      "  entityIds: ids,",
      "  toolBundle: \"dnd_api\",",
      "  toolNames: [\"local-dnd_get_class\"],",
      "  paramName: \"class_name\",",
      "});",
      "return df.answer({ status: \"answered\" });",
    ].join("\n");

    const prepared = prepareAnswerSourceForRuntime(source, workspace);

    expect(prepared).toContain('const ids = recs.map((r: any) => g(r, "attributes.class", "class", "entity", "id")).filter(Boolean)');
    expect(prepared).not.toContain("=> r.id).filter(Boolean)");
  });

  it("keeps id-based positive controls while omitting optional search fanout", () => {
    const plan = buildFanoutToolPlan(
      task("rickmorty-multiverse-explorer", [
        "rickmorty_get_character",
        "rickmorty_search_characters",
      ], "rickmorty_api"),
      dfDts("rickmorty_api", [
        '      "local-rickmorty_get_character"(input: { "character_id": number }): Promise<any>;',
        '      "local-rickmorty_search_characters"(input: { "name"?: string; "status"?: string }): Promise<any>;',
      ]),
      [{
        id: "1",
        entity: "1",
        recordKey: "rickmorty-multiverse-explorer:1",
        family: "rickmorty-multiverse-explorer",
        label: "Rick Sanchez",
        attributes: { id: 1, name: "Rick Sanchez" },
      }],
    );

    expect(plan.sameEntityToolNames).toEqual(["local-rickmorty_get_character"]);
    expect(plan.dependentToolNames).toEqual(["local-rickmorty_search_characters"]);
  });

  it("does not recommend the per_entity seed when no single-field record contract exists", () => {
    const guidance = renderColdStartFanoutGuidance(
      task("random-user-database", ["randomuser_profile"], "randomuser_api"),
      dfDts("randomuser_api", [
        '      "local-randomuser_profile"(input: { "email": string }): Promise<any>;',
      ]) + "\nper_entity",
      [{
        id: "US",
        entity: "US",
        recordKey: "random-user-database:US",
        family: "random-user-database",
        label: "United States",
        attributes: { code: "US", name: "United States" },
      }],
    );

    expect(guidance.rules.join("\n")).toContain("Do not call `df.lib.per_entity`");
    expect(guidance.block).toContain("No verified single-field record fan-out");
    expect(guidance.block).not.toContain("df.lib.per_entity({");
  });

  it("keeps the per_entity seed recommendation for verified single-field fanout", () => {
    const guidance = renderColdStartFanoutGuidance(
      task("world-bank-economic-snapshot", ["worldbank_gdp"], "worldbank_api"),
      dfDts("worldbank_api", [
        '      "local-worldbank_gdp"(input: { "country_code": string }): Promise<any>;',
      ]) + "\nper_entity",
      [{
        id: "United States",
        entity: "United States",
        recordKey: "world-bank-economic-snapshot:United States",
        family: "world-bank-economic-snapshot",
        label: "US",
        attributes: { name: "United States", code: "US" },
      }],
    );

    expect(guidance.rules.join("\n")).toContain("verified single-field tools");
    expect(guidance.block).toContain("df.lib.per_entity({");
    expect(guidance.block).toContain('entityIds: records.map((r: any) => g(r, "attributes.code", "code", "entity", "id"))');
  });
});

describe("Goal 4 answer builder hardening", () => {
  it("rewrites optional chained hyphenated local tool keys", () => {
    expect(rewriteHyphenatedLocalPropertyAccess("r?.local-cocktail_details + row.tools?.local-worldbank_gdp + byId[c]?.local-worldbank_gdp + { local-rickmorty_get_character: \"id\" }"))
      .toBe('r?.["local-cocktail_details"] + row.tools?.["local-worldbank_gdp"] + byId[c]?.["local-worldbank_gdp"] + { "local-rickmorty_get_character": "id" }');
  });

  it("injects missing answer-kit imports for bare helper calls", () => {
    const prepared = prepareAnswerSourceForRuntime("const x = g(row, \"a\"); await writeJson(\"out.json\", x);", "/tmp/ws");
    expect(prepared).toContain('import { g, writeJson } from "./datafetch_answer_kit.ts";');
  });

  it("expands partial answer-kit imports when generated code uses another helper", () => {
    const prepared = prepareAnswerSourceForRuntime(
      'import { g } from "./datafetch_answer_kit.ts";\nconst xs = arr(g(row, "items", []));',
      "/tmp/ws",
    );
    expect(prepared).toContain('import { g, arr } from "./datafetch_answer_kit.ts";');
  });

  it("does not inject an answer-kit import when a helper is locally declared", () => {
    const prepared = prepareAnswerSourceForRuntime("const g = (x: any) => x; const x = g(row);", "/tmp/ws");
    expect(prepared).not.toContain("datafetch_answer_kit");
  });

  it("renames a late local g helper when rewrites introduce earlier g calls", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "datafetch-late-g-shadow-"));
    await writeFile(
      path.join(dir, ".datafetch-ctx.json"),
      JSON.stringify({
        records: [
          {
            id: "Tokyo",
            entity: "Tokyo",
            recordKey: "usgs:Tokyo",
            family: "usgs-earthquake-monitor",
            label: "Tokyo",
            attributes: { name: "Tokyo", latitude: 1, longitude: 2 },
          },
          {
            id: "Santiago",
            entity: "Santiago",
            recordKey: "usgs:Santiago",
            family: "usgs-earthquake-monitor",
            label: "Santiago",
            attributes: { name: "Santiago", latitude: 3, longitude: 4 },
          },
        ],
      }),
      "utf8",
    );

    const prepared = prepareAnswerSourceForRuntime(
      [
        'const regions = [{ name: "Tokyo" }, { name: "Santiago" }];',
        'await df.tool.usgs["local-usgs_query_earthquakes"]({ latitude: regions[0].latitude, longitude: regions[0].longitude });',
        "const g = (o: any, ...paths: any[]) => paths[paths.length - 1];",
      ].join("\n"),
      dir,
    );

    expect(prepared).toContain('import { g } from "./datafetch_answer_kit.ts";');
    expect(prepared).toContain("const __localG =");
    expect(prepared.indexOf("g(r,")).toBeLessThan(prepared.indexOf("const __localG ="));
  });

  it("removes df destructuring that shadows answer-kit helpers", () => {
    const prepared = prepareAnswerSourceForRuntime(
      [
        "const { g, arr } = df as any;",
        "const rows = arr(g(value, \"items\", []));",
      ].join("\n"),
      "/tmp/ws",
    );

    expect(prepared).toContain('import { g, arr } from "./datafetch_answer_kit.ts";');
    expect(prepared).not.toContain("const { g, arr } = df as any");
  });

  it("keeps failed tool envelopes out of answer fields", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "datafetch-answer-kit-"));
    const kitPath = path.join(dir, "datafetch_answer_kit.ts");
    await writeFile(kitPath, renderAnswerKitSource(), "utf8");
    const kit = await import(`${pathToFileURL(kitPath).href}?t=${Date.now()}`) as {
      g: (row: unknown, ...choices: unknown[]) => unknown;
      arr: (row: unknown) => unknown[];
    };

    const errorEnvelope = { success: false, error: "HTTP Error 429: Too Many Requests" };
    expect(kit.g(errorEnvelope, "name", "show.name", "")).toBe("");
    expect(kit.g(errorEnvelope, "character", "show", errorEnvelope)).toBeUndefined();
    expect(kit.arr(errorEnvelope)).toEqual([]);
    expect(kit.g({ character: { name: "Rick Sanchez" } }, "character.name")).toBe("Rick Sanchez");
    expect(kit.g({ attributes: {} }, "attributes.status", "entity.status", "unknown")).toBe("unknown");
  });

  it("unwrap() strips single-key entity-named wrappers like {pokemon: {...}}", async () => {
    // Regression for goal4-p1 pokeapi/m1: tool responses shaped like
    // {pokemon: {id, name, types, ...}} were not unwrapped by the prior
    // envelope-keys allowlist (it had `value`/`data`/`result` but not
    // entity-named keys, which were correctly removed as benchmark
    // identifiers). The generic single-non-metadata-key rule covers
    // the same cases without smuggling benchmark identifiers back in.
    const dir = await mkdtemp(path.join(tmpdir(), "datafetch-answer-kit-unwrap-"));
    const kitPath = path.join(dir, "datafetch_answer_kit.ts");
    await writeFile(kitPath, renderAnswerKitSource(), "utf8");
    const kit = await import(`${pathToFileURL(kitPath).href}?t=${Date.now()}`) as {
      unwrap: (x: unknown) => unknown;
      g: (row: unknown, ...choices: unknown[]) => unknown;
    };

    // The failing pokeapi/m1 shape: a single entity-named key whose
    // value is an object. Must unwrap to the inner object.
    expect(kit.unwrap({ pokemon: { id: 25, name: "pikachu", types: ["electric"] } }))
      .toEqual({ id: 25, name: "pikachu", types: ["electric"] });
    // Idempotency: unwrapping an already-unwrapped object returns it unchanged.
    expect(kit.unwrap({ id: 25, name: "pikachu", types: ["electric"] }))
      .toEqual({ id: 25, name: "pikachu", types: ["electric"] });
    // The same case via g() (the documented agent surface): after the
    // fix, g(unwrap(resp), "name") returns the inner name, not undefined.
    expect(kit.g(kit.unwrap({ show: { name: "the-office", year: 2005 } }), "name")).toBe("the-office");
    expect(kit.g(kit.unwrap({ university: { id: 7, country: "US" } }), "country")).toBe("US");

    // Do not over-unwrap: more than one non-metadata key means we can't
    // safely guess which is the payload — return the wrapper unchanged.
    expect(kit.unwrap({ pokemon: { id: 25 }, species: { id: 25 } }))
      .toEqual({ pokemon: { id: 25 }, species: { id: 25 } });
    // Do not unwrap when the single value is a primitive (the wrapper
    // IS the payload then — e.g. a count or scalar response).
    expect(kit.unwrap({ count: 5 })).toEqual({ count: 5 });
    expect(kit.unwrap({ name: "siamese" })).toEqual({ name: "siamese" });
    // Existing success/ok envelope and named-envelope-key rules still fire.
    expect(kit.unwrap({ success: true, pokemon: { id: 25 } })).toEqual({ id: 25 });
    expect(kit.unwrap({ value: { id: 25 } })).toEqual({ id: 25 });
    // Error envelope still returns undefined.
    expect(kit.unwrap({ success: false, error: "boom" })).toBeUndefined();
    // Arrays and primitives pass through unchanged.
    expect(kit.unwrap([1, 2, 3])).toEqual([1, 2, 3]);
    expect(kit.unwrap("hello")).toBe("hello");
    expect(kit.unwrap(null)).toBe(null);
  });

  it("guards record lookup probes that can throw when no record mount exists", () => {
    const prepared = prepareAnswerSourceForRuntime(
      [
        "const db: any = (df as any).db;",
        "const dfAny = df as any;",
        "const recs = (await db?.records?.findExact?.({ family: \"pokeapi-pokedex\" }, 3)) ?? [];",
        "const r = (df as any).db?.records;",
        "if (r?.findExact) await r.findExact({ family: \"pokeapi-pokedex\" }, 3);",
        "if ((df as any).db?.records?.findExact) await (df as any).db?.records?.findExact?.({ family: \"openmeteo-weather\" }, 4);",
        "if (dfAny.db?.records?.findExact) await dfAny.db.records.findExact({ family: \"openmeteo-weather\" }, 3);",
        "const guarded = (df as any).db?.records ? await safeRecordsFindExact({ family: \"openmeteo-weather\" }, 2) : [];",
        "const maybe = (df as any).db?.records?.findExact ? await safeRecordsFindExact({ family: \"openmeteo-weather\" }, 3) : [];",
        "if ((df as any).db?.records) await safeRecordsFindExact({ family: \"pokeapi-pokedex\" }, 4);",
        "if (dfAny.db?.records) await safeRecordsFindExact({ family: \"random-user-database\" }, 3);",
        "const other = await df.db.records.findExact({ family: \"world-bank-economic-snapshot\" }, 3);",
      ].join("\n"),
      "/tmp/ws",
    );

    expect(prepared).toContain("const safeRecordsFindExact = async");
    expect(prepared).toContain("ident not found across mounts");
    expect(prepared).toContain("const db = { records: { findExact: safeRecordsFindExact } };");
    expect(prepared).toContain("const r = { findExact: safeRecordsFindExact };");
    expect(prepared).toContain("const maybe = safeRecordsFindExact ? await safeRecordsFindExact");
    expect(prepared).toContain("await safeRecordsFindExact({ family: \"world-bank-economic-snapshot\" }, 3)");
    expect(prepared).toContain("await safeRecordsFindExact({ family: \"openmeteo-weather\" }, 4)");
    expect(prepared).toContain("await safeRecordsFindExact({ family: \"openmeteo-weather\" }, 3)");
    expect(prepared).toContain("const guarded = safeRecordsFindExact ? await safeRecordsFindExact");
    expect(prepared).toContain("await safeRecordsFindExact({ family: \"pokeapi-pokedex\" }, 4)");
    expect(prepared).toContain("await safeRecordsFindExact({ family: \"random-user-database\" }, 3)");
    expect(prepared).not.toContain("df.db.records.findExact");
    expect(prepared).not.toContain("dfAny.db");
    expect(prepared).not.toContain("(df as any).db?.records ?");
    expect(prepared).not.toContain("if ((df as any).db?.records)");
    expect(prepared).not.toContain("const db = (df as any).db");
    expect(prepared).not.toContain("const r = (df as any).db?.records");
    expect(prepared).not.toContain("if ((df as any).db?.records?.findExact)");
    expect(prepared).not.toContain("const maybe = (df as any).db?.records?.findExact");
  });

  it("drops generated imports from the non-existent local datafetch module", () => {
    const prepared = prepareAnswerSourceForRuntime(
      [
        'import { df } from "./datafetch.ts";',
        'import { g } from "./datafetch_answer_kit.ts";',
        "const x = g(row, \"name\", \"\");",
        "df.answer({ status: \"answered\", value: x });",
      ].join("\n"),
      "/tmp/ws",
    );

    expect(prepared).not.toContain('from "./datafetch.ts"');
    expect(prepared).toContain('import { g } from "./datafetch_answer_kit.ts";');
    expect(prepared).toContain("df.answer({ status: \"answered\", value: x })");
  });

  it("normalizes CommonJS fs/promises and df answer-kit helper calls", () => {
    const prepared = prepareAnswerSourceForRuntime(
      [
        "const fs = require(\"fs/promises\");",
        "const value = df.g(row, \"name\", \"\");",
        "await fs.writeFile(\"out.json\", JSON.stringify(value));",
      ].join("\n"),
      "/tmp/ws",
    );

    expect(prepared).toContain("import * as fs from \"node:fs/promises\";");
    expect(prepared).toContain('import { g } from "./datafetch_answer_kit.ts";');
    expect(prepared).toContain("const value = g(row, \"name\", \"\")");
    expect(prepared).not.toContain("require(\"fs/promises\")");
    expect(prepared).not.toContain("df.g(");
  });

  it("hardens local path helpers that receive a non-string fallback", () => {
    const prepared = prepareAnswerSourceForRuntime(
      [
        "const pick = (v: any, ...paths: any[]) => {",
        "  for (const p of paths) {",
        "    const parts = p.split(\".\");",
        "    let cur = v;",
        "    for (const k of parts) cur = cur?.[k];",
        "    if (cur !== undefined) return cur;",
        "  }",
        "  return undefined;",
        "};",
        "const x = pick(row, \"stats.total\", 0);",
      ].join("\n"),
      "/tmp/ws",
    );

    expect(prepared).toContain('if (typeof p !== "string")');
    expect(prepared).toContain("if (p !== undefined) return p;");
    expect(prepared).toContain('const parts = p.split(".");');
  });

  it("hardens compact local path helper loops that split the path inline", () => {
    const prepared = prepareAnswerSourceForRuntime(
      [
        "const gs = (v: any, ...ps: any[]) => {",
        "  for (const p of ps) {",
        "    let x = v;",
        "    for (const k of p.split(\".\")) x = x?.[k];",
        "    if (x !== undefined) return x;",
        "  }",
        "};",
        "const x = gs(row, \"stats.total\", 0);",
      ].join("\n"),
      "/tmp/ws",
    );

    expect(prepared).toContain('if (typeof p !== "string")');
    expect(prepared).toContain("if (p !== undefined) return p;");
    expect(prepared).toContain('for (const k of p.split("."))');
  });

  it("adds fallback handling to compact rest-arg path helpers", () => {
    const prepared = prepareAnswerSourceForRuntime(
      [
        "const g = (v: any, ...p: any[]) => {",
        "  for (const k of p) {",
        "    const parts = String(k).split(\".\");",
        "    let cur = v, ok = true;",
        "    for (const s of parts) if (cur != null && s in cur) cur = cur[s]; else { ok = false; break; }",
        "    if (ok && cur !== undefined) return cur;",
        "  }",
        "  return undefined;",
        "};",
        "const traits = (g(race, \"traits\", []) as any[]).length;",
      ].join("\n"),
      "/tmp/ws",
    );

    expect(prepared).toContain("const __dfDefault = p.length > 0");
    expect(prepared).toContain("return __dfDefault;");
  });

  it("repairs common generated TypeScript syntax slips", () => {
    const prepared = prepareAnswerSourceForRuntime(
      [
        "const first = arr(value).[0];",
        "const (records: any) = await safeRecordsFindExact({ family: \"x\" }, 3);",
        "const g = (o: any, ...p: any[]) => { return arguments[arguments.length - 1]; };",
        "const speciesDistribution: Record<string, number> = {};",
        "function getStatTotal(details: any) {",
        "  const total = 0;",
        "  return total || pickNum(details?.stat_total) ?? pickNum(details?.base_stat_total) ?? 0;",
        "}",
        'const pop = pickNum(indicatorByCountry[code]?.SP.POP.TOTL, "value");',
        "const value = { summary: { species_distribution, total_characters: 5 } };",
      ].join("\n"),
      "/tmp/ws",
    );

    expect(prepared).toContain("const first = arr(value)[0];");
    expect(prepared).toContain("const records: any = await safeRecordsFindExact");
    expect(prepared).toContain("return p[p.length - 1];");
    expect(prepared).toContain("return (total || pickNum(details?.stat_total)) ?? pickNum(details?.base_stat_total) ?? 0;");
    expect(prepared).toContain('indicatorByCountry[code]?.["SP.POP.TOTL"]');
    expect(prepared).toContain("species_distribution: speciesDistribution");
    expect(prepared).not.toContain(".[0]");
    expect(prepared).not.toContain("const (records: any)");
    expect(prepared).not.toContain("arguments[arguments.length - 1]");
  });

  it("normalizes flat df.tool calls using the workspace tool manifest", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "datafetch-tool-manifest-"));
    await writeFile(
      path.join(dir, "tool_manifest.json"),
      JSON.stringify([
        {
          bundle: "pokemon_tools",
          tools: [{ name: "local-pokemon_get_abilities" }],
        },
      ]),
      "utf8",
    );

    const prepared = prepareAnswerSourceForRuntime(
      'const a = await df.tool.pokemon_get_abilities({ ability_names: [] });',
      dir,
    );

    expect(prepared).toContain('df.tool.pokemon_tools["local-pokemon_get_abilities"]({ ability_names: [] })');
    expect(prepared).not.toContain("df.tool.pokemon_get_abilities(");
  });

  it("roots literal entity arrays in mounted records when values match record fields", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "datafetch-literal-records-"));
    await writeFile(
      path.join(dir, ".datafetch-ctx.json"),
      JSON.stringify({
        records: [
          {
            id: "Human Fighter",
            recordKey: "dnd:Human Fighter",
            family: "dnd",
            entity: "Human Fighter",
            label: "fighter",
            attributes: { build_name: "Human Fighter", class: "Fighter", race: "Human" },
          },
          {
            id: "Elf Wizard",
            recordKey: "dnd:Elf Wizard",
            family: "dnd",
            entity: "Elf Wizard",
            label: "wizard",
            attributes: { build_name: "Elf Wizard", class: "Wizard", race: "Elf" },
          },
        ],
      }),
      "utf8",
    );

    const prepared = prepareAnswerSourceForRuntime(
      [
        "const builds = [",
        '  { build_name: "Human Fighter", class_name: "Fighter", race_name: "Human", score: 70 },',
        '  { build_name: "Elf Wizard", class_name: "Wizard", race_name: "Elf", score: 95 },',
        "];",
        "for (const b of builds) await df.tool.dnd_api[\"local-dnd_get_class\"]({ class_name: b.class_name });",
      ].join("\n"),
      dir,
    );

    expect(prepared).toContain("df.db.records.findExact");
    expect(prepared).toContain("buildsRecordsFromDatafetch");
    expect(prepared).toContain('build_name: g(r, "attributes.build_name"');
    expect(prepared).toContain('class_name: g(r, "attributes.class"');
    expect(prepared).toContain('race_name: g(r, "attributes.race"');
    expect(prepared).toContain("buildsLiteralByDatafetchKey");
    expect(prepared).toContain('"score":70');
    expect(prepared).not.toContain('class_name: "Fighter"');
  });

  it("does not rewrite literal entity arrays after an intent record wrapper is present", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "datafetch-intent-wrapper-literals-"));
    await writeFile(
      path.join(dir, ".datafetch-ctx.json"),
      JSON.stringify({
        records: [
          {
            id: "Canada",
            recordKey: "university:Canada",
            family: "university",
            entity: "Canada",
            label: "CA",
            attributes: { country: "Canada", alpha_code: "CA" },
          },
        ],
      }),
      "utf8",
    );

    const prepared = prepareAnswerSourceForRuntime(
      [
        "const rows = await loadRecordIntentRows();",
        "const countries = [",
        '  { country: "Canada", alpha_code: "CA" },',
        "];",
        "for (const c of countries) await df.tool.university_api[\"local-university_by_country\"]({ country: c.country });",
      ].join("\n"),
      dir,
    );

    expect(prepared).toContain("const rows = await loadRecordIntentRows();");
    expect(prepared).toContain('country: "Canada"');
    expect(prepared).not.toContain("countriesRecordsFromDatafetch");
    expect(prepared).not.toContain("df.db.records.findExact");
  });

  it("roots literal tuple entity arrays in mounted records when values match fields", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "datafetch-tuple-records-"));
    await writeFile(
      path.join(dir, ".datafetch-ctx.json"),
      JSON.stringify({
        records: [
          {
            id: "Human Fighter",
            recordKey: "dnd:Human Fighter",
            family: "dnd",
            entity: "Human Fighter",
            label: "fighter",
            attributes: { build_name: "Human Fighter", class: "Fighter", race: "Human" },
          },
          {
            id: "Elf Wizard",
            recordKey: "dnd:Elf Wizard",
            family: "dnd",
            entity: "Elf Wizard",
            label: "wizard",
            attributes: { build_name: "Elf Wizard", class: "Wizard", race: "Elf" },
          },
        ],
      }),
      "utf8",
    );

    const prepared = prepareAnswerSourceForRuntime(
      [
        "const chars = [",
        '  ["Human Fighter", "Fighter", "Human"],',
        '  ["Elf Wizard", "Wizard", "Elf"],',
        "] as const;",
        "for (const [build_name, class_name, race_name] of chars) await df.tool.dnd_api[\"local-dnd_get_class\"]({ class_name });",
      ].join("\n"),
      dir,
    );

    expect(prepared).toContain("df.db.records.findExact");
    expect(prepared).toContain("charsRecordsFromDatafetch");
    expect(prepared).toContain('g(r, "attributes.build_name"');
    expect(prepared).toContain('g(r, "attributes.class"');
    expect(prepared).toContain('g(r, "attributes.race"');
    expect(prepared).not.toContain('["Human Fighter", "Fighter", "Human"]');
  });

  it("returns a trailing df.answer call so the runtime records the answer envelope", () => {
    const prepared = prepareAnswerSourceForRuntime(
      [
        "await writeJson(\"out.json\", { ok: true });",
        "df.answer({",
        "  status: \"answered\",",
        "  value: { ok: true },",
        "  evidence: [],",
        "  derivation: [],",
        "});",
      ].join("\n"),
      "/tmp/ws",
    );

    expect(prepared).toContain("return df.answer({");
    expect(prepared).not.toContain("\ndf.answer({");
  });

  it("seeds answer.ts with the answer kit import", () => {
    const scaffold = renderAnswerScaffold(task("x", []));
    expect(scaffold).toContain('from "./datafetch_answer_kit.ts"');
  });

  it("renders generic input hygiene rules for canonical tool arguments", () => {
    expect(renderInputHygieneRules().join("\n")).toContain("ISO/code/index");
    expect(renderInputHygieneRules().join("\n")).toContain("lowercase hyphenated slugs");
  });

  it("extracts visible task literals from markdown for recordless sequence tasks", () => {
    const hints = renderTaskLiteralHints([
      "## DNA Sequences",
      "SEQ_01: ATGCGATCGATCGATCGATC...",
      "SEQ_02: GCTAGCTAGCTAGCTAGCTA...",
    ].join("\n"));

    expect(hints).toContain("SEQ_01: ATGCGATCGATCGATCGATC");
    expect(hints).toContain("non-empty tool inputs");
  });

  it("parenthesises multi-line const RHS that mixes ?? and ||", () => {
    // Reproducer drawn from iter155 pokeapi/m1: prettier-style wrapped
    // const where each `??` operand is on its own line and the tail
    // includes a `* (... || 0) || 0` mix. esbuild rejects this with
    // "Cannot use || with ?? without parentheses" so the substrate must
    // rewrite it before transform.
    const source = [
      "const statTotal =",
      "    num(details?.base_stat_total) ??",
      "    num(details?.stat_total) ??",
      "    num(details?.stats_total) ??",
      "    avg(asArr(details?.stats ?? []).map((s) => num(s?.base_stat) ?? 0)) * (asArr(details?.stats ?? []).length || 0) ||",
      "    0;",
    ].join("\n");
    const rewritten = rewriteMixedNullishLogicalExpressions(source);
    // Statement must be intact, terminated by `;`, and the rewriter
    // must have inserted at least one paren that wasn't in the source.
    expect(rewritten.endsWith(";")).toBe(true);
    expect(rewritten).toContain("const statTotal =");
    expect(rewritten.match(/\(/g)?.length ?? 0).toBeGreaterThan(
      source.match(/\(/g)?.length ?? 0,
    );
    // Sanity: feed the rewritten source through esbuild and ensure it
    // parses cleanly (no "Cannot use || with ??" error).
  });

  it("leaves clean ?? chains and bare logical-only expressions untouched", () => {
    const cleanNullish = "const x = a ?? b ?? c;\n";
    const cleanLogical = "const y = a || b && c;\n";
    expect(rewriteMixedNullishLogicalExpressions(cleanNullish)).toBe(cleanNullish);
    expect(rewriteMixedNullishLogicalExpressions(cleanLogical)).toBe(cleanLogical);
  });

  it("parenthesises a single-line return that mixes ?? and ||", () => {
    const source = "return a ?? b || c;\n";
    const rewritten = rewriteMixedNullishLogicalExpressions(source);
    expect(rewritten).not.toBe(source);
    expect(rewritten).toContain("(");
    expect(rewritten).toContain(")");
  });

  it("wraps unsafe string-methods (toLowerCase/includes/startsWith/etc) on nullish-fallback in String()", () => {
    // iter165 shard1 usgs/m2 hit `.includes` on a non-string; extending
    // to a broader generic-JS string-method set since the same shape
    // also breaks `.startsWith`, `.endsWith`, `.trim`, `.slice` etc.
    const source = [
      'const x = (r.x ?? "").includes("foo");',
      'const y = (r.y ?? "").startsWith("bar");',
      'const z = (r.z ?? "").trim();',
      'const a = (r.a ?? "").slice(0, 5);',
      'const b = (r.b ?? "").split(",");',
    ].join("\n");
    const rewritten = rewriteUnsafeStringCoercionCalls(source);
    expect(rewritten).toContain('String(r.x ?? "").includes(');
    expect(rewritten).toContain('String(r.y ?? "").startsWith(');
    expect(rewritten).toContain('String(r.z ?? "").trim(');
    expect(rewritten).toContain('String(r.a ?? "").slice(');
    expect(rewritten).toContain('String(r.b ?? "").split(');
  });

  it("wraps unsafe .toLowerCase/.toUpperCase on nullish-fallback in String()", () => {
    // Reproducer from iter160 usgs/m1: agent calls .toLowerCase() on a
    // value that nullish-fallback can return as a number (e.g., a
    // magnitude). Without coercion, this throws at runtime.
    const source = [
      'const entity = (r.intentEntity ?? r.label ?? "").toLowerCase();',
      'const big = (a ?? "").toUpperCase();',
      'const safe = "literal".toLowerCase();',
    ].join("\n");
    const rewritten = rewriteUnsafeStringCoercionCalls(source);
    expect(rewritten).toContain('String(r.intentEntity ?? r.label ?? "").toLowerCase()');
    expect(rewritten).toContain('String(a ?? "").toUpperCase()');
    // String literal calls aren't touched (they're already strings).
    expect(rewritten).toContain('"literal".toLowerCase()');
  });

  it("does not double-wrap String() around an already-coerced ?? expression", () => {
    // Reproducer from iter162 random-user/e1: agent already wrote
    // `String(... ?? ...).toUpperCase()`. The naive rewriter would
    // produce `StringString(...).toUpperCase()` — undefined reference.
    const source = 'const code = String(row.entityValue ?? row.entityId).toUpperCase();\n';
    const rewritten = rewriteUnsafeStringCoercionCalls(source);
    expect(rewritten).toBe(source);
    expect(rewritten).not.toContain("StringString");
  });

  it("coerces nullish-fallback const declarations ending in empty-string default", () => {
    // Reproducer from iter162 usgs/m2: agent does
    // `const entity = r.intentEntity ?? r.label ?? "";` then later
    // calls `entity.toLowerCase()`. The bare identifier .toLowerCase
    // isn't catchable by the parenthesised-form rule, so coerce at
    // the source: wrap the RHS in String(...) when it ends with `""`.
    const source = 'const entity = r.intentEntity ?? r.label ?? "";\n';
    const rewritten = rewriteUnsafeStringCoercionCalls(source);
    expect(rewritten).toContain('const entity = String(r.intentEntity ?? r.label ?? "");');
    // Don't re-coerce when already wrapped in String(...).
    const alreadySafe = 'const entity = String(r.x ?? r.y ?? "");\n';
    expect(rewriteUnsafeStringCoercionCalls(alreadySafe)).toBe(alreadySafe);
  });

  it("AST rewriter catches nested-paren receivers the prior regex missed", () => {
    // The prior regex `[^()]*\?\?[^()]*` for the inner expression
    // could not cross internal parens, so receivers containing a
    // function call on either side of `??` slipped through. The AST
    // walker has no such limit.
    const source = 'const out = (fn(a) ?? gn(b)).includes("foo");\n';
    const rewritten = rewriteUnsafeStringCoercionCalls(source);
    expect(rewritten).toContain('String(fn(a) ?? gn(b)).includes(');
  });

  it("AST rewriter handles multi-clause ?? chains containing calls", () => {
    const source = 'const name = (lookup(id) ?? cache.get(id) ?? "").toLowerCase();\n';
    const rewritten = rewriteUnsafeStringCoercionCalls(source);
    expect(rewritten).toContain('String(lookup(id) ?? cache.get(id) ?? "").toLowerCase(');
  });
});
