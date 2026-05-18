import { fn } from "@datafetch/sdk";
import * as v from "valibot";

type ToolCallEnvelope = { value: unknown } | unknown;

declare const df: {
  tool: Record<string, Record<string, (input: Record<string, unknown>) => Promise<unknown>>>;
};

type Input = {
  entityIds: Array<string | number>;
  toolBundle: string;
  toolNames: string[];
  paramName: string;
  paramByTool?: Record<string, string>;
  extraInput?: Record<string, unknown>;
};

export const per_entity = fn({
  intent: "Fan out a configurable list of tools over a list of entity ids, sharing one parameter, and aggregate the results per entity.",
  examples: [],
  input: v.object({
    entityIds: v.array(v.union([v.string(), v.number()])),
    toolBundle: v.string(),
    toolNames: v.array(v.string()),
    paramName: v.string(),
    paramByTool: v.optional(v.record(v.string(), v.string())),
    extraInput: v.optional(v.record(v.string(), v.unknown())),
  }),
  output: v.unknown(),
  async body(input) {
    const i = input as Input;
    const bundle = df.tool[i.toolBundle];
    if (!bundle) {
      return { value: { error: "unknown_bundle", toolBundle: i.toolBundle } };
    }
    const results: Array<{ entityId: string | number; tools: Record<string, unknown> }> = [];
    for (const entityId of i.entityIds) {
      const perTool: Record<string, unknown> = {};
      for (const toolName of i.toolNames) {
        const tool = bundle[toolName];
        if (!tool) {
          perTool[toolName] = { error: "unknown_tool", tool: toolName };
          continue;
        }
        const paramName = i.paramByTool?.[toolName] ?? i.paramName;
        const payload: Record<string, unknown> = {
          ...(i.extraInput ?? {}),
          [paramName]: entityId,
        };
        try {
          perTool[toolName] = await tool(payload);
        } catch (err) {
          perTool[toolName] = { error: String(err) };
        }
      }
      results.push({ id: entityId, entity: entityId, entityId, entityValue: entityId, tools: perTool });
    }
    return results;
  },
});
