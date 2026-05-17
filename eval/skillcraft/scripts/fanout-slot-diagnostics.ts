// Goal 4 offline fan-out diagnostics.
//
// Reads existing run artifacts only. It does not call models or tools.
// The report combines the three current design directions:
// - ReGAL: verify whether executed helper tool slots preserve the mounted
//   record entity contract.
// - SkillX: split record fan-out slots from dependent/multi-hop slots.
// - PSN: assign maturity/blame at helper + tool-slot granularity, not at
//   whole-run helper-call granularity.
//
// Usage:
//   tsx eval/skillcraft/scripts/fanout-slot-diagnostics.ts \
//     --run eval/skillcraft/results/datafetch/<run> \
//     --out eval/skillcraft/results/datafetch/<run>/fanout-slot-diagnostics.json

import { promises as fsp } from "node:fs";
import path from "node:path";

interface Args {
  runs: string[];
  out: string;
}

interface NormalizedRow {
  taskKey: string;
  family: string;
  level: string;
  officialScorePercent: number;
  officialPassed: boolean;
  runtimeStatus: string | null;
  effectiveTokens: number | null;
}

interface HelperOrigin {
  name: string;
  shapeHash: string | null;
  originTrajectory: string | null;
  intentSignature: string | null;
  isSeed: boolean;
}

interface InstrumentationRow {
  taskKey: string;
  family: string;
  level: string;
  phase: "train" | "warm" | "hard" | "unknown";
  trajectoryId: string | null;
  helpersCalled: string[];
  helperOrigins: HelperOrigin[];
}

interface EpisodeRow {
  taskKey?: string;
  family?: string;
  taskFamily?: string;
  level?: string;
  round?: string;
  artifactPath?: string;
  mode?: string;
}

interface TrajectoryCall {
  index: number;
  primitive: string;
  input: unknown;
  output: unknown;
  scope?: {
    depth?: number;
    parentPrimitive?: string;
    rootPrimitive?: string;
    callPath?: string[];
  } | null;
}

interface Trajectory {
  id: string;
  calls: TrajectoryCall[];
}

interface ToolSlotDiagnostic {
  runDir: string;
  taskKey: string;
  family: string;
  level: string;
  phase: "train" | "warm" | "hard" | "unknown";
  helperName: string;
  intentSignature: string | null;
  toolBundle: string;
  toolName: string;
  paramName: string;
  entityField: string | null;
  executedCalls: number;
  recordMatchedCalls: number;
  outputErrorCalls: number;
  dependencyEvidenceCalls: number;
  answerCodeUsesTool: boolean;
  classification: "sameEntity" | "dependent" | "unknown";
  verificationStatus: "verified" | "narrow" | "suspect" | "reject";
  officialScorePercent: number | null;
  officialPassed: boolean | null;
  runtimeStatus: string | null;
  effectiveTokens: number | null;
  exampleValues: unknown[];
}

interface HelperMaturityDiagnostic {
  helperName: string;
  intentSignature: string | null;
  family: string;
  entityField: string | null;
  executedSlots: number;
  verifiedSlots: number;
  narrowSlots: number;
  suspectSlots: number;
  rejectSlots: number;
  answerUsedSlots: number;
  runtimeErrors: number;
  avgOfficialScorePercent: number | null;
  maturity: "promote" | "narrow" | "suspect" | "reject";
}

function parseArgs(argv: string[]): Args {
  const args: Args = { runs: [], out: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--run") args.runs.push(path.resolve(argv[++i]!));
    else if (arg.startsWith("--run=")) args.runs.push(path.resolve(arg.slice("--run=".length)));
    else if (arg === "--out") args.out = path.resolve(argv[++i]!);
    else if (arg.startsWith("--out=")) args.out = path.resolve(arg.slice("--out=".length));
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (args.runs.length === 0) throw new Error("pass at least one --run <dir>");
  if (!args.out) {
    if (args.runs.length !== 1) throw new Error("pass --out <file> when using multiple --run args");
    args.out = path.join(args.runs[0]!, "fanout-slot-diagnostics.json");
  }
  return args;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await fsp.readFile(p, "utf8")) as T;
  } catch {
    return null;
  }
}

async function readJsonl<T>(p: string): Promise<T[]> {
  let text = "";
  try {
    text = await fsp.readFile(p, "utf8");
  } catch {
    return [];
  }
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

async function resolveRunDirs(runArg: string): Promise<string[]> {
  if (await exists(path.join(runArg, "episodes.jsonl"))) return [runArg];
  const parent = path.dirname(runArg);
  const base = path.basename(runArg);
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fsp.readdir(parent, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && /^.+-g\d+$/.test(entry.name) && entry.name.startsWith(base))
    .map((entry) => path.join(parent, entry.name))
    .sort();
}

function phaseForLevel(level: string): ToolSlotDiagnostic["phase"] {
  if (level === "e1") return "train";
  if (level === "h1") return "hard";
  if (["e2", "e3", "m1", "m2"].includes(level)) return "warm";
  return "unknown";
}

function keyOf(family: string, level: string): string {
  return `${family}/${level}`;
}

function parseToolPrimitive(primitive: string): { bundle: string; toolName: string } | null {
  if (!primitive.startsWith("tool.")) return null;
  const rest = primitive.slice("tool.".length);
  const dot = rest.indexOf(".");
  if (dot < 0) return null;
  return { bundle: rest.slice(0, dot), toolName: rest.slice(dot + 1) };
}

function parentHelperName(call: TrajectoryCall): string | null {
  const primitive =
    call.scope?.rootPrimitive ??
    call.scope?.parentPrimitive ??
    call.scope?.callPath?.[0] ??
    null;
  if (!primitive?.startsWith("lib.")) return null;
  const name = primitive.slice("lib.".length);
  return ["recordToolFanout", "recordToolLookup", "recordToolEnrichment", "per_entity"].includes(name)
    ? name
    : null;
}

function firstInputField(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const keys = Object.keys(input as Record<string, unknown>);
  return keys[0] ?? null;
}

function inputValue(input: unknown, field: string): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  return (input as Record<string, unknown>)[field];
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/^local_/, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function isIdParam(value: string): boolean {
  const key = normalizeKey(value);
  return key === "id" || key === "entity_id" || key.endsWith("_id");
}

function keyCompatible(paramName: string, recordKey: string, entityField: string | null): boolean {
  const param = normalizeKey(paramName);
  const key = normalizeKey(recordKey);
  if (entityField && key === normalizeKey(entityField)) return true;
  if (param === key) return true;
  for (const alias of recordFieldAliasesForParam(param)) {
    if (key === alias) return true;
  }
  if (key.length >= 3 && param.endsWith(`_${key}`)) return true;
  if (isIdParam(param) && (key === "id" || key === "entity" || isIdParam(key))) return true;
  return false;
}

function recordFieldAliasesForParam(paramName: string): string[] {
  if (paramName === "nationality") return ["nationality_code", "country_code", "code"];
  if (paramName === "race_name") return ["race"];
  if (paramName === "class_name") return ["class"];
  return [];
}

function valueEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (
    (typeof left === "string" || typeof left === "number") &&
    (typeof right === "string" || typeof right === "number")
  ) {
    return String(left) === String(right);
  }
  return false;
}

function recordFieldValues(record: unknown): Array<{ key: string; value: unknown }> {
  if (!record || typeof record !== "object" || Array.isArray(record)) return [];
  const out: Array<{ key: string; value: unknown }> = [];
  const rec = record as Record<string, unknown>;
  for (const [key, value] of Object.entries(rec)) {
    if (key !== "attributes") out.push({ key, value });
  }
  const attrs = rec.attributes;
  if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
    for (const [key, value] of Object.entries(attrs as Record<string, unknown>)) {
      out.push({ key, value });
    }
  }
  return out;
}

function valueMatchesMountedRecord(
  paramName: string,
  value: unknown,
  records: unknown[],
  entityField: string | null,
): boolean {
  for (const record of records) {
    for (const field of recordFieldValues(record)) {
      if (!keyCompatible(paramName, field.key, entityField)) continue;
      if (valueEqual(value, field.value)) return true;
    }
  }
  return false;
}

function hasDependencyEvidence(call: TrajectoryCall, calls: TrajectoryCall[], paramName: string): boolean {
  const param = normalizeKey(paramName);
  for (const prior of calls) {
    if (prior.index >= call.index || !prior.primitive.startsWith("tool.")) continue;
    if (outputHasCompatibleKey(prior.output, param, 0)) return true;
  }
  return false;
}

function outputHasCompatibleKey(value: unknown, param: string, depth: number): boolean {
  if (depth > 5 || value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    return value.slice(0, 25).some((item) => outputHasCompatibleKey(item, param, depth + 1));
  }
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    const normalized = normalizeKey(key);
    if (
      normalized === param ||
      normalized === `${param}s` ||
      normalized.endsWith(`_${param}`) ||
      normalized.endsWith(`_${param}s`)
    ) {
      return true;
    }
    if (outputHasCompatibleKey(inner, param, depth + 1)) return true;
  }
  return false;
}

function outputIsError(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rec = value as Record<string, unknown>;
  return rec.success === false || typeof rec.error === "string";
}

function parentInputForHelper(trajectory: Trajectory, helperName: string): Record<string, unknown> {
  const call = trajectory.calls.find((candidate) => candidate.primitive === `lib.${helperName}`);
  return call?.input && typeof call.input === "object" && !Array.isArray(call.input)
    ? call.input as Record<string, unknown>
    : {};
}

function paramForTool(parentInput: Record<string, unknown>, toolName: string, fallback: string): string {
  const dependentTools = parentInput.dependentToolNames;
  if (Array.isArray(dependentTools) && dependentTools.includes(toolName)) {
    const dependentParamName = parentInput.dependentParamName;
    if (typeof dependentParamName === "string" && dependentParamName) return dependentParamName;
  }
  const byTool = parentInput.paramByTool;
  if (byTool && typeof byTool === "object" && !Array.isArray(byTool)) {
    const candidate = (byTool as Record<string, unknown>)[toolName];
    if (typeof candidate === "string" && candidate) return candidate;
  }
  return typeof parentInput.paramName === "string" && parentInput.paramName
    ? parentInput.paramName
    : fallback;
}

function answerUsesTool(artifactDir: string, toolName: string, source: string | null): boolean {
  void artifactDir;
  if (!source) return false;
  const setupEnd = source.indexOf("}));");
  const afterSetup = setupEnd >= 0 ? source.slice(setupEnd + 4) : source;
  return afterSetup.includes(JSON.stringify(toolName)) || afterSetup.includes(`'${toolName}'`);
}

async function artifactDirFor(runDir: string, episode: EpisodeRow): Promise<string | null> {
  const family = String(episode.family ?? episode.taskFamily ?? "");
  const level = String(episode.level ?? episode.round ?? "");
  if (!family || !level) return null;
  if (typeof episode.artifactPath === "string") {
    const repoRoot = path.resolve(process.cwd());
    const candidate = path.resolve(repoRoot, episode.artifactPath);
    if (await exists(candidate)) return candidate;
  }
  const fallback = path.join(runDir, "episodes", family, level);
  return (await exists(fallback)) ? fallback : null;
}

async function diagnoseEpisode(input: {
  runDir: string;
  episode: EpisodeRow;
  normalizedByKey: Map<string, NormalizedRow>;
  instrumentationByKey: Map<string, InstrumentationRow>;
}): Promise<ToolSlotDiagnostic[]> {
  const family = String(input.episode.family ?? input.episode.taskFamily ?? "");
  const level = String(input.episode.level ?? input.episode.round ?? "");
  const taskKey = String(input.episode.taskKey ?? `scaled_tasks/${family}/${level}`);
  const artifactDir = await artifactDirFor(input.runDir, input.episode);
  if (!artifactDir) return [];
  const snippet = await readJson<{ trajectoryId?: string }>(path.join(artifactDir, "snippet-result.json"));
  const trajectoryId = snippet?.trajectoryId;
  if (!trajectoryId) return [];
  const trajectory = await readJson<Trajectory>(
    path.join(artifactDir, "datafetch-home", "trajectories", `${trajectoryId}.json`),
  );
  if (!trajectory?.calls) return [];

  const source = await fsp.readFile(path.join(artifactDir, "prepared-answer.ts"), "utf8").catch(() => null);
  const norm = input.normalizedByKey.get(keyOf(family, level));
  const inst = input.instrumentationByKey.get(keyOf(family, level));
  const originByName = new Map((inst?.helperOrigins ?? []).map((origin) => [origin.name, origin]));
  const dbRecords = trajectory.calls.find((call) => call.primitive === "db.records.findExact")?.output;
  const mountedRecords = await loadMountedRecords(artifactDir);
  const records = Array.isArray(dbRecords) && dbRecords.length > 0 ? dbRecords : mountedRecords;
  const grouped = new Map<string, TrajectoryCall[]>();

  for (const call of trajectory.calls) {
    const helperName = parentHelperName(call);
    if (!helperName || !call.primitive.startsWith("tool.")) continue;
    const parsed = parseToolPrimitive(call.primitive);
    if (!parsed) continue;
    const parentInput = parentInputForHelper(trajectory, helperName);
    const fallbackParam = firstInputField(call.input) ?? "input";
    const paramName = paramForTool(parentInput, parsed.toolName, fallbackParam);
    const groupKey = `${helperName}\0${parsed.bundle}\0${parsed.toolName}\0${paramName}`;
    const group = grouped.get(groupKey) ?? [];
    group.push(call);
    grouped.set(groupKey, group);
  }

  const diagnostics: ToolSlotDiagnostic[] = [];
  for (const [groupKey, calls] of grouped) {
    const [helperName, toolBundle, toolName, paramName] = groupKey.split("\0") as [string, string, string, string];
    const parentInput = parentInputForHelper(trajectory, helperName);
    const entityField = typeof parentInput.entityField === "string" ? parentInput.entityField : null;
    let recordMatchedCalls = 0;
    let outputErrorCalls = 0;
    let dependencyEvidenceCalls = 0;
    const exampleValues: unknown[] = [];
    for (const call of calls) {
      const value = inputValue(call.input, paramName);
      if (exampleValues.length < 5 && !exampleValues.some((seen) => valueEqual(seen, value))) {
        exampleValues.push(value);
      }
      if (valueMatchesMountedRecord(paramName, value, records, entityField)) recordMatchedCalls += 1;
      if (outputIsError(call.output)) outputErrorCalls += 1;
      if (hasDependencyEvidence(call, trajectory.calls, paramName)) dependencyEvidenceCalls += 1;
    }
    const allRecordMatched = recordMatchedCalls === calls.length;
    const anyDependencyEvidence = dependencyEvidenceCalls > 0;
    const classification = allRecordMatched
      ? "sameEntity"
      : anyDependencyEvidence
        ? "dependent"
        : "unknown";
    const verificationStatus =
      classification === "sameEntity" && outputErrorCalls === 0
        ? "verified"
        : classification === "sameEntity"
          ? "narrow"
          : outputErrorCalls > 0
            ? "reject"
            : classification === "dependent"
              ? "suspect"
              : "reject";
    const origin = originByName.get(helperName);
    diagnostics.push({
      runDir: input.runDir,
      taskKey,
      family,
      level,
      phase: phaseForLevel(level),
      helperName,
      intentSignature: origin?.intentSignature ?? null,
      toolBundle,
      toolName,
      paramName,
      entityField,
      executedCalls: calls.length,
      recordMatchedCalls,
      outputErrorCalls,
      dependencyEvidenceCalls,
      answerCodeUsesTool: answerUsesTool(artifactDir, toolName, source),
      classification,
      verificationStatus,
      officialScorePercent: norm?.officialScorePercent ?? null,
      officialPassed: norm?.officialPassed ?? null,
      runtimeStatus: norm?.runtimeStatus ?? null,
      effectiveTokens: norm?.effectiveTokens ?? null,
      exampleValues,
    });
  }
  return diagnostics;
}

async function loadMountedRecords(artifactDir: string): Promise<unknown[]> {
  const ctx = await readJson<{ records?: unknown[] }>(path.join(artifactDir, "workspace", ".datafetch-ctx.json"));
  return Array.isArray(ctx?.records) ? ctx.records : [];
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarizeMaturity(slots: ToolSlotDiagnostic[]): HelperMaturityDiagnostic[] {
  const groups = new Map<string, ToolSlotDiagnostic[]>();
  for (const slot of slots) {
    const key = [
      slot.helperName,
      slot.intentSignature ?? "",
      slot.family,
      slot.entityField ?? "",
    ].join("\0");
    const group = groups.get(key) ?? [];
    group.push(slot);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const first = group[0]!;
    const verifiedSlots = group.filter((slot) => slot.verificationStatus === "verified").length;
    const narrowSlots = group.filter((slot) => slot.verificationStatus === "narrow").length;
    const suspectSlots = group.filter((slot) => slot.verificationStatus === "suspect").length;
    const rejectSlots = group.filter((slot) => slot.verificationStatus === "reject").length;
    const answerUsedSlots = group.filter((slot) => slot.answerCodeUsesTool).length;
    const runtimeErrors = group.filter((slot) => slot.runtimeStatus === "runtime_error").length;
    const scores = group
      .map((slot) => slot.officialScorePercent)
      .filter((score): score is number => typeof score === "number");
    const maturity =
      rejectSlots > 0
        ? "reject"
        : suspectSlots > 0
          ? "suspect"
          : narrowSlots > 0
            ? "narrow"
            : "promote";
    return {
      helperName: first.helperName,
      intentSignature: first.intentSignature,
      family: first.family,
      entityField: first.entityField,
      executedSlots: group.length,
      verifiedSlots,
      narrowSlots,
      suspectSlots,
      rejectSlots,
      answerUsedSlots,
      runtimeErrors,
      avgOfficialScorePercent: mean(scores),
      maturity,
    };
  }).sort((a, b) => `${a.helperName}/${a.family}`.localeCompare(`${b.helperName}/${b.family}`));
}

function recommendations(slots: ToolSlotDiagnostic[]): Array<{
  family: string;
  helperName: string;
  sameEntityTools: string[];
  dependentTools: string[];
  rejectedTools: string[];
}> {
  const groups = new Map<string, ToolSlotDiagnostic[]>();
  for (const slot of slots) {
    const key = `${slot.family}\0${slot.helperName}`;
    const group = groups.get(key) ?? [];
    group.push(slot);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const first = group[0]!;
    const tool = (slot: ToolSlotDiagnostic): string => `${slot.toolName}(${slot.paramName})`;
    const unique = (values: string[]): string[] => [...new Set(values)].sort();
    return {
      family: first.family,
      helperName: first.helperName,
      sameEntityTools: unique(group.filter((slot) => slot.classification === "sameEntity").map(tool)),
      dependentTools: unique(group.filter((slot) => slot.classification === "dependent").map(tool)),
      rejectedTools: unique(group.filter((slot) => slot.verificationStatus === "reject").map(tool)),
    };
  }).sort((a, b) => `${a.family}/${a.helperName}`.localeCompare(`${b.family}/${b.helperName}`));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runDirs: string[] = [];
  for (const runArg of args.runs) runDirs.push(...await resolveRunDirs(runArg));
  const toolSlots: ToolSlotDiagnostic[] = [];

  for (const runDir of runDirs) {
    const episodes = await readJsonl<EpisodeRow>(path.join(runDir, "episodes.jsonl"));
    const normalizedRows = await readJsonl<NormalizedRow>(path.join(runDir, "normalized.jsonl"));
    const instrumentationRows = await readJsonl<InstrumentationRow>(path.join(runDir, "helper-instrumentation.jsonl"));
    const normalizedByKey = new Map(normalizedRows.map((row) => [keyOf(row.family, row.level), row]));
    const instrumentationByKey = new Map(instrumentationRows.map((row) => [keyOf(row.family, row.level), row]));
    for (const episode of episodes) {
      if (episode.mode !== "datafetch") continue;
      toolSlots.push(...await diagnoseEpisode({
        runDir,
        episode,
        normalizedByKey,
        instrumentationByKey,
      }));
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    runs: runDirs,
    summary: {
      executedToolSlots: toolSlots.length,
      verifiedSlots: toolSlots.filter((slot) => slot.verificationStatus === "verified").length,
      narrowSlots: toolSlots.filter((slot) => slot.verificationStatus === "narrow").length,
      suspectSlots: toolSlots.filter((slot) => slot.verificationStatus === "suspect").length,
      rejectSlots: toolSlots.filter((slot) => slot.verificationStatus === "reject").length,
      dependentSlots: toolSlots.filter((slot) => slot.classification === "dependent").length,
      answerUsedSlots: toolSlots.filter((slot) => slot.answerCodeUsesTool).length,
    },
    recommendations: recommendations(toolSlots),
    helperMaturity: summarizeMaturity(toolSlots),
    toolSlots,
  };

  await fsp.mkdir(path.dirname(args.out), { recursive: true });
  await fsp.writeFile(args.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(
    `[fanout-slot-diagnostics] slots=${report.summary.executedToolSlots} verified=${report.summary.verifiedSlots} suspect=${report.summary.suspectSlots} reject=${report.summary.rejectSlots}`,
  );
  console.log(`[fanout-slot-diagnostics] report -> ${args.out}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
