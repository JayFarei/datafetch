import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
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
import { installSnippetRuntime } from "../../../src/snippet/install.js";
import { EvalRecordsMount, type EvalRecord } from "../../harness/evalRecords.js";
import { answerValue, gradeAnswer, loadTemplateSpecs, type GradeResult, type TemplateSpec } from "./opentraces_grader_v2.js";

const ROOT = path.resolve("eval/opentraces");
const SNAPSHOT = path.join(ROOT, "vendor", "snapshot");
const PACK_PATH = path.join(ROOT, "questions", "pack.jsonl");
const PACK_YAML = path.join(ROOT, "templates", "pack.yaml");
const SUBSAMPLE_PATH = path.join(ROOT, "prereg", "plan012-amendment-b-m3-subsample-v1.json");
const TRACES_ROOT = path.join(SNAPSHOT, "objects", "traces", "v1");
const BATCHES_ROOT = path.join(SNAPSHOT, "events", "v1", "batches");
const MODEL = "claude-sonnet-4-6";
const DRIVER_TIMEOUT_MS = 300_000;
const SNIPPET_TIMEOUT_MS = 300_000;
const SNIPPET_ARTIFACT_ARRAY_LIMIT = 20;
const SNIPPET_ARTIFACT_OBJECT_LIMIT = 50;
const SNIPPET_ARTIFACT_STRING_LIMIT = 4_000;
const SNIPPET_ARTIFACT_DEPTH_LIMIT = 5;
const FULL_CAP = 161_000_000;
const REHEARSAL_CAP = 3_000_000;
const PINNED_DRIVER_COMMAND =
  "claude -p --model claude-sonnet-4-6 --safe-mode --no-session-persistence --output-format json <prompt>";

type Arm = "armN" | "armR" | "armL";
type Suite = "full" | "m45" | "mb2b-smoke";
type EpisodeState = "completed" | "incomplete" | "skipped";

type PackRow = {
  row_id: string;
  template_id: string;
  persona: string;
  difficulty: string;
  answer_type: string;
  question: string;
  gold: unknown;
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
  exitCode: number;
  elapsedMs: number;
  usage: DriverUsage;
  transportError: string | null;
};

type EpisodeSpec = {
  suite: Suite;
  ordinal: number;
  row: PackRow;
  seed: number;
  arm: Arm;
};

type EpisodeResult = {
  schemaVersion: "opentraces.plan012.normalized.v1";
  suite: Suite;
  label: string;
  status: "completed";
  ordinal: number;
  rowId: string;
  templateId: string;
  persona: string;
  difficulty: string;
  answerType: string;
  seed: number;
  arm: Arm;
  episodeDir: string;
  command: string;
  tokens: number;
  turns: number;
  usage: DriverUsage;
  exitCode: number;
  answered: boolean;
  correctVsGold: boolean | null;
  gradeReason: string | null;
  answerPreview: string;
  goldPreview: string;
  startedAt: string;
  completedAt: string;
  error: string | null;
};

type AttemptLedgerRow = {
  timestamp: string;
  suite: Suite;
  rowId: string;
  seed: number;
  arm: Arm;
  episodeDir: string;
  exitCode: number;
  tokens: number;
  turns: number;
  transportError: string | null;
};

type RunnerOptions = {
  suite: Suite;
  outRoot: string;
  parallel: number;
  cap: number;
  allowM5: boolean;
  selfKillAfterCompleted: number | null;
};

const ARMS: Arm[] = ["armN", "armR", "armL"];
const RECIPE =
  "Recipe: use exact filters over session and commit rows, then aggregate in deterministic TypeScript. Session rows expose start time, model, project, token/cache counts, steps, commit status, sharing state, and skills. Commit rows link commit shas to captured sessions. Return compact JSON plus evidence.";

const BLINDNESS_TERMS = [
  "templateId",
  "template_id",
  "row_id",
  "otc-0",
  "P1-T",
  "P2-T",
  "P3-T",
  "P4-T",
  "solvers/",
  "pack_spec",
  "pack.jsonl",
] as const;

const DRIVER_FACING_QUARANTINE_TERMS = [
  ...BLINDNESS_TERMS,
  "SCHEMA-TRUTH",
  "schema-facts",
  "objects/traces/v1",
  "events/v1/batches",
  "vendor/snapshot",
  "trace_id",
  "content_hash",
  "event_type",
  "current.json",
] as const;

const activeChildren = new Set<ChildProcessWithoutNullStreams>();
let signalLogFile: string | null = null;
let terminating = false;

process.on("SIGTERM", () => terminateFromSignal("SIGTERM"));
process.on("SIGINT", () => terminateFromSignal("SIGINT"));

function terminateFromSignal(signal: string): void {
  if (terminating) return;
  terminating = true;
  for (const child of activeChildren) child.kill("SIGTERM");
  const line = JSON.stringify({ timestamp: new Date().toISOString(), event: "signal", signal }) + "\n";
  const done = signalLogFile ? fsp.appendFile(signalLogFile, line, "utf8") : Promise.resolve();
  done.finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
  setTimeout(() => process.exit(signal === "SIGINT" ? 130 : 143), 1000).unref();
}

function parseArgs(argv: string[]): RunnerOptions {
  const get = (name: string): string | null => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] ?? null : null;
  };
  const suite = (get("--suite") ?? "m45") as Suite;
  if (!["full", "m45", "mb2b-smoke"].includes(suite)) throw new Error(`unknown --suite ${suite}`);
  const defaultOut = suite === "m45"
    ? path.join(ROOT, "probes", "m45-rehearsal")
    : suite === "mb2b-smoke"
      ? path.join(ROOT, "probes", "m4-mb2b-smoke")
      : path.join(ROOT, "probes", "m5-full-run");
  const cap = Number(get("--cap") ?? (suite === "full" ? FULL_CAP : REHEARSAL_CAP));
  const parallel = Number(get("--parallel") ?? "4");
  const selfKillRaw = get("--self-kill-after-completed");
  return {
    suite,
    outRoot: path.resolve(get("--out") ?? defaultOut),
    parallel: Math.max(1, Math.floor(Number.isFinite(parallel) ? parallel : 4)),
    cap: Math.max(1, Math.floor(Number.isFinite(cap) ? cap : (suite === "full" ? FULL_CAP : REHEARSAL_CAP))),
    allowM5: argv.includes("--allow-m5"),
    selfKillAfterCompleted: selfKillRaw === null ? null : Math.max(1, Math.floor(Number(selfKillRaw))),
  };
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function addAttr(out: Record<string, string | number | boolean>, key: string, value: unknown): void {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") out[key] = value;
}

async function exists(file: string): Promise<boolean> {
  try {
    await fsp.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T = unknown>(file: string): Promise<T> {
  return JSON.parse(await fsp.readFile(file, "utf8")) as T;
}

async function listFiles(dir: string, suffix: string): Promise<string[]> {
  if (!await exists(dir)) return [];
  const out: string[] = [];
  async function walk(current: string): Promise<void> {
    for (const entry of await fsp.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.endsWith(suffix)) out.push(full);
    }
  }
  await walk(dir);
  return out.sort();
}

async function loadPackRows(): Promise<PackRow[]> {
  const rows: PackRow[] = [];
  for (const line of (await fsp.readFile(PACK_PATH, "utf8")).split("\n")) {
    if (line.trim()) rows.push(JSON.parse(line) as PackRow);
  }
  return rows;
}

async function loadTraceRecords(): Promise<EvalRecord[]> {
  const records: EvalRecord[] = [];
  for (const currentPath of await listFiles(TRACES_ROOT, "current.json")) {
    const pointer = await readJson<Record<string, unknown>>(currentPath);
    const objectPath = asString(pointer.object_path);
    if (!objectPath) continue;
    const envelope = await readJson<Record<string, unknown>>(path.join(SNAPSHOT, objectPath));
    const record = (envelope.record ?? {}) as Record<string, unknown>;
    const metrics = (record.metrics ?? {}) as Record<string, unknown>;
    const agent = (record.agent ?? {}) as Record<string, unknown>;
    const outcome = (record.outcome ?? {}) as Record<string, unknown>;
    const metadata = (record.metadata ?? {}) as Record<string, unknown>;
    const security = (envelope.security ?? {}) as Record<string, unknown>;
    const task = (record.task ?? {}) as Record<string, unknown>;
    const capturedRun = asString(envelope.trace_id, asString(record.trace_id));
    if (!capturedRun) continue;
    const startedAt = asString(record.timestamp_start);
    const project = asString(envelope.project_slug, asString(pointer.project_slug, "unknown"));
    const attrs: Record<string, string | number | boolean> = {
      kind: "session",
      capturedRun,
      project,
      day: startedAt.slice(0, 10),
      model: asString(agent.model, "unknown"),
      inputTokens: asNumber(metrics.total_input_tokens),
      outputTokens: asNumber(metrics.total_output_tokens),
      cacheReadTokens: asNumber(metrics.total_cache_read_tokens),
      cacheWriteTokens: asNumber(metrics.total_cache_creation_tokens),
      cacheHitRate: asNumber(metrics.cache_hit_rate),
      totalSteps: asNumber(metrics.total_steps),
      durationSeconds: asNumber(metrics.total_duration_s),
      committed: outcome.committed === true,
      shareState: security.syncable === true ? "shareable" : "blocked",
      safetyTier: asString(security.privacy_tier, "unknown"),
      scanned: security.scanned === true,
      stale: security.stale === true,
      redactionsApplied: asNumber(security.redactions_applied),
      flagsReviewed: asNumber(security.flags_reviewed),
      skillsJson: JSON.stringify(metadata.skill_invocations ?? []),
      taskDescription: asString(task.description),
    };
    addAttr(attrs, "session", record.session_id);
    addAttr(attrs, "startedAt", startedAt);
    records.push({
      id: `session-${records.length}`,
      recordKey: `session:${capturedRun}`,
      family: "session",
      entity: capturedRun,
      label: `${project} ${capturedRun}`,
      attributes: attrs,
    });
  }
  return records.sort((a, b) => a.recordKey.localeCompare(b.recordKey));
}

async function loadCommitRecords(): Promise<EvalRecord[]> {
  const records: EvalRecord[] = [];
  for (const file of await listFiles(BATCHES_ROOT, ".jsonl.gz")) {
    const text = gunzipSync(await fsp.readFile(file)).toString("utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as Record<string, unknown>;
      if (event.event_type !== "git_anchor_created") continue;
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const commitId = (payload.commit_id ?? {}) as Record<string, unknown>;
      const commitSha = asString(commitId.hex, asString(payload.observed_ref));
      const capturedRun = asString(event.trace_id);
      const eventId = asString(event.event_id);
      if (!commitSha || !capturedRun || !eventId) continue;
      const attrs: Record<string, string | number | boolean> = {
        kind: "commit",
        commitSha,
        capturedRun,
        stepIndex: asNumber(event.step_index, -1),
        eventSequence: asNumber(event.event_sequence),
      };
      addAttr(attrs, "eventTime", event.event_time);
      addAttr(attrs, "path", payload.path);
      records.push({
        id: `commit-${records.length}`,
        recordKey: `commit:${eventId}`,
        family: "commit",
        entity: eventId,
        label: `${commitSha} ${capturedRun}`,
        attributes: attrs,
      });
    }
  }
  return records.sort((a, b) => a.recordKey.localeCompare(b.recordKey));
}

function renderTask(row: PackRow): string {
  return [
    "# Task",
    "",
    "Answer the question using the mounted Datafetch interface.",
    "",
    "When a question asks which captured session, return capturedRun values.",
    "",
    "## Question",
    "",
    row.question,
    "",
  ].join("\n");
}

function bindingBlock(arm: Arm): string {
  if (arm === "armR") {
    return ["<binding>", "Arm: documentation floor.", RECIPE, "</binding>"].join("\n");
  }
  if (arm === "armL") {
    return [
      "<binding>",
      "Arm: curated callable interface.",
      "Use df.lib helpers from df.d.ts when they fit the question. You may also use df.db records for evidence.",
      "</binding>",
    ].join("\n");
  }
  return [
    "<binding>",
    "Arm: cold db primitives only.",
    "Use df.db records directly. No recipe or helper library is available.",
    "</binding>",
  ].join("\n");
}

function renderPrompt(arm: Arm): string {
  return [
    "You are in a sealed Datafetch eval workspace.",
    "Read task.md and df.d.ts, then create scripts/answer.ts.",
    "Do not read outside this workspace. Do not inspect hidden files. Do not run probes or benchmarks.",
    "The harness will execute scripts/answer.ts once after you finish.",
    "",
    bindingBlock(arm),
    "",
    "Return exactly one df.answer({ status, value, evidence, derivation }) call from the script.",
    "Keep the script deterministic and grounded in the mounted records.",
    "If direct file writing is unavailable, return only the complete TypeScript source.",
    "",
  ].join("\n");
}

function renderDfDts(arm: Arm): string {
  const lib = arm === "armL" ? [
    "  lib: {",
    "    traceScan(input?: { window?: Window; project?: string; model?: string; skill?: string; committed?: boolean }): Promise<Result>;",
    "    eventScan(input?: { types?: string[]; window?: Window; traceId?: string }): Promise<Result>;",
    "    contextNodes(input: { traceId: string; stepIndex?: number }): Promise<Result>;",
    "    spendBy(input: { groupBy: \"model\" | \"project\" | \"day\"; window?: Window; project?: string; model?: string }): Promise<Result>;",
    "    wasteTop(input: { n: number; window?: Window; project?: string; model?: string }): Promise<Result>;",
    "    sessionsWhere(input?: { window?: Window; project?: string; model?: string; skill?: string; committed?: boolean; cacheBelow?: number; maxSteps?: number }): Promise<Result>;",
    "    skillReport(input: { skill: string; window?: Window; project?: string; model?: string }): Promise<Result>;",
    "    shareReport(input?: { project?: string; window?: Window }): Promise<Result>;",
    "    syncBlockers(input?: { project?: string; window?: Window }): Promise<Result>;",
    "    blame(input: { commitSha: string }): Promise<Result>;",
    "    fileEffort(input: { glob: string; window?: Window }): Promise<Result>;",
    "    patchSurvival(input?: { window?: Window }): Promise<Result>;",
    "  };",
  ] : [
    "  lib: {};",
  ];
  return [
    "type Window = { start?: string; end?: string };",
    "type Result = { value: unknown };",
    "type MountedRecord = {",
    "  id: string;",
    "  recordKey: string;",
    "  family: \"session\" | \"commit\";",
    "  entity: string;",
    "  label: string;",
    "  attributes: Record<string, string | number | boolean>;",
    "};",
    "declare const df: {",
    "  db: {",
    "    records: {",
    "      findExact(filter: Record<string, string | number | boolean>, limit?: number): Promise<MountedRecord[]>;",
    "      search(query: string, opts?: { limit?: number }): Promise<MountedRecord[]>;",
    "      findSimilar(query: string, limit?: number): Promise<MountedRecord[]>;",
    "      hybrid(query: string, opts?: { limit?: number }): Promise<MountedRecord[]>;",
    "    };",
    "  };",
    ...lib,
    "  answer(input: { status: \"answered\" | \"partial\" | \"unsupported\"; value?: unknown; evidence?: unknown; derivation?: unknown; reason?: string }): unknown;",
    "};",
    "",
  ].join("\n");
}

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function rel(file: string): string {
  return path.relative(path.resolve("."), path.resolve(file));
}

type TextHit = {
  file: string;
  term: string;
  line: number;
  excerpt: string;
};

function findTerms(text: string, file: string, terms: readonly string[]): TextHit[] {
  const hits: TextHit[] = [];
  text.split("\n").forEach((line, index) => {
    for (const term of terms) {
      if (line.includes(term)) hits.push({ file: rel(file), term, line: index + 1, excerpt: line.trim() });
    }
  });
  return hits;
}

async function findTermHits(files: string[], terms: readonly string[]): Promise<TextHit[]> {
  const hits: TextHit[] = [];
  for (const file of files) {
    if (await exists(file)) hits.push(...findTerms(await fsp.readFile(file, "utf8"), file, terms));
  }
  return hits;
}

function grepCommandFor(files: string[], terms: readonly string[]): string {
  const escaped = terms.map((term) => term.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")).join("|");
  return `grep -R -n -E '${escaped}' ${files.map((file) => rel(file)).join(" ")}`;
}

function normalisePrompt(text: string): string {
  return text.replace(/<binding>[\s\S]*?<\/binding>/, "<binding>\n__BINDING__\n</binding>");
}

function normaliseDts(text: string): string {
  return text.replace(/  lib: \{\};|  lib: \{[\s\S]*?^  \};/m, "  lib: { __LIB_SECTION__ };");
}

async function writeCuratedSeedHelpers(baseDir: string): Promise<void> {
  const dir = path.join(baseDir, "lib", "__seed__");
  await fsp.mkdir(dir, { recursive: true });
  const sdkUrl = pathToFileURL(path.resolve("src", "sdk", "index.ts")).href;
  const curatedUrl = pathToFileURL(path.resolve(ROOT, "curated", "index.ts")).href;
  const names = [
    "traceScan",
    "eventScan",
    "contextNodes",
    "spendBy",
    "wasteTop",
    "sessionsWhere",
    "skillReport",
    "shareReport",
    "syncBlockers",
    "blame",
    "fileEffort",
    "patchSurvival",
  ];
  for (const name of names) {
    await fsp.writeFile(path.join(dir, `${name}.ts`), [
      `import { fn } from "${sdkUrl}";`,
      'import * as v from "valibot";',
      `import { ${name} as callCurated } from "${curatedUrl}";`,
      "",
      `export const ${name} = fn({`,
      `  intent: "Curated OpenTraces interface helper ${name}.",`,
      "  examples: [],",
      "  input: v.unknown(),",
      "  output: v.unknown(),",
      "  async body(input): Promise<unknown> {",
      "    return await callCurated((input ?? {}) as never);",
      "  },",
      "});",
      "",
    ].join("\n"), "utf8");
  }
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:ts|typescript|javascript|js)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed);
  return match?.[1] ?? trimmed;
}

function extractDriverSource(text: string): string {
  const whole = stripCodeFence(text);
  if (whole.includes("df.answer") && !whole.includes("```")) return whole;
  const fenceRe = /```(?:ts|typescript|javascript|js)?\s*\n([\s\S]*?)\n```/gi;
  for (const match of text.matchAll(fenceRe)) {
    const body = match[1] ?? "";
    if (body.includes("df.answer")) return body.trim();
  }
  return whole;
}

function prepareAnswerSource(source: string): string {
  let body = stripCodeFence(source)
    .replace(/^\s*export\s*\{\s*\}\s*;?\s*$/gm, "")
    .replace(/^\s*export\s+default\s+/gm, "");
  let appendedCall = "";
  let returnedInlineIife = false;
  for (const name of ["main", "run", "solve"]) {
    const topLevelCall = new RegExp(String.raw`^\s*(?:void\s+)?${name}\s*\(\s*\)\s*;?\s*$`, "m");
    if (topLevelCall.test(body)) {
      body = body.replace(topLevelCall, "");
      appendedCall = `\nreturn await ${name}();\n`;
      break;
    }
  }
  if (
    !appendedCall &&
    /^\s*;?\s*(?:void\s+)?\(\s*async\s*\(\s*\)\s*=>\s*\{/m.test(body) &&
    /\}\s*\)\s*\(\s*\)\.catch\s*\([\s\S]*?\)\s*;?\s*$/.test(body)
  ) {
    body = body.replace(
      /^\s*;?\s*(?:void\s+)?\(\s*async\s*\(\s*\)\s*=>\s*\{/m,
      "return await (async () => {",
    );
    body = body.replace(/\}\s*\)\s*\(\s*\)\.catch\s*\([\s\S]*?\)\s*;?\s*$/, "})();\n");
    returnedInlineIife = true;
  }
  if (
    !appendedCall &&
    /^\s*;?\s*(?:void\s+)?\(\s*async\s+function\s*\(/m.test(body) &&
    /\}\s*\)\s*\(\s*\)\.catch\s*\([\s\S]*?\)\s*;?\s*$/.test(body)
  ) {
    body = body.replace(
      /^\s*;?\s*(?:void\s+)?\(\s*async\s+function\s*\(/m,
      "return await (async function(",
    );
    body = body.replace(/\}\s*\)\s*\(\s*\)\.catch\s*\([\s\S]*?\)\s*;?\s*$/, "})();\n");
    returnedInlineIife = true;
  }
  if (
    !appendedCall &&
    /^\s*;?\s*(?:void\s+)?\(\s*async\s*\(\s*\)\s*=>\s*\{/m.test(body) &&
    /\}\s*\)\s*\(\s*\)\s*;?\s*$/.test(body)
  ) {
    body = body.replace(
      /^\s*;?\s*(?:void\s+)?\(\s*async\s*\(\s*\)\s*=>\s*\{/m,
      "return await (async () => {",
    );
    returnedInlineIife = true;
  }
  if (
    !appendedCall &&
    !returnedInlineIife &&
    /^\s*;?\s*(?:void\s+)?\(\s*async\s+function\s*\(/m.test(body) &&
    /\}\s*\)\s*\(\s*\)\s*;?\s*$/.test(body)
  ) {
    body = body.replace(
      /^\s*;?\s*(?:void\s+)?\(\s*async\s+function\s*\(/m,
      "return await (async function(",
    );
    returnedInlineIife = true;
  }
  const namedAsyncIife = /^\s*;?\s*(?:void\s+)?\(\s*async\s+function\s+([A-Za-z_$][\w$]*)\s*\(/m.exec(body);
  if (
    !appendedCall &&
    !returnedInlineIife &&
    namedAsyncIife?.[1] &&
    /\}\s*\)\s*\(\s*\)\s*;?\s*$/.test(body)
  ) {
    body = body.replace(
      /^\s*;?\s*(?:void\s+)?\(\s*async\s+function\s+([A-Za-z_$][\w$]*)\s*\(/m,
      "async function $1(",
    );
    body = body.replace(/\}\s*\)\s*\(\s*\)\s*;?\s*$/, "}\n");
    appendedCall = `\nreturn await ${namedAsyncIife[1]}();\n`;
  }
  if (!/\breturn\s+df\.answer\s*\(/.test(body)) {
    body = body.replace(/\n\s*df\.answer\s*\(([\s\S]*?)\)\s*;?\s*$/, "\nreturn df.answer($1);\n");
  }
  return `${answerEnvelopeSanitizerSource()}\n${body}${appendedCall}`;
}

function answerEnvelopeSanitizerSource(): string {
  return `
const __opentracesBoundAnswerField = (value: unknown, depth = 0, seen = new WeakSet<object>()): unknown => {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length <= 4000 ? value : value.slice(0, 4000) + "... [truncated " + (value.length - 4000) + " chars]";
  }
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  if (depth >= 5) return "[truncated at depth 5]";
  seen.add(value);
  if (Array.isArray(value)) {
    const sample = value.slice(0, 20).map((item) => __opentracesBoundAnswerField(item, depth + 1, seen));
    return value.length <= 20 ? sample : { sample, truncatedItems: value.length - 20, totalItems: value.length };
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const out: Record<string, unknown> = {};
  for (const [key, item] of entries.slice(0, 50)) out[key] = __opentracesBoundAnswerField(item, depth + 1, seen);
  if (entries.length > 50) out.__truncatedKeys = entries.length - 50;
  return out;
};
const __opentracesOriginalAnswer = df.answer.bind(df);
df.answer = ((input: unknown) => {
  if (!input || typeof input !== "object") return __opentracesOriginalAnswer(input);
  const envelope = { ...(input as Record<string, unknown>) };
  if ("evidence" in envelope) envelope.evidence = __opentracesBoundAnswerField(envelope.evidence);
  if ("derivation" in envelope) envelope.derivation = __opentracesBoundAnswerField(envelope.derivation);
  return __opentracesOriginalAnswer(envelope);
}) as typeof df.answer;
`.trim();
}

function transportError(driver: { stdout: string; stderr: string; exitCode: number }): string | null {
  const text = `${driver.stdout}\n${driver.stderr}`.toLowerCase();
  const terms = ["rate limit", "ratelimit", "overloaded", "timeout", "timed out", "transport"];
  if (terms.some((term) => text.includes(term))) return "api/rate-limit/transport error";
  if (/(^|[^\d])429([^\d]|$)/.test(text)) return "api/rate-limit/transport error";
  try {
    const parsed = JSON.parse(driver.stdout) as Record<string, unknown>;
    if (parsed.is_error === true || parsed.api_error_status !== null && parsed.api_error_status !== undefined) {
      return "driver json error status";
    }
  } catch {
    // Non-JSON stdout is not automatically a transport error; it may still contain a source answer.
  }
  if (driver.exitCode !== 0 && !driver.stdout.includes("df.answer")) return "driver nonzero without usable answer";
  return null;
}

function spawnProcess(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"] });
    activeChildren.add(child);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000).unref();
    }, options.timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (err) => {
      clearTimeout(timer);
      activeChildren.delete(child);
      resolve({ stdout: Buffer.concat(stdout).toString("utf8"), stderr: `${Buffer.concat(stderr).toString("utf8")}${String(err)}`, exitCode: 1 });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      activeChildren.delete(child);
      const stderrText = Buffer.concat(stderr).toString("utf8");
      resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: timedOut ? `${stderrText}\n[timed out after ${options.timeoutMs}ms]\n` : stderrText,
        exitCode: typeof code === "number" ? code : 1,
      });
    });
  });
}

function parseUsage(parsed: Record<string, unknown> | null): DriverUsage {
  const usage = parsed && typeof parsed.usage === "object" ? parsed.usage as Record<string, unknown> : {};
  const inputTokens = asNumber(usage.input_tokens);
  const cacheReadInputTokens = asNumber(usage.cache_read_input_tokens);
  const cacheCreationInputTokens = asNumber(usage.cache_creation_input_tokens);
  const outputTokens = asNumber(usage.output_tokens);
  return {
    inputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    outputTokens,
    turns: asNumber(parsed?.num_turns, inputTokens || outputTokens ? 1 : 0),
    modelContextTokens: inputTokens + cacheReadInputTokens + cacheCreationInputTokens + outputTokens,
  };
}

async function runDriver(workspace: string, datafetchHome: string, prompt: string): Promise<DriverRun> {
  const args = ["-p", "--model", MODEL, "--safe-mode", "--no-session-persistence", "--output-format", "json", prompt];
  const started = performance.now();
  const run = await spawnProcess("claude", args, {
    cwd: workspace,
    env: { ...process.env, DATAFETCH_HOME: datafetchHome, ATLASFS_HOME: datafetchHome },
    timeoutMs: DRIVER_TIMEOUT_MS,
  });
  let parsed: Record<string, unknown> | null = null;
  let finalMessage = run.stdout.trim();
  try {
    parsed = JSON.parse(run.stdout) as Record<string, unknown>;
    if (typeof parsed.result === "string") finalMessage = parsed.result;
  } catch {
    parsed = null;
  }
  return {
    command: PINNED_DRIVER_COMMAND,
    stdout: run.stdout,
    stderr: run.stderr,
    finalMessage,
    exitCode: run.exitCode,
    elapsedMs: performance.now() - started,
    usage: parseUsage(parsed),
    transportError: transportError(run),
  };
}

async function ensureAnswer(workspace: string, driver: DriverRun): Promise<string | null> {
  const answerPath = path.join(workspace, "scripts", "answer.ts");
  let source = "";
  try {
    source = await fsp.readFile(answerPath, "utf8");
  } catch {
    source = "";
  }
  if (!source.includes("df.answer")) {
    source = extractDriverSource(driver.finalMessage);
    if (!source.includes("df.answer")) return null;
    await fsp.writeFile(answerPath, source.endsWith("\n") ? source : `${source}\n`, "utf8");
  }
  return answerPath;
}

function preview(value: unknown): string {
  if (value === undefined) return "(missing)";
  try {
    const text = JSON.stringify(value);
    if (!text) return String(value);
    return text.length > 260 ? `${text.slice(0, 257)}...` : text;
  } catch (err) {
    return `[unpreviewable: ${String(err)}]`;
  }
}

function boundedSnippetArtifact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (value.length <= SNIPPET_ARTIFACT_STRING_LIMIT) return value;
    return `${value.slice(0, SNIPPET_ARTIFACT_STRING_LIMIT)}... [truncated ${value.length - SNIPPET_ARTIFACT_STRING_LIMIT} chars]`;
  }
  if (typeof value !== "object") return value;
  if (seen.has(value)) return "[circular]";
  if (depth >= SNIPPET_ARTIFACT_DEPTH_LIMIT) return `[truncated at depth ${SNIPPET_ARTIFACT_DEPTH_LIMIT}]`;
  seen.add(value);
  if (Array.isArray(value)) {
    const sample = value
      .slice(0, SNIPPET_ARTIFACT_ARRAY_LIMIT)
      .map((item) => boundedSnippetArtifact(item, depth + 1, seen));
    if (value.length <= SNIPPET_ARTIFACT_ARRAY_LIMIT) return sample;
    return { sample, truncatedItems: value.length - SNIPPET_ARTIFACT_ARRAY_LIMIT, totalItems: value.length };
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const limited = entries.slice(0, SNIPPET_ARTIFACT_OBJECT_LIMIT);
  const out: Record<string, unknown> = {};
  for (const [key, item] of limited) out[key] = boundedSnippetArtifact(item, depth + 1, seen);
  if (entries.length > SNIPPET_ARTIFACT_OBJECT_LIMIT) {
    out.__truncatedKeys = entries.length - SNIPPET_ARTIFACT_OBJECT_LIMIT;
  }
  return out;
}

async function writeSnippetResultArtifact(file: string, snippet: unknown): Promise<void> {
  const artifact = {
    status: "bounded",
    note: "Bounded diagnostic artifact; grading and normalized rows use the in-memory snippet result.",
    value: boundedSnippetArtifact(snippet),
  };
  await fsp.writeFile(file, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function correctVsGold(row: PackRow, snippet: unknown, specs: Map<string, TemplateSpec>): GradeResult {
  return gradeAnswer({
    templateId: row.template_id,
    answerType: row.answer_type,
    gold: row.gold,
    actual: answerValue(snippet),
    specs,
  });
}

async function runSnippet(
  spec: EpisodeSpec,
  sessionDir: string,
  datafetchHome: string,
  answerPath: string,
  records: EvalRecord[],
  specs: Map<string, TemplateSpec>,
): Promise<{ snippet: unknown; grade: GradeResult | null; error: string | null }> {
  try {
    const source = prepareAnswerSource(await fsp.readFile(answerPath, "utf8"));
    await fsp.writeFile(path.join(sessionDir, "prepared-answer.ts"), source, "utf8");
    process.env.DATAFETCH_HOME = datafetchHome;
    process.env.ATLASFS_HOME = datafetchHome;
    process.env.DATAFETCH_DISABLE_LEARNING = "1";
    process.env.DATAFETCH_INTERFACE_MODE = "hooks-draft";
    const registry = new InMemoryMountRuntimeRegistry();
    setMountRuntimeRegistry(registry);
    const mountId = `${spec.row.row_id}-${spec.seed}-${spec.arm}-records`;
    registry.register(mountId, makeMountRuntime({
      mountId,
      adapter: new EvalRecordsMount(mountId, records),
      identMap: [{ ident: "records", name: "records" }],
    }));
    const { snippetRuntime } = await installSnippetRuntime({ baseDir: datafetchHome, skipSeedMirror: true });
    const snippet = await snippetRuntime.run({
      source,
      sourcePath: answerPath,
      phase: "commit",
      sessionCtx: {
        sessionId: `${spec.row.row_id}-${spec.seed}-${spec.arm}`,
        tenantId: `opentraces-${spec.suite}`,
        mountIds: [mountId],
        baseDir: datafetchHome,
        requireSubstrateRootedChain: false,
        snippetTimeoutMs: SNIPPET_TIMEOUT_MS,
      },
    });
    await registry.closeAll();
    return { snippet, grade: correctVsGold(spec.row, snippet, specs), error: null };
  } catch (err) {
    return { snippet: null, grade: null, error: String(err) };
  }
}

function episodeDir(outRoot: string, spec: EpisodeSpec): string {
  return path.join(outRoot, "episodes", spec.row.row_id, `seed-${spec.seed}`, spec.arm);
}

async function loadCompletedResult(outRoot: string, spec: EpisodeSpec): Promise<EpisodeResult | null> {
  const dir = episodeDir(outRoot, spec);
  const resultPath = path.join(dir, "result.json");
  if (!await exists(path.join(dir, "completed.json")) || !await exists(resultPath)) return null;
  return readJson<EpisodeResult>(resultPath);
}

async function runEpisode(
  outRoot: string,
  spec: EpisodeSpec,
  records: EvalRecord[],
  specs: Map<string, TemplateSpec>,
): Promise<{ state: EpisodeState; result?: EpisodeResult; attempted?: AttemptLedgerRow }> {
  const existing = await loadCompletedResult(outRoot, spec);
  if (existing) return { state: "skipped", result: existing };

  const sessionDir = episodeDir(outRoot, spec);
  const datafetchHome = path.join(sessionDir, "datafetch-home");
  const workspace = path.join(sessionDir, "workspace");
  await fsp.rm(path.join(sessionDir, "incomplete.json"), { force: true });
  await fsp.rm(workspace, { recursive: true, force: true });
  await fsp.rm(datafetchHome, { recursive: true, force: true });
  await fsp.mkdir(path.join(workspace, "scripts"), { recursive: true });
  await fsp.mkdir(datafetchHome, { recursive: true });
  if (spec.arm === "armL") await writeCuratedSeedHelpers(datafetchHome);

  const startedAt = new Date().toISOString();
  const prompt = renderPrompt(spec.arm);
  const dts = renderDfDts(spec.arm);
  await fsp.writeFile(path.join(workspace, "task.md"), renderTask(spec.row), "utf8");
  await fsp.writeFile(path.join(workspace, "df.d.ts"), dts, "utf8");
  await fsp.writeFile(path.join(sessionDir, "prompt.txt"), prompt, "utf8");
  await fsp.writeFile(path.join(sessionDir, "df.d.ts"), dts, "utf8");
  await fsp.writeFile(path.join(sessionDir, "episode-spec.json"), JSON.stringify({
    suite: spec.suite,
    ordinal: spec.ordinal,
    rowId: spec.row.row_id,
    templateId: spec.row.template_id,
    seed: spec.seed,
    arm: spec.arm,
  }, null, 2) + "\n", "utf8");

  const driver = await runDriver(workspace, datafetchHome, prompt);
  await fsp.writeFile(path.join(sessionDir, "driver-command.txt"), `${driver.command}\n`, "utf8");
  await fsp.writeFile(path.join(sessionDir, "driver-stdout.json"), driver.stdout, "utf8");
  await fsp.writeFile(path.join(sessionDir, "driver-stderr.txt"), driver.stderr, "utf8");
  await fsp.writeFile(path.join(sessionDir, "final-answer.txt"), driver.finalMessage, "utf8");
  await fsp.writeFile(path.join(sessionDir, "telemetry.json"), JSON.stringify({
    command: driver.command,
    exitCode: driver.exitCode,
    elapsedMs: driver.elapsedMs,
    usage: driver.usage,
    transportError: driver.transportError,
  }, null, 2) + "\n", "utf8");

  const attempted: AttemptLedgerRow = {
    timestamp: new Date().toISOString(),
    suite: spec.suite,
    rowId: spec.row.row_id,
    seed: spec.seed,
    arm: spec.arm,
    episodeDir: sessionDir,
    exitCode: driver.exitCode,
    tokens: driver.usage.modelContextTokens,
    turns: driver.usage.turns,
    transportError: driver.transportError,
  };

  if (driver.transportError) {
    await fsp.writeFile(path.join(sessionDir, "incomplete.json"), JSON.stringify({
      status: "incomplete",
      reason: driver.transportError,
      attemptedAt: attempted.timestamp,
      retryOnResume: true,
    }, null, 2) + "\n", "utf8");
    return { state: "incomplete", attempted };
  }

  let answered = false;
  let correct: boolean | null = null;
  let gradeReason: string | null = null;
  let actualValue: unknown = undefined;
  let error: string | null = null;
  const answerPath = await ensureAnswer(workspace, driver);
  if (answerPath) {
    const snippet = await runSnippet(spec, sessionDir, datafetchHome, answerPath, records, specs);
    answered = snippet.snippet !== null;
    actualValue = answerValue(snippet.snippet);
    correct = snippet.grade?.correct ?? null;
    gradeReason = snippet.grade?.reason ?? null;
    error = snippet.error;
    await writeSnippetResultArtifact(path.join(sessionDir, "snippet-result.json"), snippet.snippet);
    await fsp.writeFile(path.join(sessionDir, "correct-vs-gold.json"), JSON.stringify({
      correct,
      grade: snippet.grade,
      answerType: spec.row.answer_type,
      rowId: spec.row.row_id,
    }, null, 2) + "\n", "utf8");
  } else {
    error = "driver did not produce scripts/answer.ts or fenced source containing df.answer";
    await fsp.writeFile(path.join(sessionDir, "correct-vs-gold.json"), JSON.stringify({
      correct,
      grade: null,
      answerType: spec.row.answer_type,
      rowId: spec.row.row_id,
      error,
    }, null, 2) + "\n", "utf8");
  }

  const result: EpisodeResult = {
    schemaVersion: "opentraces.plan012.normalized.v1",
    suite: spec.suite,
    label: spec.suite === "m45" ? "REHEARSAL" : spec.suite === "mb2b-smoke" ? "M-B2b smoke" : "M5",
    status: "completed",
    ordinal: spec.ordinal,
    rowId: spec.row.row_id,
    templateId: spec.row.template_id,
    persona: spec.row.persona,
    difficulty: spec.row.difficulty,
    answerType: spec.row.answer_type,
    seed: spec.seed,
    arm: spec.arm,
    episodeDir: sessionDir,
    command: driver.command,
    tokens: driver.usage.modelContextTokens,
    turns: driver.usage.turns,
    usage: driver.usage,
    exitCode: driver.exitCode,
    answered,
    correctVsGold: correct,
    gradeReason,
    answerPreview: preview(actualValue),
    goldPreview: preview(spec.row.gold),
    startedAt,
    completedAt: new Date().toISOString(),
    error,
  };
  await fsp.writeFile(path.join(sessionDir, "result.json"), JSON.stringify(result, null, 2) + "\n", "utf8");
  await fsp.writeFile(path.join(sessionDir, "completed.json"), JSON.stringify({
    status: "completed",
    rowId: spec.row.row_id,
    seed: spec.seed,
    arm: spec.arm,
    completedAt: result.completedAt,
  }, null, 2) + "\n", "utf8");
  return { state: "completed", result, attempted };
}

async function appendJsonl(file: string, row: unknown): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.appendFile(file, JSON.stringify(row) + "\n", "utf8");
}

async function appendLog(outRoot: string, row: Record<string, unknown>): Promise<void> {
  await appendJsonl(path.join(outRoot, "runner-log.jsonl"), { timestamp: new Date().toISOString(), ...row });
}

async function readAttemptLedger(outRoot: string): Promise<AttemptLedgerRow[]> {
  const file = path.join(outRoot, "attempt-ledger.jsonl");
  if (!await exists(file)) return [];
  return (await fsp.readFile(file, "utf8")).split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as AttemptLedgerRow);
}

async function collectCompletedResults(outRoot: string): Promise<EpisodeResult[]> {
  const files = (await listFiles(path.join(outRoot, "episodes"), "result.json"))
    .filter((file) => {
      if (path.basename(file) !== "result.json") return false;
      const relPath = path.relative(path.join(outRoot, "episodes"), file).split(path.sep);
      return relPath.length === 4 && relPath[1]?.startsWith("seed-") && ARMS.includes(relPath[2] as Arm);
    });
  const rows = await Promise.all(files.map((file) => readJson<EpisodeResult>(file)));
  return rows.sort((a, b) => a.ordinal - b.ordinal || a.seed - b.seed || a.arm.localeCompare(b.arm));
}

async function writeNormalized(outRoot: string, results: EpisodeResult[]): Promise<void> {
  await fsp.mkdir(outRoot, { recursive: true });
  await fsp.writeFile(path.join(outRoot, "normalized.jsonl"), results.map((row) => JSON.stringify(row)).join("\n") + (results.length ? "\n" : ""), "utf8");
  await fsp.writeFile(path.join(outRoot, "grades.jsonl"), results.map((row) => JSON.stringify({
    rowId: row.rowId,
    templateId: row.templateId,
    seed: row.seed,
    arm: row.arm,
    correctVsGold: row.correctVsGold,
    gradeReason: row.gradeReason,
    answerType: row.answerType,
  })).join("\n") + (results.length ? "\n" : ""), "utf8");
}

async function writeV3(outRoot: string, rows: PackRow[]): Promise<void> {
  const prompts = Object.fromEntries(ARMS.map((arm) => [arm, renderPrompt(arm)])) as Record<Arm, string>;
  const dts = Object.fromEntries(ARMS.map((arm) => [arm, renderDfDts(arm)])) as Record<Arm, string>;
  const normalizedPromptHashes = Object.fromEntries(ARMS.map((arm) => [arm, hash(normalisePrompt(prompts[arm]))]));
  const normalizedDtsHashes = Object.fromEntries(ARMS.map((arm) => [arm, hash(normaliseDts(dts[arm]))]));
  const out = {
    recipeChars: RECIPE.length,
    promptHashes: Object.fromEntries(ARMS.map((arm) => [arm, hash(prompts[arm])])),
    normalizedPromptHashes,
    dfDtsHashes: Object.fromEntries(ARMS.map((arm) => [arm, hash(dts[arm])])),
    normalizedDfDtsHashes: normalizedDtsHashes,
    rowIds: rows.map((row) => row.row_id),
    parity: {
      promptsMatchAfterBindingRemoved: new Set(Object.values(normalizedPromptHashes)).size === 1,
      dfDtsMatchAfterLibSectionRemoved: new Set(Object.values(normalizedDtsHashes)).size === 1,
    },
  };
  await fsp.writeFile(path.join(outRoot, "armR-recipe.txt"), `${RECIPE}\n`, "utf8");
  await fsp.writeFile(path.join(outRoot, "v3-parity.json"), JSON.stringify(out, null, 2) + "\n", "utf8");
  await writeRecipeBlindness(outRoot);
}

async function writeRecipeBlindness(outRoot: string): Promise<void> {
  const recipePath = path.join(outRoot, "armR-recipe.txt");
  const hits = await findTermHits([recipePath], BLINDNESS_TERMS);
  const lines = [
    "# V3 recipe blindness",
    "",
    `Command: ${grepCommandFor([recipePath], BLINDNESS_TERMS)}`,
    `Recipe chars: ${RECIPE.length}`,
    `Result: ${hits.length === 0 ? "zero hits" : `${hits.length} hit(s)`}`,
    "",
  ];
  if (hits.length > 0) lines.push(...hits.map((hit) => `${hit.file}:${hit.line}: ${hit.term}: ${hit.excerpt}`), "");
  await fsp.writeFile(path.join(outRoot, "v3-recipe-blindness.txt"), `${lines.join("\n")}\n`, "utf8");
}

async function writeV1Blindness(outRoot: string): Promise<void> {
  const files = await listFiles(path.join(ROOT, "curated"), ".ts");
  const hits = await findTermHits(files, BLINDNESS_TERMS);
  const lines = [
    "# V1 curated-library blindness re-grep",
    "",
    `Command: ${grepCommandFor(files, BLINDNESS_TERMS)}`,
    `Result: ${hits.length === 0 ? "zero hits" : `${hits.length} hit(s)`}`,
    "",
  ];
  if (hits.length > 0) lines.push(...hits.map((hit) => `${hit.file}:${hit.line}: ${hit.term}: ${hit.excerpt}`), "");
  await fsp.writeFile(path.join(outRoot, "v1-blindness.txt"), `${lines.join("\n")}\n`, "utf8");
}

function driverFacingFiles(outRoot: string, results: EpisodeResult[]): string[] {
  const files = new Set<string>([path.join(outRoot, "armR-recipe.txt")]);
  for (const result of results) {
    files.add(path.join(result.episodeDir, "prompt.txt"));
    files.add(path.join(result.episodeDir, "df.d.ts"));
    files.add(path.join(result.episodeDir, "workspace", "task.md"));
    files.add(path.join(result.episodeDir, "workspace", "df.d.ts"));
  }
  return [...files].sort();
}

async function writeV4Hygiene(outRoot: string, results: EpisodeResult[]): Promise<void> {
  const commandChecks = await Promise.all(results.map(async (result) => {
    const commandPath = path.join(result.episodeDir, "driver-command.txt");
    const observed = await exists(commandPath) ? (await fsp.readFile(commandPath, "utf8")).trim() : "";
    return { rowId: result.rowId, seed: result.seed, arm: result.arm, commandPath: rel(commandPath), observed, ok: observed === PINNED_DRIVER_COMMAND };
  }));
  const files = driverFacingFiles(outRoot, results);
  const quarantineHits = await findTermHits(files, DRIVER_FACING_QUARANTINE_TERMS);
  const diff = await spawnProcess("git", ["diff", "--name-only", "--", "src", "eval/harness"], {
    cwd: path.resolve("."),
    env: process.env,
    timeoutMs: 30_000,
  });
  const ps = await spawnProcess("ps", ["-axo", "pid=,comm=,args="], {
    cwd: path.resolve("."),
    env: process.env,
    timeoutMs: 30_000,
  });
  const activeDriverLines = ps.stdout.split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("claude") && line.includes("--safe-mode") && line.includes("--output-format"))
    .filter((line) => !line.includes("SkyComputerUseClient") && !line.includes("Codex Computer Use"));

  const commandOk = commandChecks.every((check) => check.ok);
  const diffClean = diff.exitCode === 0 && diff.stdout.trim().length === 0;
  const noDrivers = ps.exitCode === 0 && activeDriverLines.length === 0;
  const lines = [
    "# V4 hygiene",
    "",
    `Exact driver command: ${commandOk ? "PASS" : "FAIL"}`,
    `Driver-facing quarantine grep: ${quarantineHits.length === 0 ? "PASS" : "FAIL"}`,
    `src/eval harness diff clean: ${diffClean ? "PASS" : "FAIL"}`,
    `No active driver process: ${noDrivers ? "PASS" : "FAIL"}`,
    "",
    "## Exact driver command",
    "",
    `Expected: ${PINNED_DRIVER_COMMAND}`,
    "",
    "| row | seed | arm | ok | command file |",
    "| --- | ---: | --- | --- | --- |",
    ...commandChecks.map((check) => `| ${check.rowId} | ${check.seed} | ${check.arm} | ${check.ok} | ${check.commandPath} |`),
    "",
    "## Driver-facing quarantine grep",
    "",
    `Command: ${grepCommandFor(files, DRIVER_FACING_QUARANTINE_TERMS)}`,
    `Result: ${quarantineHits.length === 0 ? "zero hits" : `${quarantineHits.length} hit(s)`}`,
    "",
  ];
  if (quarantineHits.length > 0) lines.push(...quarantineHits.map((hit) => `${hit.file}:${hit.line}: ${hit.term}: ${hit.excerpt}`), "");
  lines.push(
    "## src/eval harness diff",
    "",
    "Command: git diff --name-only -- src eval/harness",
    diff.stdout.trim() || "(empty)",
    diff.stderr.trim() ? `stderr: ${diff.stderr.trim()}` : "",
    "",
    "## Active driver processes",
    "",
    "Command: ps -axo pid=,comm=,args= | grep claude safe-mode output-format",
    activeDriverLines.length === 0 ? "(none)" : activeDriverLines.join("\n"),
    ps.stderr.trim() ? `stderr: ${ps.stderr.trim()}` : "",
    "",
  );
  await fsp.writeFile(path.join(outRoot, "v4-hygiene.txt"), `${lines.join("\n")}\n`, "utf8");
}

async function writeV6Evidence(outRoot: string, results: EpisodeResult[]): Promise<void> {
  const required = ["prompt.txt", "final-answer.txt", "telemetry.json", "correct-vs-gold.json"];
  const rows: string[] = [
    "# V6 evidence completeness",
    "",
    "| row | seed | arm | prompt | final | telemetry | correct_vs_gold |",
    "| --- | ---: | --- | --- | --- | --- | --- |",
  ];
  for (const result of results) {
    const checks = await Promise.all(required.map(async (name) => exists(path.join(result.episodeDir, name))));
    rows.push(`| ${result.rowId} | ${result.seed} | ${result.arm} | ${checks[0]} | ${checks[1]} | ${checks[2]} | ${checks[3]} |`);
  }
  rows.push("");
  await fsp.writeFile(path.join(outRoot, "v6-evidence.md"), `${rows.join("\n")}\n`, "utf8");
}

async function writeTokenLedger(outRoot: string, cap: number): Promise<void> {
  const attempts = await readAttemptLedger(outRoot);
  const spent = attempts.reduce((sum, row) => sum + row.tokens, 0);
  await fsp.writeFile(path.join(outRoot, "token-ledger.json"), JSON.stringify({
    spent,
    cap,
    capHit: spent >= cap,
    attempts: attempts.length,
    sessions: attempts.map((row) => ({
      rowId: row.rowId,
      seed: row.seed,
      arm: row.arm,
      tokens: row.tokens,
      turns: row.turns,
      transportError: row.transportError,
      timestamp: row.timestamp,
    })),
  }, null, 2) + "\n", "utf8");
}

async function writeOutputs(outRoot: string, cap: number, rowsForV3: PackRow[]): Promise<void> {
  const results = await collectCompletedResults(outRoot);
  await writeNormalized(outRoot, results);
  await writeTokenLedger(outRoot, cap);
  await writeV3(outRoot, rowsForV3);
  await writeV1Blindness(outRoot);
  if (results.length > 0) {
    await writeV4Hygiene(outRoot, results);
    await writeV6Evidence(outRoot, results);
    await writeAnswersMarkdown(outRoot, results);
  }
}

async function writeAnswersMarkdown(outRoot: string, results: EpisodeResult[]): Promise<void> {
  const lines = [
    "| row | template | seed | arm | tokens | turns | answered | correct_vs_gold | reason | answer_preview |",
    "| --- | --- | ---: | --- | ---: | ---: | --- | --- | --- | --- |",
    ...results.map((r) =>
      `| ${r.rowId} | ${r.templateId} | ${r.seed} | ${r.arm} | ${r.tokens} | ${r.turns} | ${r.answered} | ${r.correctVsGold} | ${r.gradeReason ?? ""} | ${markdownCell(r.answerPreview)} |`),
  ];
  await fsp.writeFile(path.join(outRoot, "answers-vs-gold.md"), `${lines.join("\n")}\n`, "utf8");
}

function rotateArms(index: number): Arm[] {
  return [...ARMS.slice(index), ...ARMS.slice(0, index)];
}

function specsForRows(suite: Suite, rows: PackRow[], seeds: number[]): EpisodeSpec[] {
  const specs: EpisodeSpec[] = [];
  rows.forEach((row, qIndex) => {
    seeds.forEach((seed, sIndex) => {
      const order = rotateArms((qIndex + sIndex) % ARMS.length);
      for (const arm of order) {
        specs.push({ suite, ordinal: specs.length, row, seed, arm });
      }
    });
  });
  return specs;
}

async function fullRows(packRows: PackRow[]): Promise<PackRow[]> {
  const manifest = await readJson<{ rows: Array<{ row_id: string }> }>(SUBSAMPLE_PATH);
  const byId = new Map(packRows.map((row) => [row.row_id, row]));
  return manifest.rows.map((item) => {
    const row = byId.get(item.row_id);
    if (!row) throw new Error(`missing prereg row ${item.row_id}`);
    return row;
  });
}

async function suiteRows(suite: Suite, packRows: PackRow[]): Promise<{ rows: PackRow[]; seeds: number[] }> {
  const byId = new Map(packRows.map((row) => [row.row_id, row]));
  if (suite === "m45") {
    return {
      rows: ["otc-0001", "otc-0153"].map((rowId) => {
        const row = byId.get(rowId);
        if (!row) throw new Error(`missing rehearsal row ${rowId}`);
        return row;
      }),
      seeds: [1, 2],
    };
  }
  return { rows: await fullRows(packRows), seeds: [1, 2, 3] };
}

async function normalizeMb2bSmoke(outRoot: string): Promise<void> {
  await fsp.mkdir(outRoot, { recursive: true });
  const sourceRoot = path.join(ROOT, "probes", "mb2b-pilot");
  const source = await readJson<{ results: Array<Record<string, unknown>> }>(path.join(sourceRoot, "summary.json"));
  const specs = await loadTemplateSpecs(PACK_YAML);
  const rowsById = new Map((await loadPackRows()).map((row) => [row.row_id, row]));
  const results: EpisodeResult[] = [];
  let ordinal = 0;
  for (const prior of source.results) {
    const rowId = asString(prior.rowId);
    const arm = asString(prior.arm) as Arm;
    const row = rowsById.get(rowId);
    if (!row || !ARMS.includes(arm)) throw new Error(`bad prior row ${rowId} ${arm}`);
    const sessionDir = asString(prior.sessionDir);
    const snippetPath = path.join(sessionDir, "snippet-result.json");
    const snippet = await exists(snippetPath) ? await readJson(snippetPath) : null;
    const grade = correctVsGold(row, snippet, specs);
    const actual = answerValue(snippet);
    results.push({
      schemaVersion: "opentraces.plan012.normalized.v1",
      suite: "mb2b-smoke",
      label: "M-B2b smoke",
      status: "completed",
      ordinal: ordinal++,
      rowId,
      templateId: row.template_id,
      persona: row.persona,
      difficulty: row.difficulty,
      answerType: row.answer_type,
      seed: 1,
      arm,
      episodeDir: sessionDir,
      command: PINNED_DRIVER_COMMAND,
      tokens: asNumber(prior.tokens),
      turns: asNumber(prior.turns),
      usage: {
        inputTokens: 0,
        cacheReadInputTokens: asNumber(prior.tokens),
        cacheCreationInputTokens: 0,
        outputTokens: 0,
        turns: asNumber(prior.turns),
        modelContextTokens: asNumber(prior.tokens),
      },
      exitCode: asNumber(prior.exitCode),
      answered: actual !== undefined,
      correctVsGold: grade.correct,
      gradeReason: grade.reason,
      answerPreview: preview(actual),
      goldPreview: preview(row.gold),
      startedAt: "",
      completedAt: asString((await readJson<Record<string, unknown>>(path.join(sourceRoot, "summary.json"))).generatedAt),
      error: null,
    });
  }
  await fsp.writeFile(path.join(outRoot, "normalized.jsonl"), results.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
  await fsp.writeFile(path.join(outRoot, "grades.jsonl"), results.map((row) => JSON.stringify({
    rowId: row.rowId,
    templateId: row.templateId,
    seed: row.seed,
    arm: row.arm,
    correctVsGold: row.correctVsGold,
    gradeReason: row.gradeReason,
    answerType: row.answerType,
  })).join("\n") + "\n", "utf8");
  const attempts = results.map((row) => ({
    timestamp: row.completedAt,
    suite: "mb2b-smoke" as Suite,
    rowId: row.rowId,
    seed: row.seed,
    arm: row.arm,
    episodeDir: row.episodeDir,
    exitCode: row.exitCode,
    tokens: row.tokens,
    turns: row.turns,
    transportError: null,
  }));
  await fsp.writeFile(path.join(outRoot, "attempt-ledger.jsonl"), attempts.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
  await writeTokenLedger(outRoot, REHEARSAL_CAP);
  await writeAnswersMarkdown(outRoot, results);
  await appendLog(outRoot, { event: "normalized-existing-mb2b", rows: results.length, sourceRoot });
}

async function runSuite(options: RunnerOptions): Promise<void> {
  if (options.suite === "full" && !options.allowM5) {
    throw new Error("M5 full-run driver episodes require --allow-m5. This goal does not authorize running them.");
  }
  if (options.suite === "mb2b-smoke") {
    await normalizeMb2bSmoke(options.outRoot);
    return;
  }

  await fsp.mkdir(options.outRoot, { recursive: true });
  signalLogFile = path.join(options.outRoot, "runner-log.jsonl");
  await appendLog(options.outRoot, {
    event: "runner-start",
    suite: options.suite,
    parallel: options.parallel,
    cap: options.cap,
    selfKillAfterCompleted: options.selfKillAfterCompleted,
  });
  const packRows = await loadPackRows();
  const { rows, seeds } = await suiteRows(options.suite, packRows);
  const queue = specsForRows(options.suite, rows, seeds);
  await fsp.writeFile(path.join(options.outRoot, "schedule.json"), JSON.stringify({
    suite: options.suite,
    episodes: queue.length,
    rows: rows.map((row) => row.row_id),
    seeds,
    arms: ARMS,
    parallelDefault: 4,
    cap: options.cap,
  }, null, 2) + "\n", "utf8");
  await writeV3(options.outRoot, rows);
  await writeV1Blindness(options.outRoot);

  const specs = await loadTemplateSpecs(PACK_YAML);
  const records = [...await loadTraceRecords(), ...await loadCommitRecords()];
  let ledger = await readAttemptLedger(options.outRoot);
  let spent = ledger.reduce((sum, row) => sum + row.tokens, 0);
  let completedThisProcess = 0;
  let next = 0;
  let stopScheduling = false;

  const worker = async (workerId: number): Promise<void> => {
    while (!stopScheduling) {
      if (spent >= options.cap) {
        stopScheduling = true;
        await appendLog(options.outRoot, { event: "cap-stop", spent, cap: options.cap, workerId });
        break;
      }
      const spec = queue[next++];
      if (!spec) break;
      const existing = await loadCompletedResult(options.outRoot, spec);
      if (existing) {
        await appendLog(options.outRoot, { event: "skip-completed", workerId, rowId: spec.row.row_id, seed: spec.seed, arm: spec.arm, completedAt: existing.completedAt });
        continue;
      }
      await appendLog(options.outRoot, { event: "episode-start", workerId, rowId: spec.row.row_id, seed: spec.seed, arm: spec.arm, ordinal: spec.ordinal });
      const outcome = await runEpisode(options.outRoot, spec, records, specs);
      if (outcome.attempted) {
        await appendJsonl(path.join(options.outRoot, "attempt-ledger.jsonl"), outcome.attempted);
        ledger.push(outcome.attempted);
        spent += outcome.attempted.tokens;
      }
      if (outcome.state === "completed" && outcome.result) {
        completedThisProcess += 1;
        await appendLog(options.outRoot, { event: "episode-completed", workerId, rowId: spec.row.row_id, seed: spec.seed, arm: spec.arm, tokens: outcome.result.tokens, turns: outcome.result.turns });
      } else if (outcome.state === "incomplete") {
        await appendLog(options.outRoot, { event: "episode-incomplete", workerId, rowId: spec.row.row_id, seed: spec.seed, arm: spec.arm, reason: outcome.attempted?.transportError ?? "unknown" });
      }
      await writeOutputs(options.outRoot, options.cap, rows);
      if (options.selfKillAfterCompleted !== null && completedThisProcess >= options.selfKillAfterCompleted) {
        await appendLog(options.outRoot, { event: "deliberate-self-sigterm", completedThisProcess, requestedAfter: options.selfKillAfterCompleted });
        await appendLog(options.outRoot, { event: "signal", signal: "SIGTERM", deliberate: true });
        process.exit(143);
      }
    }
  };

  await Promise.all(Array.from({ length: options.parallel }, (_, index) => worker(index + 1)));
  await writeOutputs(options.outRoot, options.cap, rows);
  const completed = await collectCompletedResults(options.outRoot);
  await appendLog(options.outRoot, {
    event: "runner-finish",
    suite: options.suite,
    completed: completed.length,
    expected: queue.length,
    spent,
    cap: options.cap,
  });
  if (completed.length < queue.length && spent < options.cap) {
    console.error(`INCOMPLETE: ${completed.length}/${queue.length} completed. Resume with the same command after backoff.`);
    process.exitCode = 2;
  }
}

const options = parseArgs(process.argv.slice(2));
await runSuite(options);
