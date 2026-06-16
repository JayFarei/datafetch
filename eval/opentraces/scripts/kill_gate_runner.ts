import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

import {
  InMemoryMountRuntimeRegistry,
  makeMountRuntime,
  setMountRuntimeRegistry,
} from "../../../src/adapter/runtime.js";
import { installObserver } from "../../../src/observer/install.js";
import { installSnippetRuntime } from "../../../src/snippet/install.js";
import type { TrajectoryRecord } from "../../../src/trajectory/recorder.js";
import { EvalRecordsMount, type EvalRecord } from "../../harness/evalRecords.js";
import { runGovernanceGate } from "../../harness/sacArmGovernance.js";

const ROOT = path.resolve("eval/opentraces");
const SNAPSHOT = path.join(ROOT, "vendor", "snapshot");
const TRACES_ROOT = path.join(SNAPSHOT, "objects", "traces", "v1");
const BATCHES_ROOT = path.join(SNAPSHOT, "events", "v1", "batches");
const PACK_PATH = path.join(ROOT, "questions", "pack.jsonl");
const TENANT_ID = "opentraces-arms";
const MODEL = "claude-sonnet-4-6";
const SNIPPET_TIMEOUT_MS = 300_000;
const DRIVER_TIMEOUT_MS = 300_000;
const OBSERVER_AWAIT_MS = 15_000;
const SEED_HELPERS = new Set(["groupSum", "countBy", "groupsum", "countby"]);

const RUN_CONFIG = {
  b: {
    m1Root: path.join(ROOT, "probes", "m1b-runs"),
    m2Root: path.join(ROOT, "probes", "m2b-runs"),
    summaryPath: path.join(ROOT, "probes", "kill-gate-summary-m1b-m2b.json"),
    ledgerPath: path.join(ROOT, "probes", "token-ledger-m1b-m2b.json"),
    tokenCap: 17_900_000,
    label: "M1b/M2b",
  },
  c: {
    m1Root: path.join(ROOT, "probes", "m1c-runs"),
    m2Root: path.join(ROOT, "probes", "m2c-runs"),
    summaryPath: path.join(ROOT, "probes", "kill-gate-summary-m1c-m2c.json"),
    ledgerPath: path.join(ROOT, "probes", "token-ledger-m1c-m2c.json"),
    tokenCap: 17_600_000,
    label: "M1c/M2c",
  },
} as const;

const TARGET_TEMPLATES = [
  "P1-T1",
  "P1-T2",
  "P2-T2",
  "P2-T4",
  "P3-T1",
  "P3-T2",
  "P4-T1",
  "P4-T3",
] as const;

type TargetTemplate = (typeof TARGET_TEMPLATES)[number];
type RunSeries = keyof typeof RUN_CONFIG;
type RunConfig = (typeof RUN_CONFIG)[RunSeries];
type M1Phase = "m1b" | "m1c";
type M2Phase = "m2b" | "m2c";
type MeasuredPhase = M1Phase | M2Phase;
type GatePhase = MeasuredPhase | "all" | "allc";

type PackRow = {
  row_id: string;
  template_id: string;
  persona: string;
  question: string;
  params: Record<string, unknown>;
  answer_type: string;
  gold: unknown;
};

type Task = {
  id: string;
  phase: MeasuredPhase;
  sibling: number;
  row: PackRow;
};

type TraceRecord = {
  id: string;
  recordKey: string;
  family: string;
  entity: string;
  label: string;
  attributes: Record<string, string | number | boolean>;
};

type DriverUsage = {
  inputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  outputTokens: number;
  turns: number;
  modelContextTokens: number;
};

type DriverRun = {
  command: string;
  stdout: string;
  stderr: string;
  finalMessage: string;
  elapsedMs: number;
  exitCode: number;
  usage: DriverUsage;
};

type HelperEvidence = {
  name: string;
  sourcePath: string;
  hookManifestPath: string | null;
  originMatchesTask: boolean;
  authorFromSource: boolean;
  dfCallCount: number;
  seedCallCount: number;
  substantiveStepCount: number;
  substanceQualifying: boolean;
  callableAfterReplay: boolean;
};

type SessionResult = {
  task: Task;
  sessionDir: string;
  workspace: string;
  datafetchHome: string;
  driver: DriverRun;
  answerPath: string;
  preparedAnswerPath: string | null;
  snippetResult: unknown;
  trajectoryPath: string | null;
  observerOutcome: unknown;
  governanceResult: unknown;
  libFiles: string[];
  hookManifests: string[];
  learnedCalls: string[];
  helperEvidence: HelperEvidence[];
  crystallised: boolean;
  substanceQualifying: boolean;
  callableAfterReplay: boolean;
  substanceCallableAfterReplay: boolean;
  answerCorrectVsGold: boolean | null;
};

type Summary = {
  phase: GatePhase;
  generated_at: string;
  m1?: {
    table: Array<Record<string, unknown>>;
    helper_crystallised_count: number;
    substance_qualifying_count: number;
    callable_after_replay_count: number;
    criteria_satisfied: boolean;
  };
  m2?: {
    table: Array<Record<string, unknown>>;
    eligible_tasks: number;
    eligible_reuse_count: number;
    eligible_reuse_rate: number;
    threshold: number;
  };
  token_ledger: {
    cap: number;
    spent: number;
    sessions: Array<Record<string, unknown>>;
  };
};

type ExistingM1 = {
  table: Array<Record<string, unknown>>;
  helperCrystallisedCount: number;
  callableAfterReplayCount: number;
  criteriaSatisfied: boolean;
  tokenSpent: number;
  tokenSessions: Array<Record<string, unknown>>;
};

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function addAttr(
  out: Record<string, string | number | boolean>,
  key: string,
  value: unknown,
): void {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    out[key] = value;
  }
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await fsp.readFile(file, "utf8")) as unknown;
}

async function exists(file: string): Promise<boolean> {
  try {
    await fsp.access(file);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(dir: string): Promise<boolean> {
  try {
    return (await fsp.stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

async function findCurrentPointers(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name === "current.json") out.push(full);
    }
  }
  await walk(dir);
  out.sort();
  return out;
}

function weekStartUtc(ts: string): string {
  const d = new Date(ts);
  const day = d.getUTCDay();
  const delta = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + delta);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

async function loadTraceRecords(): Promise<TraceRecord[]> {
  const records: TraceRecord[] = [];
  for (const currentPath of await findCurrentPointers(TRACES_ROOT)) {
    const pointer = await readJson(currentPath) as Record<string, unknown>;
    const objectPath = asString(pointer["object_path"]);
    if (!objectPath) continue;
    const envelope = await readJson(path.join(SNAPSHOT, objectPath)) as Record<string, unknown>;
    const record = (envelope["record"] ?? {}) as Record<string, unknown>;
    const metrics = (record["metrics"] ?? {}) as Record<string, unknown>;
    const agent = (record["agent"] ?? {}) as Record<string, unknown>;
    const outcome = (record["outcome"] ?? {}) as Record<string, unknown>;
    const metadata = (record["metadata"] ?? {}) as Record<string, unknown>;
    const security = (envelope["security"] ?? {}) as Record<string, unknown>;
    const task = (record["task"] ?? {}) as Record<string, unknown>;
    const traceRef = asString(envelope["trace_id"], asString(record["trace_id"]));
    if (!traceRef) continue;
    const sessionRef = asString(record["session_id"]);
    const project = asString(envelope["project_slug"], asString(pointer["project_slug"], "<unknown>"));
    const startedAt = asString(record["timestamp_start"]);
    const attrs: Record<string, string | number | boolean> = {
      kind: "trace",
      trace_ref: traceRef,
      project,
      day: startedAt.slice(0, 10) || "<unknown>",
      week_start: startedAt ? weekStartUtc(startedAt) : "<unknown>",
      model: asString(agent["model"], "<unknown>"),
      share_state: security["syncable"] === true ? "shareable" : "blocked",
      input_tokens: asNumber(metrics["total_input_tokens"]),
      output_tokens: asNumber(metrics["total_output_tokens"]),
      cache_read_tokens: asNumber(metrics["total_cache_read_tokens"]),
      cache_write_tokens: asNumber(metrics["total_cache_creation_tokens"]),
      total_steps: asNumber(metrics["total_steps"]),
      duration_s: asNumber(metrics["total_duration_s"]),
      committed: outcome["committed"] === true,
      skill_invocations_json: JSON.stringify(metadata["skill_invocations"] ?? []),
      task_description: asString(task["description"]),
    };
    addAttr(attrs, "session_ref", sessionRef);
    addAttr(attrs, "started_at", startedAt);
    addAttr(attrs, "cache_hit_rate", metrics["cache_hit_rate"]);
    addAttr(attrs, "safety_tier", security["privacy_tier"]);
    records.push({
      id: `trace-${records.length}`,
      recordKey: `trace:${traceRef}`,
      family: "session",
      entity: `trace-${records.length}`,
      label: `${project} ${sessionRef || "session"}`,
      attributes: attrs,
    });
  }
  records.sort((left, right) => left.recordKey.localeCompare(right.recordKey));
  return records;
}

async function loadAnchorRecords(): Promise<EvalRecord[]> {
  const records: EvalRecord[] = [];
  const batches = (await fsp.readdir(BATCHES_ROOT))
    .filter((name) => name.endsWith(".jsonl.gz"))
    .sort();
  for (const batchName of batches) {
    const full = path.join(BATCHES_ROOT, batchName);
    const text = gunzipSync(await fsp.readFile(full)).toString("utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as Record<string, unknown>;
      if (event["event_type"] !== "git_anchor_created") continue;
      const payload = (event["payload"] ?? {}) as Record<string, unknown>;
      const commitId = (payload["commit_id"] ?? {}) as Record<string, unknown>;
      const commit = asString(commitId["hex"], asString(payload["observed_ref"]));
      const eventRef = asString(event["event_id"]);
      const traceRef = asString(event["trace_id"]);
      if (!commit || !eventRef || !traceRef) continue;
      const attrs: Record<string, string | number | boolean> = {
        kind: "anchor",
        anchor_ref: eventRef,
        commit,
        trace_ref: traceRef,
        event_sequence: asNumber(event["event_sequence"]),
        step_index: asNumber(event["step_index"], -1),
      };
      addAttr(attrs, "event_time", event["event_time"]);
      records.push({
        id: `anchor-${records.length}`,
        recordKey: `anchor:${eventRef}`,
        family: "anchors",
        entity: `anchor-${records.length}`,
        label: `${commit} ${traceRef}`,
        attributes: attrs,
      });
    }
  }
  records.sort((left, right) => left.recordKey.localeCompare(right.recordKey));
  return records;
}

async function loadPackRows(): Promise<PackRow[]> {
  const rows: PackRow[] = [];
  for (const line of (await fsp.readFile(PACK_PATH, "utf8")).split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as PackRow;
    if ((TARGET_TEMPLATES as readonly string[]).includes(row.template_id)) rows.push(row);
  }
  return rows;
}

function m1Phase(series: RunSeries): M1Phase {
  return series === "c" ? "m1c" : "m1b";
}

function m2Phase(series: RunSeries): M2Phase {
  return series === "c" ? "m2c" : "m2b";
}

function allPhase(series: RunSeries): "all" | "allc" {
  return series === "c" ? "allc" : "all";
}

function seriesForPhase(phase: GatePhase): RunSeries {
  return phase === "m1c" || phase === "m2c" || phase === "allc" ? "c" : "b";
}

function isM1Phase(phase: MeasuredPhase): phase is M1Phase {
  return phase.startsWith("m1");
}

function makeTasks(rows: PackRow[], phase: MeasuredPhase): Task[] {
  const out: Task[] = [];
  for (const templateId of TARGET_TEMPLATES) {
    const familyRows = rows.filter((row) => row.template_id === templateId);
    if (familyRows.length !== 8) {
      throw new Error(`expected 8 rows for ${templateId}, found ${familyRows.length}`);
    }
    const selected = isM1Phase(phase)
      ? familyRows.slice(0, 1)
      : familyRows.slice(5, 8);
    selected.forEach((row) => {
      const sibling = familyRows.indexOf(row) + 1;
      out.push({
        id: `${phase}-${row.row_id}-${row.template_id.toLowerCase()}`,
        phase,
        sibling,
        row,
      });
    });
  }
  return out;
}

function recordsForTask(
  traces: TraceRecord[],
  anchors: EvalRecord[],
): EvalRecord[] {
  return [...traces, ...anchors] as EvalRecord[];
}

function renderDfDts(learnedHelpers: string[]): string {
  const learned = learnedHelpers
    .map((name) => `    ${JSON.stringify(name)}(input: Record<string, unknown>): Promise<{ value: unknown }>;`)
    .join("\n");
  return [
    "declare const df: {",
    "  db: {",
    "    records: {",
    "      // family is \"session\" for captured session rows and \"anchors\" for commit-anchor rows.",
    "      findExact(filter: Record<string, unknown>, limit?: number): Promise<Array<{ id: string; recordKey: string; family: string; entity: string; label: string; attributes: Record<string, string | number | boolean> }>>;",
    "      search(query: string, opts?: { limit?: number }): Promise<any[]>;",
    "      findSimilar(query: string, limit?: number): Promise<any[]>;",
    "      hybrid(query: string, opts?: { limit?: number }): Promise<any[]>;",
    "    };",
    "  };",
    "  lib: {",
    "    // Generic template-blind seed utilities. They do not know OpenTraces templates.",
    "    groupSum(input: { records: unknown[]; groupField: string; sumFields: string[]; countField?: string }): Promise<{ value: unknown }>;",
    "    countBy(input: { records: unknown[]; field: string; countField?: string }): Promise<{ value: unknown }>;",
    learned ? "    // Frozen learned helpers from M1b. Prefer a suitable helper during M2b when it clearly matches." : "    // No frozen learned helpers yet.",
    learned,
    "  };",
    "  answer(input: { status: \"answered\" | \"partial\" | \"unsupported\"; value?: unknown; evidence?: unknown; derivation?: unknown; reason?: string }): unknown;",
    "};",
    "",
  ].filter(Boolean).join("\n");
}

function renderTaskMd(task: Task): string {
  return [
    `# Task ${task.row.row_id}`,
    "",
    `Persona: ${task.row.persona}`,
    `Sibling: ${task.sibling}`,
    "",
    "## Question",
    "",
    task.row.question,
    "",
    "## Parameters",
    "",
    "```json",
    JSON.stringify(task.row.params, null, 2),
    "```",
    "",
  ].join("\n");
}

function renderPrompt(task: Task, learnedHelpers: string[]): string {
  const learnedLine = learnedHelpers.length > 0
    ? "Frozen learned helpers are listed in df.d.ts. Prefer a suitable learned helper if one clearly fits this task; otherwise compose from df.db primitives and the generic utilities."
    : "No frozen learned helper is available for this build task. Prefer a reusable dataflow when it fits: fetch records with df.db, then use the generic template-blind df.lib group/count utilities for aggregation or counting before df.answer. If a generic utility does not fit, compose from df.db primitives and inline deterministic code.";
  return [
    "You are in a sealed Datafetch eval workspace.",
    "Read task.md and df.d.ts, then create scripts/answer.ts.",
    "Do not read outside this workspace. Do not inspect hidden snapshot, schema, vendor, or home-directory files. Do not run probes or benchmarks.",
    "The harness will execute scripts/answer.ts once after you finish.",
    "",
    learnedLine,
    "",
    "The generic utilities are not answer-key helpers; choose them only when their generic row aggregation/counting behavior fits the computation.",
    "Return one `df.answer({ status, value, evidence, derivation })` call from the script.",
    "Keep the script deterministic and grounded in the mounted records.",
    "Do not print the generated file back unless you cannot edit the file directly; in that case, return only the complete TypeScript source.",
    "",
  ].join("\n");
}

async function writeSeedHelper(baseDir: string): Promise<void> {
  const seedDir = path.join(baseDir, "lib", "__seed__");
  await fsp.mkdir(seedDir, { recursive: true });
  const sdkUrl = pathToFileURL(path.resolve("src", "sdk", "index.ts")).href;
  await fsp.writeFile(path.join(seedDir, "groupSum.ts"), renderGroupSumSeedSource(sdkUrl), "utf8");
  await fsp.writeFile(path.join(seedDir, "countBy.ts"), renderCountBySeedSource(sdkUrl), "utf8");
}

function renderGroupSumSeedSource(sdkUrl: string): string {
  return `
import { fn } from "${sdkUrl}";
import * as v from "valibot";

type Row = { attributes?: Record<string, unknown> };

function attr(row: Row, key: string): unknown {
  const direct = (row as Record<string, unknown>)[key];
  return direct ?? row.attributes?.[key];
}

function n(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export const groupSum = fn({
  intent: "Group arbitrary rows by one field, count rows, and sum arbitrary numeric fields.",
  examples: [],
  input: v.object({
    records: v.array(v.unknown()),
    groupField: v.string(),
    sumFields: v.array(v.string()),
    countField: v.optional(v.string()),
  }),
  output: v.unknown(),
  async body(input): Promise<unknown> {
    const rows = input.records as Row[];
    const groups = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      const key = String(attr(row, input.groupField) ?? "<unknown>");
      const current = groups.get(key) ?? { group: key, [input.countField ?? "count"]: 0 };
      current[input.countField ?? "count"] = n(current[input.countField ?? "count"]) + 1;
      for (const field of input.sumFields) {
        current[field] = n(current[field]) + n(attr(row, field));
      }
      groups.set(key, current);
    }
    return [...groups.values()].sort((a, b) => String(a.group).localeCompare(String(b.group)));
  },
});
`;
}

function renderCountBySeedSource(sdkUrl: string): string {
  return `
import { fn } from "${sdkUrl}";
import * as v from "valibot";

type Row = { attributes?: Record<string, unknown> };

function attr(row: Row, key: string): unknown {
  const direct = (row as Record<string, unknown>)[key];
  return direct ?? row.attributes?.[key];
}

export const countBy = fn({
  intent: "Count arbitrary rows by one field.",
  examples: [],
  input: v.object({
    records: v.array(v.unknown()),
    field: v.string(),
    countField: v.optional(v.string()),
  }),
  output: v.unknown(),
  async body(input): Promise<unknown> {
    const rows = input.records as Row[];
    const groups = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      const key = String(attr(row, input.field) ?? "<unknown>");
      const current = groups.get(key) ?? { group: key, [input.countField ?? "count"]: 0 };
      current[input.countField ?? "count"] = Number(current[input.countField ?? "count"] ?? 0) + 1;
      groups.set(key, current);
    }
    return [...groups.values()].sort((a, b) => String(a.group).localeCompare(String(b.group)));
  },
});
`;
}

async function prepareWorkspace(input: {
  task: Task;
  sessionDir: string;
  datafetchHome: string;
  learnedHelpers: string[];
}): Promise<string> {
  const workspace = path.join(input.sessionDir, "workspace");
  await fsp.rm(workspace, { recursive: true, force: true });
  await fsp.mkdir(path.join(workspace, "scripts"), { recursive: true });
  await fsp.writeFile(path.join(workspace, "task.md"), renderTaskMd(input.task), "utf8");
  await fsp.writeFile(path.join(workspace, "df.d.ts"), renderDfDts(input.learnedHelpers), "utf8");
  await fsp.writeFile(
    path.join(input.sessionDir, "probe-contract.json"),
    JSON.stringify({
      row_id: input.task.row.row_id,
      persona: input.task.row.persona,
      template_id: input.task.row.template_id,
      sibling: input.task.sibling,
      phase: input.task.phase,
      datafetch_home: input.datafetchHome,
      learned_helpers: input.learnedHelpers,
    }, null, 2) + "\n",
    "utf8",
  );
  return workspace;
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:ts|typescript|javascript|js)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed);
  return match?.[1] ?? trimmed;
}

function extractDriverAuthoredSource(text: string): string {
  const whole = stripCodeFence(text);
  if (whole.includes("df.answer") && !whole.includes("```")) return whole;
  const fenceRe = /```(?:ts|typescript|javascript|js)?\s*\n([\s\S]*?)\n```/gi;
  for (const match of text.matchAll(fenceRe)) {
    const body = match[1] ?? "";
    if (body.includes("df.answer")) return body.trim();
  }
  return whole;
}

async function ensureAnswerFromDriver(workspace: string, driver: DriverRun): Promise<string> {
  const answerPath = path.join(workspace, "scripts", "answer.ts");
  let source = "";
  try {
    source = await fsp.readFile(answerPath, "utf8");
  } catch {
    source = "";
  }
  if (source.includes("df.answer")) return answerPath;
  const fallback = extractDriverAuthoredSource(driver.finalMessage);
  if (fallback.includes("df.answer")) {
    await fsp.writeFile(answerPath, fallback.endsWith("\n") ? fallback : `${fallback}\n`, "utf8");
    return answerPath;
  }
  throw new Error(`driver did not author scripts/answer.ts with df.answer in ${workspace}`);
}

function renderQuestionComment(question: string): string {
  const compact = question.replace(/\s+/g, " ").trim();
  return `// Question (verbatim): ${compact}\n//\n`;
}

function prepareAnswerSource(source: string, task: Task): string {
  let body = stripCodeFence(source)
    .replace(/^\s*export\s*\{\s*\}\s*;?\s*$/gm, "")
    .replace(/^\s*export\s+default\s+/gm, "");
  if (/^\s*(?:void\s+)?main\s*\(\s*\)\s*;?\s*$/m.test(body)) {
    body = body.replace(/^\s*(?:void\s+)?main\s*\(\s*\)\s*;?\s*$/m, "");
    return `${renderQuestionComment(task.row.question)}${body}\nreturn await main();\n`;
  }
  if (!/\breturn\s+df\.answer\s*\(/.test(body)) {
    body = body.replace(/\n\s*df\.answer\s*\(([\s\S]*?)\)\s*;?\s*$/, "\nreturn df.answer($1);\n");
  }
  return `${renderQuestionComment(task.row.question)}${body}`;
}

function spawnProcess(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; timeoutMs?: number },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;
    let closed = false;
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
          setTimeout(() => {
            if (!closed) child.kill("SIGKILL");
          }, 2_000).unref();
        }, options.timeoutMs)
      : undefined;
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: `${Buffer.concat(stderr).toString("utf8")}${String(err)}`,
        exitCode: 1,
      });
    });
    child.on("close", (code, signal) => {
      closed = true;
      if (timer) clearTimeout(timer);
      const stderrText = Buffer.concat(stderr).toString("utf8");
      resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: timedOut
          ? `${stderrText}\n[timed out after ${options.timeoutMs}ms signal=${signal ?? ""}]\n`
          : stderrText,
        exitCode: typeof code === "number" ? code : 1,
      });
    });
  });
}

function parseDriverUsage(parsed: Record<string, unknown> | null): DriverUsage {
  const rawUsage = parsed && typeof parsed["usage"] === "object"
    ? parsed["usage"] as Record<string, unknown>
    : {};
  const inputTokens = asNumber(rawUsage["input_tokens"]);
  const cacheReadInputTokens = asNumber(rawUsage["cache_read_input_tokens"]);
  const cacheCreationInputTokens = asNumber(rawUsage["cache_creation_input_tokens"]);
  const outputTokens = asNumber(rawUsage["output_tokens"]);
  const turns = asNumber(parsed?.["num_turns"], inputTokens || outputTokens ? 1 : 0);
  return {
    inputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    outputTokens,
    turns,
    modelContextTokens: inputTokens + cacheReadInputTokens + cacheCreationInputTokens + outputTokens,
  };
}

async function runDriver(input: {
  task: Task;
  workspace: string;
  datafetchHome: string;
  learnedHelpers: string[];
}): Promise<DriverRun> {
  const prompt = renderPrompt(input.task, input.learnedHelpers);
  const args = [
    "-p",
    "--model",
    MODEL,
    "--safe-mode",
    "--no-session-persistence",
    "--output-format",
    "json",
    prompt,
  ];
  const started = performance.now();
  const env = {
    ...process.env,
    DATAFETCH_HOME: input.datafetchHome,
    ATLASFS_HOME: input.datafetchHome,
  };
  const run = await spawnProcess("claude", args, {
    cwd: input.workspace,
    env,
    timeoutMs: DRIVER_TIMEOUT_MS,
  });
  let parsed: Record<string, unknown> | null = null;
  let finalMessage = run.stdout.trim();
  try {
    parsed = JSON.parse(run.stdout) as Record<string, unknown>;
    const result = parsed["result"];
    if (typeof result === "string") finalMessage = result;
    else if (result !== undefined) finalMessage = JSON.stringify(result);
  } catch {
    parsed = null;
  }
  return {
    command: `claude ${args.slice(0, -1).join(" ")} <prompt>`,
    stdout: run.stdout,
    stderr: run.stderr,
    finalMessage,
    elapsedMs: performance.now() - started,
    exitCode: run.exitCode,
    usage: parseDriverUsage(parsed),
  };
}

async function listRelativeFiles(dir: string): Promise<string[]> {
  if (!(await isDirectory(dir))) return [];
  const out: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) out.push(path.relative(dir, full));
    }
  }
  await walk(dir);
  return out.sort();
}

async function readTrajectoryIfPresent(baseDir: string, trajectoryId: string | undefined): Promise<TrajectoryRecord | null> {
  if (!trajectoryId) return null;
  const file = path.join(baseDir, "trajectories", `${trajectoryId}.json`);
  try {
    return JSON.parse(await fsp.readFile(file, "utf8")) as TrajectoryRecord;
  } catch {
    return null;
  }
}

function learnedLibCalls(trajectory: TrajectoryRecord | null): string[] {
  if (!trajectory) return [];
  return trajectory.calls
    .filter((call) => {
      if (!call.primitive.startsWith("lib.")) return false;
      const name = call.primitive.slice("lib.".length);
      return !SEED_HELPERS.has(name);
    })
    .map((call) => call.primitive.slice("lib.".length));
}

function anyCallableManifest(manifests: unknown[]): boolean {
  return manifests.some((m) => {
    if (!m || typeof m !== "object") return false;
    const rec = m as Record<string, unknown>;
    return rec["callability"] === "callable" || rec["callability"] === "callable-with-fallback";
  });
}

async function readHookManifests(baseDir: string): Promise<unknown[]> {
  const dir = path.join(baseDir, "hooks", TENANT_ID);
  const files = await listRelativeFiles(dir);
  const out: unknown[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(await fsp.readFile(path.join(dir, file), "utf8")) as unknown);
    } catch {
      // skip corrupt evidence file
    }
  }
  return out;
}

function normaliseComparable(value: unknown, unorderedArrays: boolean): unknown {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Number(value.toFixed(6)) : value;
  }
  if (Array.isArray(value)) {
    const mapped = value.map((item) => normaliseComparable(item, unorderedArrays));
    return unorderedArrays
      ? mapped.sort((a, b) => stableJson(a).localeCompare(stableJson(b)))
      : mapped;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = normaliseComparable((value as Record<string, unknown>)[key], unorderedArrays);
    }
    return out;
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function answerCorrectVsGold(row: PackRow, snippet: unknown): boolean | null {
  if (!snippet || typeof snippet !== "object") return null;
  const answer = (snippet as Record<string, unknown>)["answer"];
  if (!answer || typeof answer !== "object") return null;
  const value = (answer as Record<string, unknown>)["value"];
  if (value === undefined) return null;
  const unorderedArrays = row.answer_type.includes("set") && row.answer_type !== "ordered_set";
  return stableJson(normaliseComparable(value, unorderedArrays)) ===
    stableJson(normaliseComparable(row.gold, unorderedArrays));
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sourceMentionsTask(source: string, question: string): boolean {
  const compactQuestion = compactText(question);
  if (compactQuestion.length === 0) return false;
  if (source.includes(compactQuestion)) return true;
  return source.includes(compactQuestion.slice(0, Math.min(100, compactQuestion.length)));
}

function dfCallNames(source: string): string[] {
  return [...source.matchAll(/\bdf\.(db|lib)\.([A-Za-z0-9_$]+)/g)]
    .map((match) => `${match[1]}.${match[2]}`);
}

async function helperEvidenceForTask(baseDir: string, task: Task): Promise<HelperEvidence[]> {
  const libDir = path.join(baseDir, "lib", TENANT_ID);
  const hookDir = path.join(baseDir, "hooks", TENANT_ID);
  const out: HelperEvidence[] = [];
  for (const file of await listRelativeFiles(libDir)) {
    if (!file.endsWith(".ts")) continue;
    const sourcePath = path.join(libDir, file);
    const source = await fsp.readFile(sourcePath, "utf8");
    const name = path.basename(file, ".ts");
    const hookManifestPath = path.join(hookDir, `${name}.json`);
    const manifest = await exists(hookManifestPath)
      ? await readJson(hookManifestPath) as Record<string, unknown>
      : null;
    const stats = manifest && typeof manifest["stats"] === "object"
      ? manifest["stats"] as Record<string, unknown>
      : {};
    const calls = dfCallNames(source);
    const seedCallCount = calls.filter((call) => {
      if (!call.startsWith("lib.")) return false;
      return SEED_HELPERS.has(call.slice("lib.".length));
    }).length;
    const originMatchesTask = sourceMentionsTask(source, task.row.question);
    const authorFromSource = /@author:\s*authorFromSource/.test(source);
    const substantiveStepCount = Math.max(0, calls.length - Math.min(seedCallCount, 1));
    const callableAfterReplay =
      manifest !== null &&
      (manifest["callability"] === "callable" || manifest["callability"] === "callable-with-fallback") &&
      asNumber(stats["replaysPassed"]) > 0;
    const hasCompositionBeyondSingleSeed = calls.length >= 3 || (seedCallCount === 0 && calls.length >= 2);
    out.push({
      name,
      sourcePath,
      hookManifestPath: manifest === null ? null : hookManifestPath,
      originMatchesTask,
      authorFromSource,
      dfCallCount: calls.length,
      seedCallCount,
      substantiveStepCount,
      substanceQualifying: originMatchesTask && (authorFromSource || hasCompositionBeyondSingleSeed),
      callableAfterReplay,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

async function renderHelperEvidenceMarkdown(evidence: HelperEvidence[]): Promise<string> {
  const lines: string[] = ["# Helper Evidence", ""];
  if (evidence.length === 0) {
    lines.push("No learned helper files were produced.", "");
    return lines.join("\n");
  }
  for (const helper of evidence) {
    lines.push(`## ${helper.name}`, "");
    lines.push(`- source: ${helper.sourcePath}`);
    lines.push(`- hook_manifest: ${helper.hookManifestPath ?? ""}`);
    lines.push(`- origin_matches_task: ${helper.originMatchesTask}`);
    lines.push(`- author_from_source: ${helper.authorFromSource}`);
    lines.push(`- df_call_count: ${helper.dfCallCount}`);
    lines.push(`- seed_call_count: ${helper.seedCallCount}`);
    lines.push(`- substantive_step_count: ${helper.substantiveStepCount}`);
    lines.push(`- substance_qualifying: ${helper.substanceQualifying}`);
    lines.push(`- callable_after_replay: ${helper.callableAfterReplay}`);
    lines.push("", "### Source", "", "```ts");
    lines.push(await fsp.readFile(helper.sourcePath, "utf8"));
    lines.push("```", "", "### Hook Manifest", "", "```json");
    lines.push(helper.hookManifestPath ? await fsp.readFile(helper.hookManifestPath, "utf8") : "null");
    lines.push("```", "");
  }
  return lines.join("\n");
}

async function runTask(input: {
  task: Task;
  records: EvalRecord[];
  runRoot: string;
  m1Root: string;
  learnedHelpers: string[];
  enableLearning: boolean;
  enablePureComputeGate: boolean;
}): Promise<SessionResult> {
  const sessionDir = path.join(input.runRoot, input.task.id);
  const datafetchHome = path.join(sessionDir, "datafetch-home");
  await fsp.rm(sessionDir, { recursive: true, force: true });
  await fsp.mkdir(datafetchHome, { recursive: true });
  await writeSeedHelper(datafetchHome);

  if (input.learnedHelpers.length > 0) {
    const frozen = path.join(input.m1Root, "frozen-lib");
    if (await isDirectory(path.join(frozen, "lib", TENANT_ID))) {
      await fsp.mkdir(path.join(datafetchHome, "lib"), { recursive: true });
      await fsp.cp(path.join(frozen, "lib", TENANT_ID), path.join(datafetchHome, "lib", TENANT_ID), { recursive: true, force: true });
    }
    if (await isDirectory(path.join(frozen, "hooks", TENANT_ID))) {
      await fsp.mkdir(path.join(datafetchHome, "hooks"), { recursive: true });
      await fsp.cp(path.join(frozen, "hooks", TENANT_ID), path.join(datafetchHome, "hooks", TENANT_ID), { recursive: true, force: true });
    }
  }

  const workspace = await prepareWorkspace({
    task: input.task,
    sessionDir,
    datafetchHome,
    learnedHelpers: input.learnedHelpers,
  });
  process.env["DATAFETCH_INTERFACE_MODE"] = "hooks-draft";
  process.env["DATAFETCH_DISABLE_LEARNING"] = input.enableLearning ? "0" : "1";
  process.env["DATAFETCH_CONVERGENCE_N"] = "1";
  if (input.enablePureComputeGate) {
    process.env["DATAFETCH_GATE_PURE_COMPUTE"] = "1";
  } else {
    delete process.env["DATAFETCH_GATE_PURE_COMPUTE"];
  }
  const driver = await runDriver({
    task: input.task,
    workspace,
    datafetchHome,
    learnedHelpers: input.learnedHelpers,
  });
  await fsp.writeFile(path.join(sessionDir, "driver-command.txt"), `${driver.command}\n`, "utf8");
  await fsp.writeFile(path.join(sessionDir, "driver-stdout.txt"), driver.stdout, "utf8");
  await fsp.writeFile(path.join(sessionDir, "driver-stderr.txt"), driver.stderr, "utf8");
  await fsp.writeFile(path.join(sessionDir, "driver-final-message.txt"), driver.finalMessage, "utf8");
  await fsp.writeFile(path.join(sessionDir, "driver-usage.json"), JSON.stringify(driver.usage, null, 2) + "\n", "utf8");

  const answerPath = await ensureAnswerFromDriver(workspace, driver);
  const rawAnswer = await fsp.readFile(answerPath, "utf8");
  const prepared = prepareAnswerSource(rawAnswer, input.task);
  const preparedAnswerPath = path.join(sessionDir, "prepared-answer.ts");
  await fsp.writeFile(preparedAnswerPath, prepared, "utf8");

  process.env["DATAFETCH_INTERFACE_MODE"] = "hooks-draft";
  process.env["DATAFETCH_DISABLE_LEARNING"] = input.enableLearning ? "0" : "1";
  process.env["DATAFETCH_CONVERGENCE_N"] = "1";
  if (input.enablePureComputeGate) {
    process.env["DATAFETCH_GATE_PURE_COMPUTE"] = "1";
  } else {
    delete process.env["DATAFETCH_GATE_PURE_COMPUTE"];
  }
  process.env["DATAFETCH_HOME"] = datafetchHome;
  process.env["ATLASFS_HOME"] = datafetchHome;

  const registry = new InMemoryMountRuntimeRegistry();
  setMountRuntimeRegistry(registry);
  const mountId = `${input.task.id}-records`;
  const adapter = new EvalRecordsMount(mountId, input.records);
  registry.register(mountId, makeMountRuntime({
    mountId,
    adapter,
    identMap: [{ ident: "records", name: "records" }],
  }));

  const { snippetRuntime } = await installSnippetRuntime({
    baseDir: datafetchHome,
    skipSeedMirror: true,
  });
  const { observer } = installObserver({
    baseDir: datafetchHome,
    tenantId: TENANT_ID,
    snippetRuntime,
    identifierAttributeKeys: ["id", "entity", "code", "slug", "project", "commit"],
  });

  const snippet = await snippetRuntime.run({
    source: prepared,
    sourcePath: answerPath,
    phase: "commit",
    sessionCtx: {
      sessionId: input.task.id,
      tenantId: TENANT_ID,
      mountIds: [mountId],
      baseDir: datafetchHome,
      requireSubstrateRootedChain: true,
      snippetTimeoutMs: SNIPPET_TIMEOUT_MS,
    },
  });
  if (snippet.trajectoryId) {
    const observePromise = observer.observerPromise.get(snippet.trajectoryId);
    if (observePromise) {
      await Promise.race([
        observePromise.then(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, OBSERVER_AWAIT_MS)),
      ]);
    }
  }
  const observerOutcome = snippet.trajectoryId && observer.observerPromise.get(snippet.trajectoryId)
    ? await observer.observerPromise.get(snippet.trajectoryId)!.catch((err) => ({ kind: "error", message: String(err) }))
    : { kind: "missing", reason: "observer promise not found" };
  const governanceResult = await runGovernanceGate({ baseDir: datafetchHome, tenantId: TENANT_ID });
  const trajectory = await readTrajectoryIfPresent(datafetchHome, snippet.trajectoryId);
  const trajectoryPath = snippet.trajectoryId
    ? path.join(datafetchHome, "trajectories", `${snippet.trajectoryId}.json`)
    : null;
  const manifests = await readHookManifests(datafetchHome);
  const libFiles = await listRelativeFiles(path.join(datafetchHome, "lib", TENANT_ID));
  const hookManifests = await listRelativeFiles(path.join(datafetchHome, "hooks", TENANT_ID));
  const learnedCalls = learnedLibCalls(trajectory);
  const helperEvidence = await helperEvidenceForTask(datafetchHome, input.task);
  const crystallised = typeof observerOutcome === "object" &&
    observerOutcome !== null &&
    (observerOutcome as Record<string, unknown>)["kind"] === "crystallised";
  const callableAfterReplay = Boolean((governanceResult as { passed?: boolean }).passed) || anyCallableManifest(manifests);
  const substanceQualifying = helperEvidence.some((helper) => helper.substanceQualifying);
  const substanceCallableAfterReplay = helperEvidence.some((helper) => helper.substanceQualifying && helper.callableAfterReplay);
  const correct = answerCorrectVsGold(input.task.row, snippet);

  await fsp.writeFile(path.join(sessionDir, "snippet-result.json"), JSON.stringify(snippet, null, 2) + "\n", "utf8");
  if (trajectoryPath && await exists(trajectoryPath)) {
    await fsp.copyFile(trajectoryPath, path.join(sessionDir, "trajectory.json"));
  }
  await fsp.writeFile(path.join(sessionDir, "observer-outcome.json"), JSON.stringify(observerOutcome, null, 2) + "\n", "utf8");
  await fsp.writeFile(path.join(sessionDir, "governance-result.json"), JSON.stringify(governanceResult, null, 2) + "\n", "utf8");
  await fsp.writeFile(path.join(sessionDir, "lib-list.json"), JSON.stringify(libFiles, null, 2) + "\n", "utf8");
  await fsp.writeFile(path.join(sessionDir, "hook-manifests.json"), JSON.stringify(manifests, null, 2) + "\n", "utf8");
  await fsp.writeFile(path.join(sessionDir, "helper-evidence.json"), JSON.stringify(helperEvidence, null, 2) + "\n", "utf8");
  await fsp.writeFile(path.join(sessionDir, "helper-evidence.md"), await renderHelperEvidenceMarkdown(helperEvidence), "utf8");
  await registry.closeAll();

  return {
    task: input.task,
    sessionDir,
    workspace,
    datafetchHome,
    driver,
    answerPath,
    preparedAnswerPath,
    snippetResult: snippet,
    trajectoryPath,
    observerOutcome,
    governanceResult,
    libFiles,
    hookManifests,
    learnedCalls,
    helperEvidence,
    crystallised,
    substanceQualifying,
    callableAfterReplay,
    substanceCallableAfterReplay,
    answerCorrectVsGold: correct,
  };
}

async function freezeM1Library(results: SessionResult[], m1Root: string): Promise<string[]> {
  const frozen = path.join(m1Root, "frozen-lib");
  await fsp.rm(frozen, { recursive: true, force: true });
  await fsp.mkdir(path.join(frozen, "lib", TENANT_ID), { recursive: true });
  await fsp.mkdir(path.join(frozen, "hooks", TENANT_ID), { recursive: true });
  const helpers = new Set<string>();
  for (const result of results) {
    const qualifyingHelpers = new Set(
      result.helperEvidence
        .filter((helper) => helper.substanceQualifying && helper.callableAfterReplay)
        .map((helper) => helper.name),
    );
    if (qualifyingHelpers.size === 0) continue;
    const srcLib = path.join(result.datafetchHome, "lib", TENANT_ID);
    for (const file of await listRelativeFiles(srcLib)) {
      if (!file.endsWith(".ts")) continue;
      const helperName = path.basename(file, ".ts");
      if (!qualifyingHelpers.has(helperName)) continue;
      helpers.add(helperName);
      const dst = path.join(frozen, "lib", TENANT_ID, `${helperName}.ts`);
      if (!(await exists(dst))) {
        await fsp.copyFile(path.join(srcLib, file), dst);
      }
    }
    const srcHooks = path.join(result.datafetchHome, "hooks", TENANT_ID);
    for (const file of await listRelativeFiles(srcHooks)) {
      if (!file.endsWith(".json")) continue;
      if (!qualifyingHelpers.has(path.basename(file, ".json"))) continue;
      const dst = path.join(frozen, "hooks", TENANT_ID, file);
      if (!(await exists(dst))) {
        await fsp.copyFile(path.join(srcHooks, file), dst);
      }
    }
  }
  const helperList = [...helpers].sort();
  await fsp.writeFile(path.join(frozen, "helpers.json"), JSON.stringify(helperList, null, 2) + "\n", "utf8");
  return helperList;
}

async function readExistingM1(config: RunConfig): Promise<ExistingM1 | null> {
  if (!(await exists(config.summaryPath))) return null;
  try {
    const summary = JSON.parse(await fsp.readFile(config.summaryPath, "utf8")) as Summary;
    if (!summary.m1?.criteria_satisfied) return null;
    return {
      table: summary.m1.table,
      helperCrystallisedCount: summary.m1.helper_crystallised_count,
      callableAfterReplayCount: summary.m1.callable_after_replay_count,
      criteriaSatisfied: summary.m1.criteria_satisfied,
      tokenSpent: summary.token_ledger.spent,
      tokenSessions: summary.token_ledger.sessions,
    };
  } catch {
    return null;
  }
}

function m1Table(results: SessionResult[]): Array<Record<string, unknown>> {
  return results.map((result) => ({
    session: result.task.id,
    persona: result.task.row.persona,
    template: result.task.row.template_id,
    crystallised: result.crystallised,
    substance_qualifying: result.substanceQualifying,
    callable_after_replay: result.substanceCallableAfterReplay,
    answer_correct_vs_gold: result.answerCorrectVsGold,
    trajectory: result.trajectoryPath,
    observer_outcome: path.join(result.sessionDir, "observer-outcome.json"),
    helper_evidence: path.join(result.sessionDir, "helper-evidence.md"),
    lib: path.join(result.datafetchHome, "lib", TENANT_ID),
    hooks: path.join(result.datafetchHome, "hooks", TENANT_ID),
  }));
}

function m2Table(results: SessionResult[], eligibleTemplates: Set<string>): Array<Record<string, unknown>> {
  return results.map((result) => ({
    task: result.task.id,
    eligible: eligibleTemplates.has(result.task.row.template_id),
    df_lib_called: result.learnedCalls.length > 0,
    helper: result.learnedCalls[0] ?? null,
    answer_correct_vs_gold: result.answerCorrectVsGold,
    trajectory: result.trajectoryPath,
  }));
}

function markdownTable(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const lines = [
    `| ${columns.join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
  ];
  for (const row of rows) {
    lines.push(`| ${columns.map((col) => String(row[col] ?? "")).join(" | ")} |`);
  }
  return `${lines.join("\n")}\n`;
}

async function writeRunLog(input: {
  phase: GatePhase;
  m1Phase: M1Phase;
  m2Phase: M2Phase;
  config: RunConfig;
  m1Results: SessionResult[];
  m2Results: SessionResult[];
  summary: Summary;
  eligibleTemplates: Set<string>;
}): Promise<void> {
  const logPath = path.join("experiments", "episodes", "05-opentraces-arms", "RUN-LOG.md");
  const m1Crystallised = input.summary.m1?.helper_crystallised_count ?? input.m1Results.filter((r) => r.crystallised).length;
  const m1Substance = input.summary.m1?.substance_qualifying_count ?? input.m1Results.filter((r) => r.substanceQualifying).length;
  const m1Callable = input.summary.m1?.callable_after_replay_count ?? input.m1Results.filter((r) => r.substanceCallableAfterReplay).length;
  const m2Rows = m2Table(input.m2Results, input.eligibleTemplates);
  const m2Eligible = m2Rows.filter((r) => r.eligible).length;
  const m2Reuse = m2Rows.filter((r) => r.eligible && r.df_lib_called).length;
  const rawLog = await fsp.readFile(logPath, "utf8").catch(() => "");
  const attempts = [...rawLog.matchAll(/^## Attempt (\d+),/gm)].map((m) => Number(m[1])).filter(Number.isFinite);
  const attempt = attempts.length === 0 ? 1 : Math.max(...attempts) + 1;
  const entry = [
    "",
    `## Attempt ${attempt}, 2026-06-11, ${input.config.label} corrected build-agent execution`,
    "",
    `- Milestone/gate: ${input.phase}.`,
    `- Action: ran the corrected ${input.config.label} runner under \`eval/opentraces/scripts/\`: template-blind seed utilities only, no pre-written answer scaffold, driver-authored \`scripts/answer.ts\`, reuse-preference prompt only, isolated DATAFETCH_HOME directories under \`eval/opentraces/probes/\`, and no commits or pushes. For M1c only, the pre-registered \`DATAFETCH_GATE_PURE_COMPUTE=1\` opt-in was set; phase-2 reuse ran without learning.`,
    `- Evidence observed: ${input.m1Phase} sessions ${input.summary.m1?.table.length ?? input.m1Results.length}; helpers crystallised ${m1Crystallised}; substance-qualifying helpers ${m1Substance}; substance-callable-after-replay evidence ${m1Callable}; ${input.m1Phase} artifacts under \`${path.relative(process.cwd(), input.config.m1Root)}/\`. ${input.m2Phase} sessions ${input.m2Results.length}; eligible reuse ${m2Reuse}/${m2Eligible}; ${input.m2Phase} artifacts under \`${path.relative(process.cwd(), input.config.m2Root)}/\`.`,
    `- Decision: verdicts remain PENDING for supervisor; ${input.summary.m1?.criteria_satisfied ? `${input.m1Phase} criteria satisfied by build-agent evidence, so ${input.m2Phase} may run/has run` : `${input.m1Phase} criteria not satisfied or incomplete, so ${input.m2Phase} is skipped`}.`,
    `- Token/turn ledger: spent ${input.summary.token_ledger.spent} / ${input.config.tokenCap} model-context driver tokens across ${input.summary.token_ledger.sessions.length} driver session(s).`,
    "",
  ].join("\n");
  await fsp.appendFile(logPath, entry, "utf8");
}

function parseArgs(argv: string[]): GatePhase {
  const phaseArg = argv.find((arg) => arg.startsWith("--phase="));
  const phase = phaseArg ? phaseArg.slice("--phase=".length) : "all";
  if (
    phase === "m1b" ||
    phase === "m2b" ||
    phase === "m1c" ||
    phase === "m2c" ||
    phase === "all" ||
    phase === "allc"
  ) {
    return phase;
  }
  throw new Error("--phase must be m1b, m2b, m1c, m2c, all, or allc");
}

async function main(): Promise<void> {
  const phase = parseArgs(process.argv.slice(2));
  const series = seriesForPhase(phase);
  const config = RUN_CONFIG[series];
  const selectedM1Phase = m1Phase(series);
  const selectedM2Phase = m2Phase(series);
  const selectedAllPhase = allPhase(series);
  await fsp.mkdir(config.m1Root, { recursive: true });
  await fsp.mkdir(config.m2Root, { recursive: true });
  const [rows, traces, anchors] = await Promise.all([
    loadPackRows(),
    loadTraceRecords(),
    loadAnchorRecords(),
  ]);
  const records = recordsForTask(traces, anchors);
  const tokenSessions: Array<Record<string, unknown>> = [];
  let spent = 0;
  const m1Results: SessionResult[] = [];
  const m2Results: SessionResult[] = [];
  const existingM1 = await readExistingM1(config);
  if (phase === selectedM2Phase && existingM1) {
    spent = existingM1.tokenSpent;
    tokenSessions.push(...existingM1.tokenSessions);
  }

  if (phase === selectedM1Phase || phase === selectedAllPhase) {
    for (const task of makeTasks(rows, selectedM1Phase)) {
      if (spent >= config.tokenCap) throw new Error(`token cap reached before ${task.id}`);
      const result = await runTask({
        task,
        records,
        runRoot: config.m1Root,
        m1Root: config.m1Root,
        learnedHelpers: [],
        enableLearning: true,
        enablePureComputeGate: selectedM1Phase === "m1c",
      });
      m1Results.push(result);
      spent += result.driver.usage.modelContextTokens;
      tokenSessions.push({
        session: task.id,
        phase: selectedM1Phase,
        tokens: result.driver.usage.modelContextTokens,
        turns: result.driver.usage.turns,
      });
    }
  }

  const m1Rows = m1Results.length > 0 ? m1Table(m1Results) : existingM1?.table ?? [];
  let criteriaSatisfied =
    m1Results.some((r) => r.substanceQualifying) &&
    m1Results.some((r) => r.substanceCallableAfterReplay);
  let eligibleTemplates = new Set(
    m1Results
      .filter((r) => r.substanceQualifying && r.substanceCallableAfterReplay)
      .map((r) => r.task.row.template_id),
  );
  let learnedHelpers: string[] = [];
  if (m1Results.length > 0) {
    learnedHelpers = await freezeM1Library(m1Results, config.m1Root);
    await fsp.writeFile(
      path.join(config.m1Root, `${selectedM1Phase}-table.md`),
      markdownTable(m1Rows, ["session", "persona", "template", "crystallised", "substance_qualifying", "callable_after_replay", "answer_correct_vs_gold", "helper_evidence"]),
      "utf8",
    );
  } else if (await exists(path.join(config.m1Root, "frozen-lib", "helpers.json"))) {
    learnedHelpers = JSON.parse(await fsp.readFile(path.join(config.m1Root, "frozen-lib", "helpers.json"), "utf8")) as string[];
    criteriaSatisfied = existingM1?.criteriaSatisfied === true && learnedHelpers.length > 0;
    eligibleTemplates = new Set(
      (existingM1?.table ?? [])
        .filter((row) => row["substance_qualifying"] === true && row["callable_after_replay"] === true)
        .map((row) => String(row["template"] ?? ""))
        .filter(Boolean),
    );
  }

  if ((phase === selectedM2Phase || phase === selectedAllPhase) && criteriaSatisfied && eligibleTemplates.size > 0) {
    for (const task of makeTasks(rows, selectedM2Phase)) {
      if (spent >= config.tokenCap) throw new Error(`token cap reached before ${task.id}`);
      const result = await runTask({
        task,
        records,
        runRoot: config.m2Root,
        m1Root: config.m1Root,
        learnedHelpers,
        enableLearning: false,
        enablePureComputeGate: false,
      });
      m2Results.push(result);
      spent += result.driver.usage.modelContextTokens;
      tokenSessions.push({
        session: task.id,
        phase: selectedM2Phase,
        tokens: result.driver.usage.modelContextTokens,
        turns: result.driver.usage.turns,
      });
    }
    await fsp.writeFile(
      path.join(config.m2Root, `${selectedM2Phase}-table.md`),
      markdownTable(m2Table(m2Results, eligibleTemplates), ["task", "eligible", "df_lib_called", "helper", "answer_correct_vs_gold"]),
      "utf8",
    );
  }

  const m2Rows = m2Table(m2Results, eligibleTemplates);
  const eligible = m2Rows.filter((row) => row.eligible).length;
  const reused = m2Rows.filter((row) => row.eligible && row.df_lib_called).length;
  const summary: Summary = {
    phase,
    generated_at: new Date().toISOString(),
    m1: {
      table: m1Rows,
      helper_crystallised_count: m1Results.length > 0
        ? m1Results.filter((r) => r.crystallised).length
        : existingM1?.helperCrystallisedCount ?? 0,
      substance_qualifying_count: m1Results.length > 0
        ? m1Results.filter((r) => r.substanceQualifying).length
        : m1Rows.filter((row) => row["substance_qualifying"] === true).length,
      callable_after_replay_count: m1Results.length > 0
        ? m1Results.filter((r) => r.substanceCallableAfterReplay).length
        : existingM1?.callableAfterReplayCount ?? 0,
      criteria_satisfied: criteriaSatisfied,
    },
    m2: {
      table: m2Rows,
      eligible_tasks: eligible,
      eligible_reuse_count: reused,
      eligible_reuse_rate: eligible === 0 ? 0 : reused / eligible,
      threshold: 0.4,
    },
    token_ledger: {
      cap: config.tokenCap,
      spent,
      sessions: tokenSessions,
    },
  };
  await fsp.writeFile(config.summaryPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
  await fsp.writeFile(config.ledgerPath, JSON.stringify(summary.token_ledger, null, 2) + "\n", "utf8");
  await writeRunLog({
    phase,
    m1Phase: selectedM1Phase,
    m2Phase: selectedM2Phase,
    config,
    m1Results,
    m2Results,
    summary,
    eligibleTemplates,
  });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(1);
  });
}
