/* ---
name: recordToolLookup
status: provisional
description: |
  Transferable learned datafetch helper for record-backed per-entity tool fan-out.
  Use when the task starts from mounted records and needs repeated
  per-record enrichment. The caller-facing input is intent-shaped:
  { intent?: "record-backed repeated fan-out", recordFilter?, recordLimit? }.
  Planner/executor internals infer record fields, tool parameters, and
  tool selection before invoking the runtime implementation.
  the runtime returns one result object per entity with entityId, entityValue,
  record, label, attributes, top-level per-tool keys, and a nested tools map keyed by tool name.
trajectory: traj_20260602104052_xfokxp
shape-hash: a3c1dc5d
source-hash: 5b23688161f302a2082aba1d887555d0abdd31683b0c59dba67fe4074d204975
replay-contract: origin-and-heldout-replay-before-validation
change-contract: preserve-public-schema-call-graph-and-evidence-semantics
verifier: validate-examples-and-replay-before-promotion
rollback: quarantine-or-supersede-through-workspace-head
promotion-state: narrow
coverage-density: 0.67
step-count: 4
distinct-tools: 1
regal-gate-active: false
--- */

// Learned by datafetch observer from trajectory traj_20260602104052_xfokxp.
// @shape-hash: a3c1dc5d
// @intent-signature: FANOUT(db)→FANOUT(tool)
// @origin-trajectory: traj_20260602104052_xfokxp
// @origin-question: "const answer = df.answer.bind(df);"
// @steps: db.records.findExact -> db.records.findExact -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization

import { fn } from "file:///Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/src/sdk/index.ts";
import * as v from "file:///Users/jayfarei/src/tries/2026-05-01-hackathon/node_modules/.pnpm/valibot@1.3.1_typescript@5.9.3/node_modules/valibot/dist/index.mjs";

// Goal-4 learned record-backed fan-out interface. The public surface is
// intent-shaped; planner/executor internals provide the data-shaped tool
// plan through loose, non-public fields.
declare const df: {
  db: {
    records: {
      findExact(filter: Record<string, unknown>, limit?: number): Promise<unknown[]>;
    };
  };
  tool: Record<string, Record<string, (input: Record<string, unknown>) => Promise<unknown>>>;
};

type Input = {
  intent?: "record-backed repeated fan-out";
  recordFilter?: Record<string, unknown>;
  recordLimit?: number;
};

type InternalRecordFanoutPlan = {
  entityField?: string;
  toolBundle?: string;
  toolNames?: string[];
  paramName?: string;
  paramByTool?: Record<string, string>;
  recordParamMapByTool?: Record<string, Record<string, string>>;
  sharedInput?: Record<string, unknown>;
};

export const recordToolLookup = fn<Input, unknown>({
  intent: "reusable learned record-backed fan-out interface; fetches records and runs repeated per-entity tool calls without the seed helper",
  examples: [
    {
      input: {
  "intent": "record-backed repeated fan-out",
  "recordFilter": {},
  "recordLimit": 2
},
      output: {
  "entityId": "TIRX",
  "entityValue": "TIRX",
  "label": null,
  "record": {},
  "attributes": {},
  "tools": {}
},
    },
  ],
  input: v.looseObject({
    intent: v.optional(v.literal("record-backed repeated fan-out")),
    recordFilter: v.optional(v.record(v.string(), v.unknown())),
    recordLimit: v.optional(v.number()),
  }),
  output: v.unknown(),
  body: async (input: Input): Promise<unknown> => {
    const plan = input as Input & InternalRecordFanoutPlan;
    const pickEntityValue = (record: unknown): string | number | null => {
      if (!record || typeof record !== "object" || Array.isArray(record)) return null;
      const rec = record as Record<string, unknown>;
      const field = plan.entityField;
      const attrs = rec.attributes;
      const candidate = field
        ? rec[field] ?? (attrs && typeof attrs === "object" && !Array.isArray(attrs)
            ? (attrs as Record<string, unknown>)[field]
            : undefined)
        : rec.id ?? rec.entity;
      return typeof candidate === "string" || typeof candidate === "number"
        ? candidate
        : null;
    };
    const readRecordField = (record: Record<string, unknown>, field: string): unknown => {
      if (record[field] !== undefined) return record[field];
      const attrs = record.attributes;
      if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
        const value = (attrs as Record<string, unknown>)[field];
        if (value !== undefined) return value;
      }
      if (field === "id") return record.id;
      if (field === "entity") return record.entity;
      return undefined;
    };
    const normalizeId = (value: string | number): string | number =>
      typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : value;
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
      // Generic single-key wrapper: if value has exactly one non-metadata key whose value is itself
      // an object, unwrap it. Handles tool responses like {pokemon: {...}} or {show: {...}} that wrap
      // their payload under an entity-named key, without re-introducing benchmark identifiers into
      // the envelope allowlist.
      const wrapperKeys = Object.keys(value).filter((k) => !envelopeMetaKeys.has(k) && value[k] !== undefined && value[k] !== null);
      if (wrapperKeys.length === 1 && isPlainObject(value[wrapperKeys[0]])) return value[wrapperKeys[0]];
      return value;
    };
    const records = await df.db.records.findExact(input.recordFilter ?? {}, input.recordLimit ?? 999);
    const toolBundle = typeof plan.toolBundle === "string" ? plan.toolBundle : "";
    const toolNames = Array.isArray(plan.toolNames) ? plan.toolNames : [];
    const defaultParamName = typeof plan.paramName === "string" ? plan.paramName : "";
    if (!toolBundle || toolNames.length === 0 || !defaultParamName) return { error: "missing_internal_plan" };
    const bundle = df.tool[toolBundle];
    if (!bundle) return { error: "unknown_bundle", toolBundle };
    const results: Array<Record<string, unknown>> = [];
    for (const record of records) {
      const entityValue = pickEntityValue(record);
      if (entityValue === null) continue;
      const entityId = normalizeId(entityValue);
      const rec = record && typeof record === "object" && !Array.isArray(record) ? (record as Record<string, unknown>) : {};
      const label = typeof rec.label === "string" || typeof rec.label === "number" ? rec.label : undefined;
      const attributes = rec.attributes && typeof rec.attributes === "object" && !Array.isArray(rec.attributes) ? rec.attributes : undefined;
      const perTool: Record<string, unknown> = {};
      const rawTools: Record<string, unknown> = {};
      for (const toolName of toolNames) {
        const tool = bundle[toolName];
        if (!tool) { perTool[toolName] = { error: "unknown_tool", tool: toolName }; rawTools[toolName] = perTool[toolName]; continue; }
        const paramName = plan.paramByTool?.[toolName] ?? defaultParamName;
        const payload: Record<string, unknown> = { ...(plan.sharedInput ?? {}) };
        const recordParamMap = plan.recordParamMapByTool?.[toolName];
        if (recordParamMap) {
          for (const [toolParam, recordField] of Object.entries(recordParamMap)) {
            const value = readRecordField(rec, recordField);
            if (value !== undefined) payload[toolParam] = value;
          }
        }
        if (payload[paramName] === undefined) payload[paramName] = entityValue;
        try { const raw = await tool(payload); rawTools[toolName] = raw; perTool[toolName] = unwrapToolPayload(raw); }
        catch (err) { perTool[toolName] = { error: String(err) }; rawTools[toolName] = perTool[toolName]; }
      }
      results.push({ id: entityId, entity: entityValue, entityId, entityValue, record: rec, label, attributes, ...perTool, tools: perTool, rawTools });
    }
    return results;
  },
});
