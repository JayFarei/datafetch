/* ---
name: toolFanout
status: provisional
description: |
  Hand-authored typed variant of the substrate's auto-crystallised
  toolFanout. Same body shape as the original (call one or more tools
  per entity, return per-entity records); only the INPUT schema is
  changed from `{intent?, limit?}` (which renders as `(input: Object)`
  in df.d.ts) to an explicit `{entityValues, toolBundle, toolNames,
  paramName}` schema so df.d.ts renders a typed signature the agent
  can call without inspecting the source.
test-only: experiment-side preseed for the typed-helper-pickup test.
--- */

// Manually authored for the "typed signature flips the agent's pick"
// experiment. The body is functionally identical to the auto-
// crystallised toolFanout; the difference is the public input shape.

import { fn } from "file:///Users/jayfarei/src/tries/2026-05-01-hackathon-p2/src/sdk/index.ts";
import * as v from "file:///Users/jayfarei/src/tries/2026-05-01-hackathon-p2/node_modules/.pnpm/valibot@1.3.1_typescript@5.9.3/node_modules/valibot/dist/index.mjs";

declare const df: {
  tool: Record<string, Record<string, (input: Record<string, unknown>) => Promise<unknown>>>;
};

type Input = {
  entityValues: Array<string | number>;
  toolBundle: string;
  toolNames: string[];
  paramName: string;
  paramByTool?: Record<string, string>;
  sharedInput?: Record<string, unknown>;
};

export const toolFanout = fn<Input, unknown>({
  intent:
    "Repeated tool fan-out over an entity set. Calls one or more tools from a single bundle for each entity id, sharing one parameter name, and returns one result record per entity with entityId + per-tool result keys + a `tools` map keyed by tool name.",
  examples: [],
  input: v.object({
    entityValues: v.array(v.union([v.string(), v.number()])),
    toolBundle: v.string(),
    toolNames: v.array(v.string()),
    paramName: v.string(),
    paramByTool: v.optional(v.record(v.string(), v.string())),
    sharedInput: v.optional(v.record(v.string(), v.unknown())),
  }),
  output: v.array(v.unknown()),
  async body(input) {
    const i = input as Input;
    const bundle = df.tool[i.toolBundle];
    if (!bundle) {
      return [{ error: "unknown_bundle", toolBundle: i.toolBundle }];
    }
    const results: Array<Record<string, unknown>> = [];
    for (const entityValue of i.entityValues) {
      const perTool: Record<string, unknown> = {};
      for (const toolName of i.toolNames) {
        const tool = bundle[toolName];
        if (!tool) {
          perTool[toolName] = { error: "unknown_tool", tool: toolName };
          continue;
        }
        const paramName = i.paramByTool?.[toolName] ?? i.paramName;
        const payload: Record<string, unknown> = {
          ...(i.sharedInput ?? {}),
          [paramName]: entityValue,
        };
        try {
          perTool[toolName] = await tool(payload);
        } catch (err) {
          perTool[toolName] = { error: String(err) };
        }
      }
      // Same result shape as auto-crystallised: top-level per-tool keys
      // PLUS a nested `tools` map, so agents can use either access style.
      const record: Record<string, unknown> = {
        entityId: entityValue,
        entityValue,
        tools: perTool,
        ...perTool,
      };
      results.push(record);
    }
    return results;
  },
});
