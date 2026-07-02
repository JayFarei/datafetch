// Task registry: the question FAMILIES each tenant answers, plus the honest
// inline reducer for each. A task defines WHAT is being asked and the baseline
// (masked-arm) computation over raw records. The cheaper index-backed path
// lives in the curated seeds (lib/seeds/), which is what actually promotes.
//
// Distinct traffic (Codex review F4): a task is instantiated per pair with a
// TaskParam — an "as of the first N records filed" window. Each pair issues a
// DISTINCT query with (where the data supports it) a distinct answer, so the
// genericity rung and the post-promotion holdout are earned on varied inputs,
// not identical replays. Records are stored in filing order, so the window is a
// prefix; the caller (executor) slices it and reducers see only the windowed
// records.
//
// Anti-circularity (defeater D1, check V7:G3): nothing here references gold
// artifacts. The reducers compute answers from the fixture records directly.

import type { Answer, TaskParam } from "./types.js";

export type AnswerIntent = "count" | "list";

export interface Task {
  id: string;
  tenant: string;
  /** the query FAMILY, instantiated per param — distinct text per window */
  queryFor(param: TaskParam): string;
  intent: AnswerIntent;
  /** which source collection in the mounted snapshot this task reads */
  sourceCollection: string;
  /** the honest inline computation over the WINDOWED records (masked baseline) */
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
    queryFor: (p) => `As of the first ${p.asOf} tickets filed, how many open tickets are priority high?`,
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
    queryFor: (p) => `As of the first ${p.asOf} tickets filed, list the distinct topics of open tickets.`,
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
    queryFor: (p) => `As of the first ${p.asOf} orders placed, what is the total value of delivered orders?`,
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
    queryFor: (p) => `As of the first ${p.asOf} orders placed, list the distinct regions with placed (not-yet-shipped) orders.`,
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

/** The full-corpus window: "as of everything filed". Probes and replay-fallback use it. */
export function fullParam(recordCount: number): TaskParam {
  return { asOf: recordCount };
}

export interface ParamGrid {
  /** windows cycled during the promotion phase (pairs 0..minPairs-1) */
  promotion: TaskParam[];
  /** windows cycled during the holdout phase — DISJOINT from and LATER than every promotion window */
  holdout: TaskParam[];
}

/**
 * Deterministic per-task parameter grid (Codex review F4). Constraints:
 *   - every asOf costs >= 2 inline pages (asOf > pageSize), so an index read
 *     (1 turn) can genuinely win its pair;
 *   - promotion windows are 6 distinct values below the holdout range;
 *   - holdout windows are 4 distinct values, every one STRICTLY GREATER than
 *     every promotion window — post-promotion pairs read record windows never
 *     seen before promotion.
 * Throws if the corpus is too small to satisfy that shape honestly.
 */
export function paramGridFor(recordCount: number, pageSize = 8): ParamGrid {
  const floor = pageSize + 1;
  const holdoutCount = 4;
  const promoCount = 6;
  const holdoutStart = recordCount - holdoutCount;
  if (holdoutStart - floor < promoCount) {
    throw new Error(
      `corpus too small for a distinct param grid: N=${recordCount}, need >= ${floor + promoCount + holdoutCount}`,
    );
  }
  const promotion: TaskParam[] = [];
  const span = holdoutStart - 1 - floor;
  for (let i = 0; i < promoCount; i++) {
    promotion.push({ asOf: floor + Math.round((span * i) / (promoCount - 1)) });
  }
  const holdout: TaskParam[] = [];
  for (let i = 0; i < holdoutCount; i++) holdout.push({ asOf: holdoutStart + i + 1 });
  return { promotion, holdout };
}
