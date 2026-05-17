/* ---
name: toolFanout
status: provisional
description: |
  Transferable learned datafetch fan-out helper for repeated per-entity tool calls.
  Use when the task has an entity set and needs the same tool bundle plus
  one or more tool names called for each entity. The caller-facing input is
  intent-shaped: { intent?: "repeated tool fan-out"; limit? }.
  Planner/executor internals infer entity values, tool names, and tool params
  before invoking the runtime implementation.
  the runtime returns one result object per entity with entityId, entityValue,
  top-level per-tool keys, and a nested tools map keyed by tool name.
trajectory: traj_20260517190429_aadcvv
shape-hash: 34016977
promotion-state: narrow
coverage-density: 0.50
step-count: 3
distinct-tools: 1
regal-gate-active: false
--- */

// Learned by datafetch observer from trajectory traj_20260517190429_aadcvv.
// @shape-hash: 34016977
// @intent-signature: FANOUT(tool)
// @origin-trajectory: traj_20260517190429_aadcvv
// @origin-question: "// scripts/answer.ts"
// @steps: tool.jsonplaceholder.getUser -> tool.jsonplaceholder.getUser -> tool.jsonplaceholder.getUser

import { fn } from "file:///Users/jayfarei/src/tries/2026-05-01-hackathon-p2/src/sdk/index.ts";
import * as v from "file:///Users/jayfarei/src/tries/2026-05-01-hackathon-p2/node_modules/.pnpm/valibot@1.3.1_typescript@5.9.3/node_modules/valibot/dist/index.mjs";

// Goal-4 learned tool fan-out interface. The public surface is
// intent-shaped; planner/executor internals provide entity values and
// tool slots through loose, non-public fields.
// Results include entityId/entityValue, top-level per-tool keys, and
// a nested tools map for compatibility with different answer styles.
declare const df: {
  tool: Record<string, Record<string, (input: Record<string, unknown>) => Promise<unknown>>>;
};

type Input = {
  intent?: "repeated tool fan-out";
  limit?: number;
};

type InternalToolFanoutPlan = {
  entityValues?: Array<string | number>;
  toolBundle?: string;
  toolNames?: string[];
  paramName?: string;
  paramByTool?: Record<string, string>;
  sharedInput?: Record<string, unknown>;
};

export const toolFanout = fn<Input, unknown>({
  intent: "reusable learned fan-out interface for repeated per-entity tool calls; caller-facing input is intent-shaped while planner/executor internals provide tool and entity slots",
  examples: [
    {
      input: {
  "intent": "repeated tool fan-out",
  "limit": 3
},
      output: {
  "entityId": 2,
  "entityValue": 2,
  "tools": {}
},
    },
  ],
  input: v.looseObject({
    intent: v.optional(v.string()),
    limit: v.optional(v.number()),
    entityValues: v.optional(v.array(v.union([v.string(), v.number()]))),
    toolBundle: v.optional(v.string()),
    toolNames: v.optional(v.array(v.string())),
    paramName: v.optional(v.string()),
    paramByTool: v.optional(v.record(v.string(), v.string())),
    sharedInput: v.optional(v.record(v.string(), v.unknown())),
  }),
  output: v.unknown(),
  body: async (input: Input): Promise<unknown> => {
    const plan = input as Input & InternalToolFanoutPlan;
    const entityValues = Array.isArray(plan.entityValues) ? plan.entityValues : [];
    const toolBundle = typeof plan.toolBundle === "string" ? plan.toolBundle : "";
    const toolNames = Array.isArray(plan.toolNames) ? plan.toolNames : [];
    const defaultParamName = typeof plan.paramName === "string" ? plan.paramName : "";
    if (!toolBundle || toolNames.length === 0 || !defaultParamName) return { error: "missing_internal_plan" };
    const bundle = df.tool[toolBundle];
    if (!bundle) return { error: "unknown_bundle", toolBundle };
    const envelopeKeys = ["value", "data", "result", "record", "entity", "item", "payload"];
    const envelopeMetaKeys = new Set(["success", "ok", "status", "error", "message", "code", "errors", "warnings", "elapsedMs", "elapsed_ms", "took"]);
    const isPlainObject = (value: unknown): value is Record<string, unknown> => value != null && typeof value === "object" && !Array.isArray(value);
    const isErrorLike = (value: unknown): boolean => isPlainObject(value) && value.success === false && (typeof value.error === "string" || typeof value.message === "string");
    const unwrapToolPayload = (value: unknown): unknown => {
      if (!isPlainObject(value) || isErrorLike(value)) return value;
      if (typeof value.success === "boolean" || typeof value.ok === "boolean") {
        const payloadKeys = Object.keys(value).filter((k) => !envelopeMetaKeys.has(k) && value[k] !== undefined && value[k] !== null);
        if (payloadKeys.length === 1) return value[payloadKeys[0]];
      }
      for (const key of envelopeKeys) if (value[key] !== undefined && value[key] !== null) return value[key];
      return value;
    };
    const results: Array<Record<string, unknown>> = [];
    for (const entityValue of entityValues.slice(0, input.limit ?? entityValues.length)) {
      const perTool: Record<string, unknown> = {};
      const rawTools: Record<string, unknown> = {};
      for (const toolName of toolNames) {
        const tool = bundle[toolName];
        if (!tool) { perTool[toolName] = { error: "unknown_tool", tool: toolName }; rawTools[toolName] = perTool[toolName]; continue; }
        const paramName = plan.paramByTool?.[toolName] ?? defaultParamName;
        const payload: Record<string, unknown> = { ...(plan.sharedInput ?? {}), [paramName]: entityValue };
        try { const raw = await tool(payload); rawTools[toolName] = raw; perTool[toolName] = unwrapToolPayload(raw); }
        catch (err) { perTool[toolName] = { error: String(err) }; rawTools[toolName] = perTool[toolName]; }
      }
      results.push({ id: entityValue, entity: entityValue, entityId: entityValue, entityValue, ...perTool, tools: perTool, rawTools });
    }
    return results;
  },
});
