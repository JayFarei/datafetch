// Task registry: the questions each tenant answers, plus the honest-but-costly
// inline reducer for each. A task defines WHAT is being asked and the baseline
// (masked-arm) computation over raw records. The cheaper index-backed path
// lives in the curated seeds (lib/seeds/), which is what actually promotes.
//
// Anti-circularity (defeater D1, check V7:G3): nothing here references gold
// artifacts. The reducers compute answers from the fixture records directly.

import type { Answer } from "./types.js";

export type AnswerIntent = "count" | "list";

export interface Task {
  id: string;
  tenant: string;
  query: string;
  intent: AnswerIntent;
  /** which source collection in the mounted snapshot this task reads */
  sourceCollection: string;
  /** the honest inline computation over every record (the masked baseline) */
  reduceRecords(records: Record<string, unknown>[]): Answer;
}

function distinct(values: string[]): string[] {
  return [...new Set(values)].sort();
}

const TASKS: Task[] = [
  // ---- tenant alpha: support-tickets ----
  {
    id: "alpha-open-high",
    tenant: "alpha",
    query: "How many open tickets are priority high?",
    intent: "count",
    sourceCollection: "tickets",
    reduceRecords(records) {
      const value = records.filter(
        (r) => r["status"] === "open" && r["priority"] === "high",
      ).length;
      return { kind: "count", value };
    },
  },
  {
    id: "alpha-open-topics",
    tenant: "alpha",
    query: "List the distinct topics of open tickets.",
    intent: "list",
    sourceCollection: "tickets",
    reduceRecords(records) {
      const topics = distinct(
        records
          .filter((r) => r["status"] === "open")
          .map((r) => String(r["topic"])),
      );
      return { kind: "list", items: topics.map((topic) => ({ topic })) };
    },
  },
  // ---- tenant beta: orders ----
  {
    id: "beta-delivered-sum",
    tenant: "beta",
    query: "What is the total value of delivered orders?",
    intent: "count",
    sourceCollection: "orders",
    reduceRecords(records) {
      const value = records
        .filter((r) => r["state"] === "delivered")
        .reduce((sum, r) => sum + Number(r["total"]), 0);
      return { kind: "count", value };
    },
  },
  {
    id: "beta-open-regions",
    tenant: "beta",
    query: "List the distinct regions with placed (not-yet-shipped) orders.",
    intent: "list",
    sourceCollection: "orders",
    reduceRecords(records) {
      const regions = distinct(
        records
          .filter((r) => r["state"] === "placed")
          .map((r) => String(r["region"])),
      );
      return { kind: "list", items: regions.map((region) => ({ region })) };
    },
  },
];

const BY_ID = new Map(TASKS.map((t) => [t.id, t]));

export function getTask(id: string): Task {
  const task = BY_ID.get(id);
  if (!task) throw new Error(`unknown task: ${id}`);
  return task;
}

export function allTasks(): Task[] {
  return [...TASKS];
}

export function tasksForTenant(tenant: string): Task[] {
  return TASKS.filter((t) => t.tenant === tenant);
}
