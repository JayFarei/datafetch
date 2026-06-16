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
import { installSnippetRuntime } from "../../../src/snippet/install.js";
import { EvalRecordsMount, type EvalRecord } from "../../harness/evalRecords.js";
import { answerValue, gradeAnswer, loadTemplateSpecs, type GradeResult, type TemplateSpec } from "./opentraces_grader_v2.js";

const ROOT = path.resolve("eval/opentraces");
const SNAPSHOT = path.join(ROOT, "vendor", "snapshot");
const PACK_PATH = path.join(ROOT, "questions", "pack.jsonl");
const PACK_YAML = path.join(ROOT, "templates", "pack.yaml");
const IS_MB2B = process.argv.includes("--mb2b");
const PILOT_ROOT = path.join(ROOT, "probes", IS_MB2B ? "mb2b-pilot" : "mb2-pilot");
const TRACES_ROOT = path.join(SNAPSHOT, "objects", "traces", "v1");
const BATCHES_ROOT = path.join(SNAPSHOT, "events", "v1", "batches");
const MODEL = "claude-sonnet-4-6";
const TENANT_ID = IS_MB2B ? "opentraces-mb2b" : "opentraces-mb2";
const DRIVER_TIMEOUT_MS = 300_000;
const SNIPPET_TIMEOUT_MS = 300_000;
const PILOT_CAP = IS_MB2B ? 3_000_000 : 6_000_000;
const FULL_EPISODES = 936;
const PINNED_DRIVER_COMMAND =
  "claude -p --model claude-sonnet-4-6 --safe-mode --no-session-persistence --output-format json <prompt>";

type Arm = "armN" | "armR" | "armL";

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
};

type EpisodeResult = {
  rowId: string;
  templateId: string;
  pilotKind: string;
  difficulty: string;
  answerType: string;
  arm: Arm;
  sessionDir: string;
  command: string;
  tokens: number;
  turns: number;
  exitCode: number;
  answered: boolean;
  correctVsGold: boolean | null;
  gradeReason: string | null;
  answerPreview: string;
  goldPreview: string;
  error: string | null;
};

const PILOT_ROWS = [
  { kind: "easy-envelope-aggregate", rowId: "otc-0001" },
  { kind: "set-filter", rowId: "otc-0009" },
  { kind: "event-join", rowId: "otc-0153" },
] as const;

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

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function addAttr(out: Record<string, string | number | boolean>, key: string, value: unknown): void {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    out[key] = value;
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await fsp.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await fsp.readFile(file, "utf8")) as unknown;
}

async function listFiles(dir: string, suffix: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
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
    if (!line.trim()) continue;
    rows.push(JSON.parse(line) as PackRow);
  }
  return rows;
}

async function loadTraceRecords(): Promise<EvalRecord[]> {
  const records: EvalRecord[] = [];
  for (const currentPath of await listFiles(TRACES_ROOT, "current.json")) {
    const pointer = await readJson(currentPath) as Record<string, unknown>;
    const objectPath = asString(pointer.object_path);
    if (!objectPath) continue;
    const envelope = await readJson(path.join(SNAPSHOT, objectPath)) as Record<string, unknown>;
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
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    for (const term of terms) {
      if (line.includes(term)) {
        hits.push({ file: rel(file), term, line: index + 1, excerpt: line.trim() });
      }
    }
  });
  return hits;
}

async function findTermHits(files: string[], terms: readonly string[]): Promise<TextHit[]> {
  const hits: TextHit[] = [];
  for (const file of files) {
    if (!await exists(file)) continue;
    hits.push(...findTerms(await fsp.readFile(file, "utf8"), file, terms));
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
  if (/^\s*(?:void\s+)?main\s*\(\s*\)\s*;?\s*$/m.test(body)) {
    body = body.replace(/^\s*(?:void\s+)?main\s*\(\s*\)\s*;?\s*$/m, "");
    return `${body}\nreturn await main();\n`;
  }
  if (!/\breturn\s+df\.answer\s*\(/.test(body)) {
    body = body.replace(/\n\s*df\.answer\s*\(([\s\S]*?)\)\s*;?\s*$/, "\nreturn df.answer($1);\n");
  }
  return body;
}

function spawnProcess(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
    }, options.timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout: Buffer.concat(stdout).toString("utf8"), stderr: `${Buffer.concat(stderr).toString("utf8")}${String(err)}`, exitCode: 1 });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
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
    command: "claude -p --model claude-sonnet-4-6 --safe-mode --no-session-persistence --output-format json <prompt>",
    stdout: run.stdout,
    stderr: run.stderr,
    finalMessage,
    exitCode: run.exitCode,
    elapsedMs: performance.now() - started,
    usage: parseUsage(parsed),
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

function stable(value: unknown): string {
  if (typeof value === "number") return JSON.stringify(Number(value.toFixed(6)));
  if (Array.isArray(value)) return `[${value.map(stable).sort().join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function preview(value: unknown): string {
  if (value === undefined) return "(missing)";
  const text = JSON.stringify(value);
  if (!text) return String(value);
  return text.length > 260 ? `${text.slice(0, 257)}...` : text;
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
  row: PackRow,
  arm: Arm,
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
    const mountId = `${row.row_id}-${arm}-records`;
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
        sessionId: `${row.row_id}-${arm}`,
        tenantId: TENANT_ID,
        mountIds: [mountId],
        baseDir: datafetchHome,
        requireSubstrateRootedChain: false,
        snippetTimeoutMs: SNIPPET_TIMEOUT_MS,
      },
    });
    await registry.closeAll();
    return { snippet, grade: correctVsGold(row, snippet, specs), error: null };
  } catch (err) {
    return { snippet: null, grade: null, error: String(err) };
  }
}

async function runEpisode(
  row: PackRow,
  pilotKind: string,
  arm: Arm,
  records: EvalRecord[],
  specs: Map<string, TemplateSpec>,
): Promise<EpisodeResult> {
  const sessionDir = path.join(PILOT_ROOT, "episodes", pilotKind, arm);
  const datafetchHome = path.join(sessionDir, "datafetch-home");
  const workspace = path.join(sessionDir, "workspace");
  await fsp.rm(sessionDir, { recursive: true, force: true });
  await fsp.mkdir(path.join(workspace, "scripts"), { recursive: true });
  await fsp.mkdir(datafetchHome, { recursive: true });
  if (arm === "armL") await writeCuratedSeedHelpers(datafetchHome);

  const prompt = renderPrompt(arm);
  const dts = renderDfDts(arm);
  await fsp.writeFile(path.join(workspace, "task.md"), renderTask(row), "utf8");
  await fsp.writeFile(path.join(workspace, "df.d.ts"), dts, "utf8");
  await fsp.writeFile(path.join(sessionDir, "prompt.txt"), prompt, "utf8");
  await fsp.writeFile(path.join(sessionDir, "df.d.ts"), dts, "utf8");

  const driver = await runDriver(workspace, datafetchHome, prompt);
  await fsp.writeFile(path.join(sessionDir, "driver-command.txt"), `${driver.command}\n`, "utf8");
  await fsp.writeFile(path.join(sessionDir, "driver-stdout.json"), driver.stdout, "utf8");
  await fsp.writeFile(path.join(sessionDir, "driver-stderr.txt"), driver.stderr, "utf8");
  await fsp.writeFile(path.join(sessionDir, "final-answer.txt"), driver.finalMessage, "utf8");
  await fsp.writeFile(path.join(sessionDir, "telemetry.json"), JSON.stringify({ command: driver.command, exitCode: driver.exitCode, elapsedMs: driver.elapsedMs, usage: driver.usage }, null, 2) + "\n", "utf8");

  let answered = false;
  let correct: boolean | null = null;
  let gradeReason: string | null = null;
  let actualValue: unknown = undefined;
  let error: string | null = null;
  const answerPath = await ensureAnswer(workspace, driver);
  if (answerPath) {
    const snippet = await runSnippet(row, arm, sessionDir, datafetchHome, answerPath, records, specs);
    answered = snippet.snippet !== null;
    actualValue = answerValue(snippet.snippet);
    correct = snippet.grade?.correct ?? null;
    gradeReason = snippet.grade?.reason ?? null;
    error = snippet.error;
    await fsp.writeFile(path.join(sessionDir, "snippet-result.json"), JSON.stringify(snippet.snippet, null, 2) + "\n", "utf8");
    await fsp.writeFile(
      path.join(sessionDir, "correct-vs-gold.json"),
      JSON.stringify({ correct, grade: snippet.grade, answerType: row.answer_type, rowId: row.row_id }, null, 2) + "\n",
      "utf8",
    );
  } else {
    error = "driver did not produce scripts/answer.ts or fenced source containing df.answer";
    await fsp.writeFile(path.join(sessionDir, "correct-vs-gold.json"), JSON.stringify({ correct, grade: null, answerType: row.answer_type, rowId: row.row_id, error }, null, 2) + "\n", "utf8");
  }

  return {
    rowId: row.row_id,
    templateId: row.template_id,
    pilotKind,
    difficulty: row.difficulty,
    answerType: row.answer_type,
    arm,
    sessionDir,
    command: driver.command,
    tokens: driver.usage.modelContextTokens,
    turns: driver.usage.turns,
    exitCode: driver.exitCode,
    answered,
    correctVsGold: correct,
    gradeReason,
    answerPreview: preview(actualValue),
    goldPreview: preview(row.gold),
    error,
  };
}

async function writeV3(rows: PackRow[]): Promise<void> {
  const prompts = Object.fromEntries(ARMS.map((arm) => [arm, renderPrompt(arm)]));
  const dts = Object.fromEntries(ARMS.map((arm) => [arm, renderDfDts(arm)]));
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
  await fsp.mkdir(PILOT_ROOT, { recursive: true });
  await fsp.writeFile(path.join(PILOT_ROOT, "armR-recipe.txt"), `${RECIPE}\n`, "utf8");
  await fsp.writeFile(path.join(PILOT_ROOT, "v3-parity.json"), JSON.stringify(out, null, 2) + "\n", "utf8");
  await writeRecipeBlindness();
}

async function writeRecipeBlindness(): Promise<void> {
  const recipePath = path.join(PILOT_ROOT, "armR-recipe.txt");
  const hits = await findTermHits([recipePath], BLINDNESS_TERMS);
  const lines = [
    "# V3 recipe blindness",
    "",
    `Command: ${grepCommandFor([recipePath], BLINDNESS_TERMS)}`,
    `Recipe chars: ${RECIPE.length}`,
    `Result: ${hits.length === 0 ? "zero hits" : `${hits.length} hit(s)`}`,
    "",
  ];
  if (hits.length > 0) {
    lines.push(...hits.map((hit) => `${hit.file}:${hit.line}: ${hit.term}: ${hit.excerpt}`), "");
  }
  await fsp.writeFile(path.join(PILOT_ROOT, "v3-recipe-blindness.txt"), `${lines.join("\n")}\n`, "utf8");
}

function projectionRows(results: EpisodeResult[]) {
  const byArm = new Map<Arm, EpisodeResult[]>();
  for (const arm of ARMS) byArm.set(arm, results.filter((result) => result.arm === arm));
  return ARMS.map((arm) => {
    const rows = byArm.get(arm) ?? [];
    const tokens = rows.reduce((sum, row) => sum + row.tokens, 0);
    const turns = rows.reduce((sum, row) => sum + row.turns, 0);
    const meanTokens = rows.length ? tokens / rows.length : 0;
    const meanTurns = rows.length ? turns / rows.length : 0;
    return {
      arm,
      pilotEpisodes: rows.length,
      pilotTokens: tokens,
      pilotTurns: turns,
      meanTokens,
      meanTurns,
      projectedTokens936: Math.round(meanTokens * (FULL_EPISODES / ARMS.length)),
      projectedTurns936: Math.round(meanTurns * (FULL_EPISODES / ARMS.length)),
    };
  });
}

async function writeOutputs(results: EpisodeResult[], spent: number, capHit: boolean): Promise<void> {
  const projection = projectionRows(results);
  const projectedTotal = projection.reduce((sum, row) => sum + row.projectedTokens936, 0);
  const recommendedHardCap = Math.ceil((projectedTotal * 1.25) / 1_000_000) * 1_000_000;
  const summary = { generatedAt: new Date().toISOString(), spent, pilotCap: PILOT_CAP, capHit, results, projection, projectedTotal, recommendedHardCap };
  await fsp.writeFile(path.join(PILOT_ROOT, "token-ledger.json"), JSON.stringify({ spent, cap: PILOT_CAP, sessions: results.map((r) => ({ rowId: r.rowId, arm: r.arm, tokens: r.tokens, turns: r.turns })) }, null, 2) + "\n", "utf8");
  await fsp.writeFile(path.join(PILOT_ROOT, "summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");
  const lines = [
    "| pilot | row | arm | tokens | turns | answered | correct_vs_gold |",
    "| --- | --- | --- | ---: | ---: | --- | --- |",
    ...results.map((r) => `| ${r.pilotKind} | ${r.rowId} | ${r.arm} | ${r.tokens} | ${r.turns} | ${r.answered} | ${r.correctVsGold} |`),
    "",
    "| arm | pilot episodes | pilot tokens | pilot turns | projected tokens in 936-run | projected turns in 936-run |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...projection.map((r) => `| ${r.arm} | ${r.pilotEpisodes} | ${r.pilotTokens} | ${r.pilotTurns} | ${r.projectedTokens936} | ${r.projectedTurns936} |`),
    "",
    `Recommended hard cap: ${recommendedHardCap} model-context driver tokens.`,
  ];
  await fsp.writeFile(path.join(PILOT_ROOT, "projection-table.md"), `${lines.join("\n")}\n`, "utf8");
  const answerLines = [
    "| pilot | row | arm | correct_vs_gold | grader_reason | answer_preview | gold_preview |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...results.map((r) =>
      `| ${r.pilotKind} | ${r.rowId} | ${r.arm} | ${r.correctVsGold} | ${r.gradeReason ?? ""} | ${markdownCell(r.answerPreview ?? "")} | ${markdownCell(r.goldPreview ?? "")} |`),
  ];
  await fsp.writeFile(path.join(PILOT_ROOT, "answers-vs-gold.md"), `${answerLines.join("\n")}\n`, "utf8");
}

function driverFacingFiles(results: EpisodeResult[]): string[] {
  const files = new Set<string>([path.join(PILOT_ROOT, "armR-recipe.txt")]);
  for (const result of results) {
    files.add(path.join(result.sessionDir, "prompt.txt"));
    files.add(path.join(result.sessionDir, "df.d.ts"));
    files.add(path.join(result.sessionDir, "workspace", "task.md"));
    files.add(path.join(result.sessionDir, "workspace", "df.d.ts"));
  }
  return [...files].sort();
}

async function writeV4Hygiene(results: EpisodeResult[]): Promise<void> {
  const commandChecks = await Promise.all(results.map(async (result) => {
    const commandPath = path.join(result.sessionDir, "driver-command.txt");
    const observed = (await fsp.readFile(commandPath, "utf8")).trim();
    return {
      rowId: result.rowId,
      arm: result.arm,
      commandPath: rel(commandPath),
      observed,
      ok: observed === PINNED_DRIVER_COMMAND,
    };
  }));
  const files = driverFacingFiles(results);
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
    "| row | arm | ok | command file |",
    "| --- | --- | --- | --- |",
    ...commandChecks.map((check) => `| ${check.rowId} | ${check.arm} | ${check.ok} | ${check.commandPath} |`),
    "",
    "## Driver-facing quarantine grep",
    "",
    `Command: ${grepCommandFor(files, DRIVER_FACING_QUARANTINE_TERMS)}`,
    `Result: ${quarantineHits.length === 0 ? "zero hits" : `${quarantineHits.length} hit(s)`}`,
    "",
  ];
  if (quarantineHits.length > 0) {
    lines.push(...quarantineHits.map((hit) => `${hit.file}:${hit.line}: ${hit.term}: ${hit.excerpt}`), "");
  }
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
  await fsp.writeFile(path.join(PILOT_ROOT, "v4-hygiene.txt"), `${lines.join("\n")}\n`, "utf8");
}

async function writeV6Evidence(results: EpisodeResult[]): Promise<void> {
  const required = ["prompt.txt", "final-answer.txt", "telemetry.json", "correct-vs-gold.json"];
  const rows: string[] = [
    "# V6 evidence completeness",
    "",
    "| row | arm | prompt | final | telemetry | correct_vs_gold |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const result of results) {
    const checks = await Promise.all(required.map(async (name) => exists(path.join(result.sessionDir, name))));
    rows.push(`| ${result.rowId} | ${result.arm} | ${checks[0]} | ${checks[1]} | ${checks[2]} | ${checks[3]} |`);
  }
  rows.push("");
  await fsp.writeFile(path.join(PILOT_ROOT, "v6-evidence.md"), `${rows.join("\n")}\n`, "utf8");
}

async function loadExistingResults(): Promise<{ results: EpisodeResult[]; spent: number; capHit: boolean }> {
  const summary = await readJson(path.join(PILOT_ROOT, "summary.json")) as {
    results?: EpisodeResult[];
    spent?: number;
    capHit?: boolean;
  };
  return {
    results: summary.results ?? [],
    spent: asNumber(summary.spent),
    capHit: summary.capHit === true,
  };
}

async function regradeExistingResults(): Promise<void> {
  const existing = await loadExistingResults();
  const specs = await loadTemplateSpecs(PACK_YAML);
  const rowsById = new Map((await loadPackRows()).map((row) => [row.row_id, row]));
  const results: EpisodeResult[] = [];
  for (const result of existing.results) {
    const row = rowsById.get(result.rowId);
    if (!row) throw new Error(`missing pack row ${result.rowId}`);
    const snippetPath = path.join(result.sessionDir, "snippet-result.json");
    const snippet = await exists(snippetPath) ? await readJson(snippetPath) : null;
    const grade = correctVsGold(row, snippet, specs);
    const actual = answerValue(snippet);
    const next = {
      ...result,
      correctVsGold: grade.correct,
      gradeReason: grade.reason,
      answerPreview: preview(actual),
      goldPreview: preview(row.gold),
    };
    await fsp.writeFile(
      path.join(result.sessionDir, "correct-vs-gold.json"),
      JSON.stringify({ correct: grade.correct, grade, answerType: row.answer_type, rowId: row.row_id }, null, 2) + "\n",
      "utf8",
    );
    results.push(next);
  }
  await writeOutputs(results, existing.spent, existing.capHit);
  await writeV4Hygiene(results);
  await writeV6Evidence(results);
}

async function main(): Promise<void> {
  if (process.argv.includes("--regrade-only")) {
    await regradeExistingResults();
    return;
  }

  if (process.argv.includes("--verify-only")) {
    const existing = await loadExistingResults();
    await writeOutputs(existing.results, existing.spent, existing.capHit);
    await writeV4Hygiene(existing.results);
    await writeV6Evidence(existing.results);
    return;
  }

  await fsp.mkdir(PILOT_ROOT, { recursive: true });
  const specs = await loadTemplateSpecs(PACK_YAML);
  const rowsById = new Map((await loadPackRows()).map((row) => [row.row_id, row]));
  const rows = PILOT_ROWS.map((pick) => {
    const row = rowsById.get(pick.rowId);
    if (!row) throw new Error(`missing pilot row ${pick.rowId}`);
    return { ...pick, row };
  });
  await writeV3(rows.map((item) => item.row));
  const records = [...await loadTraceRecords(), ...await loadCommitRecords()];
  const results: EpisodeResult[] = [];
  let spent = 0;
  let capHit = false;
  for (const item of rows) {
    for (const arm of ARMS) {
      if (spent >= PILOT_CAP) {
        capHit = true;
        break;
      }
      const result = await runEpisode(item.row, item.kind, arm, records, specs);
      results.push(result);
      spent += result.tokens;
      await writeOutputs(results, spent, spent >= PILOT_CAP);
      if (spent >= PILOT_CAP) {
        capHit = true;
        break;
      }
    }
    if (capHit) break;
  }
  await writeOutputs(results, spent, capHit);
  await writeV4Hygiene(results);
  await writeV6Evidence(results);
}

await main();
