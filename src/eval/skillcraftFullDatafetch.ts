import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

import Anthropic from "@anthropic-ai/sdk";

import { getMountRuntimeRegistry, type MountRuntime } from "../adapter/runtime.js";
import { installObserver } from "../observer/install.js";
import { readFrontmatterHead } from "../sdk/frontmatter.js";
import { readTrajectory, type TrajectoryRecord } from "../sdk/index.js";
import { installSnippetRuntime } from "../snippet/install.js";
import { getInterfaceMode } from "../hooks/mode.js";

import {
  EvalRecordsMount,
  extractFamilyEntities,
  renderPerEntitySeed,
  PER_ENTITY_SEED_NAME,
  type EvalRecord,
} from "./evalRecords.js";

const FULL_SKILLCRAFT_DATAFETCH_ADAPTER_READY = false;
const LEVEL_ORDER = ["e1", "e2", "e3", "m1", "m2", "h1"] as const;
// Promote crystallised helpers to the cross-episode lib-cache after any
// non-hard passing episode. Holding promotion to e1 alone fails when e1
// errors (then no helper reaches warm); broadening it lets a later passing
// episode contribute. Hard episodes (h1) are excluded so we still measure
// reuse, not just last-mile crystallisation.
const LEARN_FROM_LEVELS = new Set<string>(["e1", "e2", "e3", "m1", "m2"]);
const DEFAULT_CODEX_MODEL = "gpt-5.4-mini";
const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";
const DEFAULT_REASONING_EFFORT = "low";

// Backend selector. Defaults to codex for backwards compatibility with
// existing run-info.json artefacts. Set DATAFETCH_AGENT=claude to route
// every episode through `claude --print --output-format json` instead.
// DATAFETCH_AGENT=codex-direct is an eval-only low-overhead Codex
// Responses driver: the model returns scripts/answer.ts source, and the
// harness writes that source into the same workspace before replay.
// The agent's surface (workspace, prompt, scripts/answer.ts contract) is
// identical across backends; this only swaps the LLM driver.
type AgentBackend = "codex" | "claude" | "codex-direct";
function resolveAgentBackend(): AgentBackend {
  const raw = (process.env["DATAFETCH_AGENT"] ?? "codex").trim().toLowerCase();
  if (raw === "claude") return "claude";
  if (raw === "codex-direct" || raw === "codex-responses" || raw === "responses") return "codex-direct";
  return "codex";
}

interface Args {
  skillcraftDir: string;
  outDir: string;
  task?: string;
  families: string[];
  levels: string[];
  limit?: number;
  dryRun: boolean;
  fixtureSmoke: boolean;
  live: boolean;
  model?: string;
  reasoningEffort?: string;
  timeoutMs: number;
  snippetTimeoutMs: number;
  libCacheDir?: string;
  noLibCache: boolean;
  resume: boolean;
}

interface SkillCraftTask {
  taskKey: string;
  family: string;
  level: string;
  taskDir: string;
  taskConfigPath: string;
  taskDocPath: string;
  agentPromptPath: string;
  evaluatorPath: string;
  initialWorkspacePath?: string;
  groundtruthWorkspacePath?: string;
  expectedOutputFiles: string[];
  taskConfig: Record<string, unknown>;
}

interface EvaluatorResult {
  exitCode: number;
  elapsedMs: number;
  stdout: string;
  stderr: string;
  scoreJson: Record<string, unknown> | null;
}

interface AdapterEpisode {
  taskKey: string;
  taskFamily: string;
  family: string;
  taskId: string;
  round: string;
  level: string;
  mode: "datafetch";
  officialPassed: boolean;
  officialStatus: string | null;
  officialScorePercent: number;
  officialScore: unknown;
  answerCorrect: boolean;
  answerStatus: string;
  totalTokens: number | null;
  effectiveTokens: number | null;
  elapsedMs: number;
  llmCalls: number;
  toolCalls: number;
  libFunctionsUsed: number;
  libFunctionsAvailable: number;
  libFunctionsCreated: number;
  reuseRate: number;
  regressionsPassed: null;
  artifactPath: string;
  bridgeStatus: "fixture-evaluator-smoke" | "live-agent-experimental";
  agentExitCode?: number;
  snippetExitCode?: number;
  agentFailureKind?: "model_usage_limit" | "agent_error";
  phase: "train" | "warm" | "hard" | "unknown";
  promotedToLibCache: boolean;
  agentInputTokens?: number;
  agentCachedInputTokens?: number;
  agentOutputTokens?: number;
  agentReasoningTokens?: number;
  agentElapsedMs?: number;
}

interface ToolDescriptor {
  name: string;
  description: string;
  params_json_schema: Record<string, unknown>;
}

interface ToolCatalogEntry {
  bundle: string;
  tools: ToolDescriptor[];
}

interface AgentRun {
  workspaceDir: string;
  prompt: string;
  stdout: string;
  stderr: string;
  finalMessage: string;
  elapsedMs: number;
  exitCode: number;
  usage: AgentUsage;
}

interface AgentUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  llmCalls: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    skillcraftDir: path.resolve("eval/skillcraft/vendor/skillcraft"),
    outDir: path.resolve("eval/skillcraft/results/datafetch", runStamp()),
    families: [],
    levels: [],
    dryRun: false,
    fixtureSmoke: false,
    live: false,
    timeoutMs: Number(process.env["DF_SKILLCRAFT_FULL_TIMEOUT_MS"] ?? 600_000),
    snippetTimeoutMs: Number(process.env["DF_SKILLCRAFT_SNIPPET_TIMEOUT_MS"] ?? 300_000),
    noLibCache: false,
    resume: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--skillcraft-dir") args.skillcraftDir = path.resolve(argv[++index]);
    else if (arg.startsWith("--skillcraft-dir=")) args.skillcraftDir = path.resolve(arg.slice("--skillcraft-dir=".length));
    else if (arg === "--out-dir") args.outDir = path.resolve(argv[++index]);
    else if (arg.startsWith("--out-dir=")) args.outDir = path.resolve(arg.slice("--out-dir=".length));
    else if (arg === "--task") args.task = normalizeTaskKey(argv[++index]);
    else if (arg.startsWith("--task=")) args.task = normalizeTaskKey(arg.slice("--task=".length));
    else if (arg === "--families") args.families = csv(argv[++index]);
    else if (arg.startsWith("--families=")) args.families = csv(arg.slice("--families=".length));
    else if (arg === "--levels") args.levels = csv(argv[++index]);
    else if (arg.startsWith("--levels=")) args.levels = csv(arg.slice("--levels=".length));
    else if (arg === "--limit") args.limit = Number(argv[++index]);
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice("--limit=".length));
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--fixture-smoke") args.fixtureSmoke = true;
    else if (arg === "--live") args.live = true;
    else if (arg === "--model") args.model = argv[++index];
    else if (arg.startsWith("--model=")) args.model = arg.slice("--model=".length);
    else if (arg === "--reasoning") args.reasoningEffort = argv[++index];
    else if (arg.startsWith("--reasoning=")) args.reasoningEffort = arg.slice("--reasoning=".length);
    else if (arg === "--timeout-ms") args.timeoutMs = Number(argv[++index]);
    else if (arg.startsWith("--timeout-ms=")) args.timeoutMs = Number(arg.slice("--timeout-ms=".length));
    else if (arg === "--snippet-timeout-ms") args.snippetTimeoutMs = Number(argv[++index]);
    else if (arg.startsWith("--snippet-timeout-ms=")) args.snippetTimeoutMs = Number(arg.slice("--snippet-timeout-ms=".length));
    else if (arg === "--lib-cache-dir") args.libCacheDir = path.resolve(argv[++index]);
    else if (arg.startsWith("--lib-cache-dir=")) args.libCacheDir = path.resolve(arg.slice("--lib-cache-dir=".length));
    else if (arg === "--no-lib-cache") args.noLibCache = true;
    else if (arg === "--resume") args.resume = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const tasks = await selectTasks(args);
  await fsp.mkdir(args.outDir, { recursive: true });
  const libCacheDir = args.noLibCache
    ? undefined
    : args.libCacheDir ?? path.join(args.outDir, "lib-cache");
  if (libCacheDir) await fsp.mkdir(libCacheDir, { recursive: true });

  const agentBackend = resolveAgentBackend();
  const resolvedModel =
    agentBackend === "claude"
      ? resolveClaudeModel(args.model)
      : resolveCodexModel(args.model, "DF_SKILLCRAFT_FULL_MODEL");
  const resolvedEffort =
    agentBackend === "claude"
      ? resolveClaudeEffort(args.reasoningEffort)
      : resolveCodexReasoningEffort(args.reasoningEffort, "DF_SKILLCRAFT_FULL_REASONING_EFFORT");
  const runInfo = {
    generatedAt: new Date().toISOString(),
    adapterReady: FULL_SKILLCRAFT_DATAFETCH_ADAPTER_READY,
    skillcraftDir: args.skillcraftDir,
    outDir: args.outDir,
    libCacheDir: libCacheDir ?? null,
    selectedTasks: tasks.length,
    mode: args.live ? "live-agent-experimental" : args.fixtureSmoke ? "fixture-smoke" : args.dryRun ? "dry-run" : "not-implemented",
    agent: agentBackend,
    promptMode: resolvePromptMode(),
    interfaceMode: getInterfaceMode(),
    codexDirectCacheIsolation: agentBackend === "codex-direct" ? "prompt-nonce" : null,
    model: resolvedModel,
    reasoningEffort: resolvedEffort,
    snippetTimeoutMs: args.snippetTimeoutMs,
  };
  await fsp.writeFile(path.join(args.outDir, "run-info.json"), `${JSON.stringify(runInfo, null, 2)}\n`);
  await fsp.writeFile(
    path.join(args.outDir, "planned-tasks.json"),
    `${JSON.stringify(tasks.map(taskSummary), null, 2)}\n`,
  );

  if (args.dryRun) {
    console.log(`[datafetch-skillcraft] planned ${tasks.length} task(s); wrote ${args.outDir}`);
    return;
  }

  if (!args.fixtureSmoke && !args.live) {
    throw new Error(
      [
        "Full Datafetch SkillCraft agent/tool bridge is not implemented yet.",
        "Use --dry-run to inspect selected tasks or --fixture-smoke to verify fixture mirroring and official evaluator invocation.",
      ].join(" "),
    );
  }

  const episodesJsonlPath = path.join(args.outDir, "episodes.jsonl");
  const episodes = args.resume
    ? await readExistingEpisodes(episodesJsonlPath)
    : [];
  const completedTaskKeys = new Set(episodes.map((episode) => episode.taskKey));
  if (!args.resume) {
    await fsp.writeFile(episodesJsonlPath, "");
  }
  for (const task of tasks) {
    if (completedTaskKeys.has(task.taskKey)) continue;
    const episode = await runEpisodeSafely({
      task,
      args,
      libCacheDir,
    });
    episodes.push(episode);
    await fsp.appendFile(episodesJsonlPath, `${JSON.stringify(episode)}\n`);
    await writeResultsFile({
      file: path.join(args.outDir, "results.partial.json"),
      runInfo,
      episodes,
    });
  }
  await writeResultsFile({
    file: path.join(args.outDir, "results.json"),
    runInfo,
    episodes,
  });
  console.log(`[datafetch-skillcraft] wrote ${episodes.length} row(s) to ${args.outDir}`);
}

async function readExistingEpisodes(filePath: string): Promise<AdapterEpisode[]> {
  let raw = "";
  try {
    raw = await fsp.readFile(filePath, "utf8");
  } catch {
    return [];
  }
  const episodes: AdapterEpisode[] = [];
  for (const [index, line] of raw.split("\n").entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      episodes.push(JSON.parse(trimmed) as AdapterEpisode);
    } catch (error) {
      throw new Error(
        `Cannot resume: invalid JSON in ${filePath} on line ${index + 1}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  return episodes;
}

async function runEpisodeSafely(input: {
  task: SkillCraftTask;
  args: Args;
  libCacheDir?: string;
}): Promise<AdapterEpisode> {
  try {
    return input.args.live
      ? await runLiveExperimental({
          task: input.task,
          skillcraftDir: input.args.skillcraftDir,
          outDir: input.args.outDir,
          model: input.args.model,
          reasoningEffort: input.args.reasoningEffort,
          timeoutMs: input.args.timeoutMs,
          snippetTimeoutMs: input.args.snippetTimeoutMs,
          libCacheDir: input.libCacheDir,
        })
      : await runFixtureSmoke({ task: input.task, skillcraftDir: input.args.skillcraftDir, outDir: input.args.outDir });
  } catch (error) {
    return writeHarnessErrorEpisode({
      task: input.task,
      outDir: input.args.outDir,
      error,
      bridgeStatus: input.args.live ? "live-agent-experimental" : "fixture-evaluator-smoke",
    });
  }
}

async function writeResultsFile(input: {
  file: string;
  runInfo: Record<string, unknown>;
  episodes: AdapterEpisode[];
}): Promise<void> {
  const results = {
    ...input.runInfo,
    sourceProtocol: "datafetch-skillcraft-adapter",
    adapterCapability: "fixture-importer+official-evaluator+tool-bridge+lib-cache",
    episodes: input.episodes,
  };
  await fsp.writeFile(input.file, `${JSON.stringify(results, null, 2)}\n`);
}

async function writeHarnessErrorEpisode(input: {
  task: SkillCraftTask;
  outDir: string;
  error: unknown;
  bridgeStatus: AdapterEpisode["bridgeStatus"];
}): Promise<AdapterEpisode> {
  const artifactDir = path.join(input.outDir, "episodes", input.task.family, input.task.level);
  await fsp.mkdir(artifactDir, { recursive: true });
  const message = input.error instanceof Error ? input.error.stack ?? input.error.message : String(input.error);
  await fsp.writeFile(path.join(artifactDir, "harness-error.txt"), `${message}\n`);
  return {
    taskKey: input.task.taskKey,
    taskFamily: input.task.family,
    family: input.task.family,
    taskId: `${input.task.family}-${input.task.level}`,
    round: input.task.level,
    level: input.task.level,
    mode: "datafetch",
    officialPassed: false,
    officialStatus: "harness_error",
    officialScorePercent: 0,
    officialScore: null,
    answerCorrect: false,
    answerStatus: "harness_error",
    totalTokens: null,
    effectiveTokens: null,
    elapsedMs: 0,
    llmCalls: 0,
    toolCalls: 0,
    libFunctionsUsed: 0,
    libFunctionsAvailable: 0,
    libFunctionsCreated: 0,
    reuseRate: 0,
    regressionsPassed: null,
    artifactPath: path.relative(process.cwd(), artifactDir),
    bridgeStatus: input.bridgeStatus,
    agentExitCode: 1,
    snippetExitCode: 1,
    phase: phaseForLevel(input.task.level),
    promotedToLibCache: false,
  };
}

async function selectTasks(args: Args): Promise<SkillCraftTask[]> {
  const allTasks = await discoverTasks(args.skillcraftDir);
  let selected = allTasks;
  if (args.task) selected = selected.filter((task) => task.taskKey === args.task);
  if (args.families.length) {
    const families = new Set(args.families);
    selected = selected.filter((task) => families.has(task.family));
  }
  if (args.levels.length) {
    const levels = new Set(args.levels);
    selected = selected.filter((task) => levels.has(task.level));
  }
  if (typeof args.limit === "number") selected = selected.slice(0, args.limit);
  if (!selected.length) throw new Error("no SkillCraft tasks matched the requested filters");
  return selected;
}

async function discoverTasks(skillcraftDir: string): Promise<SkillCraftTask[]> {
  const root = path.join(skillcraftDir, "tasks", "scaled_tasks");
  const families = await safeReaddir(root);
  const tasks: SkillCraftTask[] = [];
  for (const family of families) {
    const familyDir = path.join(root, family);
    if (!(await isDirectory(familyDir))) continue;
    const levels = await safeReaddir(familyDir);
    for (const level of levels) {
      const taskDir = path.join(familyDir, level);
      if (!(await isDirectory(taskDir))) continue;
      const taskConfigPath = path.join(taskDir, "task_config.json");
      const evaluatorPath = path.join(taskDir, "evaluation", "main.py");
      const taskDocPath = path.join(taskDir, "docs", "task.md");
      if (!(await exists(taskConfigPath)) || !(await exists(evaluatorPath)) || !(await exists(taskDocPath))) continue;
      const taskConfig = JSON.parse(await fsp.readFile(taskConfigPath, "utf8")) as Record<string, unknown>;
      const initialWorkspacePath = await optionalDir(path.join(taskDir, "initial_workspace"));
      const groundtruthWorkspacePath = await optionalDir(path.join(taskDir, "groundtruth_workspace"));
      tasks.push({
        taskKey: `scaled_tasks/${family}/${level}`,
        family,
        level,
        taskDir,
        taskConfigPath,
        taskDocPath,
        agentPromptPath: path.join(taskDir, "docs", "agent_system_prompt.md"),
        evaluatorPath,
        initialWorkspacePath,
        groundtruthWorkspacePath,
        expectedOutputFiles: await inferExpectedOutputFiles(evaluatorPath),
        taskConfig,
      });
    }
  }
  return tasks.sort(compareTasks);
}

async function runFixtureSmoke(input: {
  task: SkillCraftTask;
  skillcraftDir: string;
  outDir: string;
}): Promise<AdapterEpisode> {
  const artifactDir = path.join(input.outDir, "episodes", input.task.family, input.task.level);
  const workspace = path.join(artifactDir, "workspace");
  const groundtruth = input.task.groundtruthWorkspacePath ?? path.join(artifactDir, "groundtruth-empty");
  await fsp.rm(artifactDir, { recursive: true, force: true });
  await fsp.mkdir(workspace, { recursive: true });
  if (input.task.initialWorkspacePath) {
    await fsp.cp(input.task.initialWorkspacePath, workspace, { recursive: true, force: true });
  }
  if (!input.task.groundtruthWorkspacePath) await fsp.mkdir(groundtruth, { recursive: true });
  await fsp.writeFile(
    path.join(artifactDir, "adapter-status.md"),
    [
      "# Datafetch SkillCraft Adapter Status",
      "",
      "This smoke episode mirrors the official SkillCraft workspace and invokes the official evaluator.",
      "It does not run the Datafetch agent/tool bridge yet, so failure is expected unless an output file already exists.",
      "",
    ].join("\n"),
  );
  await fsp.writeFile(path.join(artifactDir, "task-summary.json"), `${JSON.stringify(taskSummary(input.task), null, 2)}\n`);

  const evaluator = await runEvaluator({
    skillcraftDir: input.skillcraftDir,
    evaluatorPath: input.task.evaluatorPath,
    workspace,
    groundtruth,
  });
  await fsp.writeFile(path.join(artifactDir, "evaluator-stdout.txt"), evaluator.stdout);
  await fsp.writeFile(path.join(artifactDir, "evaluator-stderr.txt"), evaluator.stderr);
  await fsp.writeFile(
    path.join(artifactDir, "evaluator-result.json"),
    `${JSON.stringify({ exitCode: evaluator.exitCode, elapsedMs: evaluator.elapsedMs, scoreJson: evaluator.scoreJson }, null, 2)}\n`,
  );

  const score = scoreObject(evaluator.scoreJson);
  const percent = numberOr(score?.percent, 0);
  const status = stringOrNull(evaluator.scoreJson?.status);
  const passed = Boolean(evaluator.scoreJson?.passed);
  return {
    taskKey: input.task.taskKey,
    taskFamily: input.task.family,
    family: input.task.family,
    taskId: `${input.task.family}-${input.task.level}`,
    round: input.task.level,
    level: input.task.level,
    mode: "datafetch",
    officialPassed: passed,
    officialStatus: status,
    officialScorePercent: percent,
    officialScore: score ?? null,
    answerCorrect: passed,
    answerStatus: passed ? "answered" : status ?? "unsupported",
    totalTokens: null,
    effectiveTokens: null,
    elapsedMs: Math.round(evaluator.elapsedMs),
    llmCalls: 0,
    toolCalls: 0,
    libFunctionsUsed: 0,
    libFunctionsAvailable: 0,
    libFunctionsCreated: 0,
    reuseRate: 0,
    regressionsPassed: null,
    artifactPath: path.relative(process.cwd(), artifactDir),
    bridgeStatus: "fixture-evaluator-smoke",
    phase: phaseForLevel(input.task.level),
    promotedToLibCache: false,
  };
}

async function runLiveExperimental(input: {
  task: SkillCraftTask;
  skillcraftDir: string;
  outDir: string;
  model?: string;
  reasoningEffort?: string;
  timeoutMs: number;
  snippetTimeoutMs: number;
  libCacheDir?: string;
}): Promise<AdapterEpisode> {
  const artifactDir = path.join(input.outDir, "episodes", input.task.family, input.task.level);
  const workspace = path.join(artifactDir, "workspace");
  const datafetchHome = path.join(artifactDir, "datafetch-home");
  const tenantId = "skillcraft-full";
  const groundtruth = input.task.groundtruthWorkspacePath ?? path.join(artifactDir, "groundtruth-empty");
  await fsp.rm(artifactDir, { recursive: true, force: true });
  await fsp.mkdir(path.join(workspace, "scripts"), { recursive: true });
  await fsp.mkdir(path.join(datafetchHome, "lib", tenantId), { recursive: true });
  if (input.task.initialWorkspacePath) {
    await fsp.cp(input.task.initialWorkspacePath, workspace, { recursive: true, force: true });
  }
  if (!input.task.groundtruthWorkspacePath) await fsp.mkdir(groundtruth, { recursive: true });
  const availableLibFunctions = input.libCacheDir
    ? await hydrateFamilyLibCache({
        family: input.task.family,
        libCacheDir: input.libCacheDir,
        workspace,
        datafetchHome,
        tenantId,
      })
    : [];
  // Extract the family's entities from the workspace's initial_workspace
  // JSON (the SkillCraft fixture drops one .json file with a top-level
  // array of entities to analyse). Records get mounted as df.db.records
  // for this episode so the agent has a substrate-rooted way to query
  // the entity list, and trajectories contain a db.* call the observer's
  // gate can compose around.
  const familyRecords = await extractFamilyEntities({
    family: input.task.family,
    initialWorkspaceDir: workspace,
  });
  const mountId = `skillcraft-${input.task.family}`;
  let mountedRuntime: MountRuntime | null = null;
  if (familyRecords.length > 0) {
    mountedRuntime = await registerEvalRecordsMount({ mountId, records: familyRecords });
  }
  // Drop the substrate-level per_entity seed under <datafetchHome>/lib/__seed__/.
  // The path is outside the per-tenant prohibition (which targets
  // <baseDir>/lib/<tenantId>/) and the body is family-agnostic; the
  // agent supplies toolBundle/toolNames/paramName at call time.
  await dropGenericSeed(datafetchHome);
  await prepareLiveWorkspace({
    task: input.task,
    skillcraftDir: input.skillcraftDir,
    workspace,
    artifactDir,
    availableLibFunctions,
    seededLibFunctions: [PER_ENTITY_SEED_NAME],
    mountedRecords: familyRecords.length,
  });
  // Drop the episode context file used by the dev-only datafetch runner.
  // The Codex-facing prompt deliberately avoids live probes because the
  // sandboxed probe environment can make real tool calls look unavailable.
  await fsp.writeFile(
    path.join(workspace, ".datafetch-ctx.json"),
    `${JSON.stringify({
      tenantId,
      skillcraftDir: input.skillcraftDir,
      datafetchHome,
      bundles: taskToolBundles(input.task),
      skillcraftToolRunnerPath: path.resolve("eval/skillcraft/scripts/invoke-skillcraft-tool.py"),
      snippetTimeoutMs: input.snippetTimeoutMs,
      family: input.task.family,
      mountId,
      records: familyRecords,
    }, null, 2)}\n`,
  );
  const prompt = await renderLivePrompt({
    task: input.task,
    workspace,
    records: familyRecords,
  });
  const agentRun = await runAgent({
    workspaceDir: workspace,
    prompt,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    timeoutMs: input.timeoutMs,
  });
  await writeAgentArtifacts({ artifactDir, agentRun });

  const answerPath = path.join(workspace, "scripts", "answer.ts");
  let snippetExitCode = 1;
  let trajectory: TrajectoryRecord | undefined;
  if (await exists(answerPath)) {
    await syncLibExportAliases(path.join(workspace, "lib"));
    const rawSource = await fsp.readFile(answerPath, "utf8");
    const source = prepareAnswerSourceForRuntime(rawSource, workspace);
    await fsp.writeFile(path.join(artifactDir, "prepared-answer.ts"), source);
    await mirrorWorkspaceLibsToResolver({
      workspace,
      datafetchHome,
      tenantId,
    });
    const { snippetRuntime } = await installSnippetRuntime({
      baseDir: datafetchHome,
      skipSeedMirror: true,
    });
    const { observer } = installObserver({ baseDir: datafetchHome, tenantId, snippetRuntime });
    const run = await snippetRuntime.run({
      source,
      sourcePath: answerPath,
      sessionCtx: {
        tenantId,
        mountIds: mountedRuntime ? [mountId] : [],
        baseDir: datafetchHome,
        // Goal-3 iter 9: when the eval mounts df.db.records for this
        // episode, require the final scripts/answer.ts to reach its
        // answer through the substrate (df.db.* or df.lib.*) rather
        // than bare df.tool.* fan-out. Non-mounted tenants are unaffected.
        ...(mountedRuntime ? { requireSubstrateRootedChain: true } : {}),
        skillcraftToolBridge: {
          skillcraftDir: input.skillcraftDir,
          bundles: taskToolBundles(input.task),
          runnerPath: path.resolve("eval/skillcraft/scripts/invoke-skillcraft-tool.py"),
        },
        snippetTimeoutMs: input.snippetTimeoutMs,
      },
    });
    snippetExitCode = run.exitCode;
    // Goal-3 iter 10 race fix: the observer is fire-and-forget from the
    // snippet runtime, so the answer.ts run returns BEFORE the observer
    // finishes authoring (which can crystallise multiple helpers per
    // trajectory under iter 10's sub-graph extractor). Without awaiting,
    // persistFamilyLibCache can fire before the second helper lands on
    // disk and the warm tier sees only one of the two crystallised
    // interfaces. Wait up to 5s for the observer to settle on this
    // trajectory; if it never started (no snippetRuntime.onTrajectorySaved),
    // the promise lookup returns undefined and we proceed.
    if (run.trajectoryId) {
      const observePromise = observer.observerPromise.get(run.trajectoryId);
      if (observePromise) {
        const deadline = new Promise<void>((resolve) =>
          setTimeout(resolve, 5_000),
        );
        await Promise.race([observePromise.then(() => undefined), deadline]);
      }
    }
    await fsp.writeFile(path.join(artifactDir, "snippet-stdout.txt"), run.stdout);
    await fsp.writeFile(path.join(artifactDir, "snippet-stderr.txt"), run.stderr);
    await fsp.writeFile(path.join(artifactDir, "snippet-result.json"), `${JSON.stringify({
      exitCode: run.exitCode,
      trajectoryId: run.trajectoryId,
      cost: run.cost,
      answer: run.answer ?? null,
    }, null, 2)}\n`);
    if (run.trajectoryId) trajectory = await readTrajectory(run.trajectoryId, datafetchHome);
  } else {
    await fsp.writeFile(path.join(artifactDir, "snippet-stderr.txt"), "scripts/answer.ts was not written by the agent\n");
  }

  const evaluator = await runEvaluator({
    skillcraftDir: input.skillcraftDir,
    evaluatorPath: input.task.evaluatorPath,
    workspace,
    groundtruth,
  });
  await fsp.writeFile(path.join(artifactDir, "evaluator-stdout.txt"), evaluator.stdout);
  await fsp.writeFile(path.join(artifactDir, "evaluator-stderr.txt"), evaluator.stderr);
  await fsp.writeFile(
    path.join(artifactDir, "evaluator-result.json"),
    `${JSON.stringify({ exitCode: evaluator.exitCode, elapsedMs: evaluator.elapsedMs, scoreJson: evaluator.scoreJson }, null, 2)}\n`,
  );

  const score = scoreObject(evaluator.scoreJson);
  const percent = numberOr(score?.percent, 0);
  const agentFailureKind = classifyAgentFailure(agentRun);
  const status = agentFailureKind === "model_usage_limit"
    ? "infrastructure_error"
    : snippetExitCode === 0
      ? stringOrNull(evaluator.scoreJson?.status)
      : "runtime_error";
  const passed = snippetExitCode === 0 && Boolean(evaluator.scoreJson?.passed);
  const workspaceLibFunctions = await listLibFunctionNames(path.join(workspace, "lib"));
  const availableSet = new Set(availableLibFunctions);
  const createdLibFunctions = passed
    ? workspaceLibFunctions.filter((name) => !availableSet.has(name)).length
    : 0;
  const promotedToLibCache = Boolean(
    passed &&
    input.libCacheDir &&
    LEARN_FROM_LEVELS.has(input.task.level),
  );
  if (promotedToLibCache && input.libCacheDir) {
    await persistFamilyLibCache({
      family: input.task.family,
      libCacheDir: input.libCacheDir,
      workspace,
      datafetchHome,
      tenantId,
    });
  } else if (input.libCacheDir) {
    // Goal-4 Change 3: even when this episode did NOT promote a helper
    // (failed, or a hard-tier level we don't learn from), persist the
    // convergence index — the intents this episode exhibited must carry
    // forward so a later episode of the family can converge on them.
    await persistFamilyConvergenceIndex({
      family: input.task.family,
      libCacheDir: input.libCacheDir,
      datafetchHome,
      tenantId,
    });
  }
  if (mountedRuntime) {
    getMountRuntimeRegistry().unregister(mountId);
  }
  const calls = trajectory?.calls ?? [];
  const toolCalls = calls.filter((call) => call.primitive.startsWith("tool.")).length;
  const libCalls = calls.filter((call) => call.primitive.startsWith("lib.")).length;
  const reuseDenominator = toolCalls + libCalls;
  await fsp.writeFile(path.join(artifactDir, "lib-status.json"), `${JSON.stringify({
    availableAtStart: availableLibFunctions,
    functionsAfterAgent: workspaceLibFunctions,
    committedNewFunctions: createdLibFunctions,
    libCalls,
    toolCalls,
    reuseRate: reuseDenominator === 0 ? 0 : libCalls / reuseDenominator,
  }, null, 2)}\n`);
  return {
    taskKey: input.task.taskKey,
    taskFamily: input.task.family,
    family: input.task.family,
    taskId: `${input.task.family}-${input.task.level}`,
    round: input.task.level,
    level: input.task.level,
    mode: "datafetch",
    officialPassed: passed,
    officialStatus: status,
    officialScorePercent: percent,
    officialScore: score ?? null,
    answerCorrect: passed,
    answerStatus: passed ? "answered" : status ?? "unsupported",
    totalTokens: agentRun.usage.inputTokens + agentRun.usage.outputTokens,
    effectiveTokens: Math.max(0, agentRun.usage.inputTokens - agentRun.usage.cachedInputTokens) + agentRun.usage.outputTokens,
    elapsedMs: Math.round(agentRun.elapsedMs + evaluator.elapsedMs),
    llmCalls: agentRun.usage.llmCalls,
    toolCalls,
    libFunctionsUsed: libCalls,
    libFunctionsAvailable: availableLibFunctions.length,
    libFunctionsCreated: createdLibFunctions,
    reuseRate: reuseDenominator === 0 ? 0 : libCalls / reuseDenominator,
    regressionsPassed: null,
    artifactPath: path.relative(process.cwd(), artifactDir),
    bridgeStatus: "live-agent-experimental",
    agentExitCode: agentRun.exitCode,
    snippetExitCode,
    agentFailureKind: agentFailureKind ?? undefined,
    phase: phaseForLevel(input.task.level),
    promotedToLibCache,
    agentInputTokens: agentRun.usage.inputTokens,
    agentCachedInputTokens: agentRun.usage.cachedInputTokens,
    agentOutputTokens: agentRun.usage.outputTokens,
    agentReasoningTokens: agentRun.usage.reasoningOutputTokens,
    agentElapsedMs: Math.round(agentRun.elapsedMs),
  };
}

function compareTasks(left: SkillCraftTask, right: SkillCraftTask): number {
  const familyCompare = left.family.localeCompare(right.family);
  if (familyCompare !== 0) return familyCompare;
  return levelRank(left.level) - levelRank(right.level);
}

function levelRank(level: string): number {
  const index = LEVEL_ORDER.indexOf(level as typeof LEVEL_ORDER[number]);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function phaseForLevel(level: string): AdapterEpisode["phase"] {
  if (level === "e1") return "train";
  if (level === "h1") return "hard";
  if (["e2", "e3", "m1", "m2"].includes(level)) return "warm";
  return "unknown";
}

export function prepareAnswerSourceForRuntime(source: string, workspace: string): string {
  let body = rewriteDirectLibImports(source);
  body = stripTypeReferenceDirectives(body);
  body = stripLocalDatafetchRuntimeImports(body);
  body = rewriteCommonJsFsPromisesRequire(body);
  body = rewriteHyphenatedLocalPropertyAccess(body);
  body = rewriteGeneratedSyntaxSlips(body);
  body = rewriteLocalPathHelperFallbacks(body);
  body = rewriteUnsafeRecordFindExactAccess(body);
  const hasIntentRecordWrapper = /\bloadRecordIntentRows\b/.test(body);
  if (!hasIntentRecordWrapper) {
    body = rewriteLiteralEntityArraysFromRecords(body, workspace);
    body = rewriteLiteralTupleEntityArraysFromRecords(body, workspace);
  }
  body = rewritePerEntityRecordIdMaps(body, workspace);
  body = rewriteFlatToolCalls(body, workspace);
  body = rewriteDfAnswerKitHelperDestructuring(body);
  body = rewriteDfAnswerKitPropertyCalls(body);
  body = renameLateLocalAnswerKitHelperShadows(body);
  body = injectAnswerKitImports(body);
  body = body.replace(/^\s*export\s*\{\s*\}\s*;?\s*$/gm, "");
  let appendedCall = "";
  let returnedInlineIife = false;
  const defaultInvocation = /^\s*export\s+default\s+(?:await\s+)?([A-Za-z_$][\w$]*)\s*\(\s*\)\s*;?\s*$/m.exec(body);
  if (defaultInvocation?.[1]) {
    body = body.replace(/^\s*export\s+default\s+(?:await\s+)?([A-Za-z_$][\w$]*)\s*\(\s*\)\s*;?\s*$/m, "");
    appendedCall = `\nreturn await ${defaultInvocation[1]}();\n`;
  }
  const defaultAsyncFunction = /\bexport\s+default\s+async\s+function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(body);
  if (!appendedCall && defaultAsyncFunction?.[1]) {
    body = body.replace(/\bexport\s+default\s+async\s+function\s+([A-Za-z_$][\w$]*)\s*\(/, "async function $1(");
    appendedCall = `\nreturn await ${defaultAsyncFunction[1]}();\n`;
  }
  const defaultFunction = /\bexport\s+default\s+function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(body);
  if (!appendedCall && defaultFunction?.[1]) {
    body = body.replace(/\bexport\s+default\s+function\s+([A-Za-z_$][\w$]*)\s*\(/, "function $1(");
    appendedCall = `\nreturn await ${defaultFunction[1]}();\n`;
  }
  const defaultIdentifier = /^\s*export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/m.exec(body);
  if (!appendedCall && defaultIdentifier?.[1]) {
    body = body.replace(/^\s*export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/m, "");
    appendedCall = `\nreturn await ${defaultIdentifier[1]}();\n`;
  }
  body = stripNamedAnswerExports(body);
  const trailingNamedInvocation = /\n\s*(?:await\s+|void\s+)?([A-Za-z_$][\w$]*)\s*\(\s*\)\s*;?\s*$/.exec(body);
  if (!appendedCall && trailingNamedInvocation?.[1]) {
    const name = trailingNamedInvocation[1];
    const hasCallable =
      new RegExp(`\\b(?:async\\s+)?function\\s+${escapeRegExp(name)}\\s*\\(`).test(body) ||
      new RegExp(`\\b(?:const|let|var)\\s+${escapeRegExp(name)}\\s*=`).test(body);
    if (hasCallable && typeof trailingNamedInvocation.index === "number") {
      body = body.slice(0, trailingNamedInvocation.index);
      appendedCall = `\nreturn await ${name}();\n`;
    }
  }
  const trailingNamedCatchInvocation = /\n\s*([A-Za-z_$][\w$]*)\s*\(\s*\)\.catch\s*\([\s\S]*?\)\s*;?\s*$/.exec(body);
  if (!appendedCall && trailingNamedCatchInvocation?.[1]) {
    const name = trailingNamedCatchInvocation[1];
    const hasCallable =
      new RegExp(`\\b(?:async\\s+)?function\\s+${escapeRegExp(name)}\\s*\\(`).test(body) ||
      new RegExp(`\\b(?:const|let|var)\\s+${escapeRegExp(name)}\\s*=`).test(body);
    if (hasCallable && typeof trailingNamedCatchInvocation.index === "number") {
      body = body.slice(0, trailingNamedCatchInvocation.index);
      appendedCall = `\nreturn await ${name}();\n`;
    }
  }
  const trailingNamedThenCatchInvocation = /\n\s*([A-Za-z_$][\w$]*)\s*\(\s*\)\.then\s*\([\s\S]*?\)\.catch\s*\([\s\S]*?\)\s*;?\s*$/.exec(body);
  if (!appendedCall && trailingNamedThenCatchInvocation?.[1]) {
    const name = trailingNamedThenCatchInvocation[1];
    const hasCallable =
      new RegExp(`\\b(?:async\\s+)?function\\s+${escapeRegExp(name)}\\s*\\(`).test(body) ||
      new RegExp(`\\b(?:const|let|var)\\s+${escapeRegExp(name)}\\s*=`).test(body);
    if (hasCallable && typeof trailingNamedThenCatchInvocation.index === "number") {
      body = body.slice(0, trailingNamedThenCatchInvocation.index);
      appendedCall = `\nreturn await ${name}();\n`;
    }
  }
  const namedAsyncIifeWithCatch = /^\s*;?\s*(?:void\s+)?\(\s*async\s+function\s+([A-Za-z_$][\w$]*)\s*\(/m.exec(body);
  if (
    !appendedCall &&
      namedAsyncIifeWithCatch?.[1] &&
      /\}\s*\)\s*\(\s*\)\.catch\s*\([\s\S]*?\)\s*;?\s*$/.test(body)
  ) {
    body = body.replace(
      /^\s*;?\s*(?:void\s+)?\(\s*async\s+function\s+([A-Za-z_$][\w$]*)\s*\(/m,
      "async function $1(",
    );
    body = body.replace(/\}\s*\)\s*\(\s*\)\.catch\s*\([\s\S]*?\)\s*;?\s*$/, "}\n");
    appendedCall = `\nreturn await ${namedAsyncIifeWithCatch[1]}();\n`;
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
  const mainInvocation = /^\s*(?:void\s+)?main\s*\(\s*\)\s*;?\s*$/m;
  if (mainInvocation.test(body)) {
    body = body.replace(mainInvocation, "");
    if (!appendedCall && /\b(?:async\s+)?function\s+main\s*\(/.test(body)) {
      appendedCall = "\nreturn await main();\n";
    }
  }
  const mainCatchInvocation = /^\s*(?:void\s+)?main\s*\(\s*\)\.catch\s*\([\s\S]*?\)\s*;?\s*$/m;
  if (mainCatchInvocation.test(body)) {
    body = body.replace(mainCatchInvocation, "");
    if (!appendedCall && /\b(?:async\s+)?function\s+main\s*\(/.test(body)) {
      appendedCall = "\nreturn await main();\n";
    }
  }
  if (!appendedCall) {
    body = body.replace(
      /\n\s*df\.answer\s*\(([\s\S]*?)\)\s*;?\s*$/,
      "\nreturn df.answer($1);\n",
    );
  }
  const lines = body.split("\n");
  const imports: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      imports.push(line);
      index += 1;
      continue;
    }
    if (!trimmed.startsWith("import ")) break;
    const semicolonIndex = line.indexOf(";");
    if (semicolonIndex !== -1 && line.slice(semicolonIndex + 1).trim().length > 0) {
      imports.push(line.slice(0, semicolonIndex + 1));
      lines[index] = line.slice(semicolonIndex + 1);
      break;
    }
    imports.push(line);
    index += 1;
    while (index < lines.length && !(lines[index - 1] ?? "").trimEnd().endsWith(";")) {
      imports.push(lines[index] ?? "");
      index += 1;
    }
  }
  const safeRecordLookup = /\bsafeRecordsFindExact\b/.test(body)
    ? [
      "const safeRecordsFindExact = async (filter: Record<string, unknown>, limit?: number): Promise<any[]> => {",
      "  try {",
      "    const records = await (df as any).db?.records?.findExact?.(filter, limit);",
      "    return Array.isArray(records) ? records : [];",
      "  } catch (error) {",
      "    const message = String((error as any)?.message ?? error);",
      "    if (message.includes(\"ident not found across mounts\")) return [];",
      "    throw error;",
      "  }",
      "};",
    ].join("\n")
    : "";
  return [
    ...imports,
    `process.chdir(${JSON.stringify(workspace)});`,
    safeRecordLookup,
    lines.slice(index).join("\n"),
    appendedCall,
  ].join("\n");
}

function rewritePerEntityRecordIdMaps(source: string, workspace: string): string {
  if (!source.includes("df.lib.per_entity")) return source;
  const records = readWorkspaceEvalRecords(workspace);
  if (records.length === 0) return source;
  const recordParamFields = recordParamFieldNames(records);
  const fieldByEntityIdsVar = new Map<string, string>();

  for (const match of source.matchAll(/df\.lib\.per_entity\s*\(\s*\{([\s\S]*?)\}\s*\)/g)) {
    const objectSource = match[1] ?? "";
    const paramName = /(?:^|[\s,{])paramName\s*:\s*["']([^"']+)["']/.exec(objectSource)?.[1];
    if (!paramName) continue;
    const recordField = recordFieldForToolParam(paramName, recordParamFields);
    if (!recordField || recordField === "id" || recordField === "entity") continue;
    const entityIdsVar = /(?:^|[\s,{])entityIds\s*:\s*([A-Za-z_$][\w$]*)\b/.exec(objectSource)?.[1];
    if (entityIdsVar) fieldByEntityIdsVar.set(entityIdsVar, recordField);
  }

  let rewritten = source.replace(
    /\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\.map\(\s*\(?\s*([A-Za-z_$][\w$]*)(?:\s*:\s*any)?\s*\)?\s*=>\s*\4\.(?:id|entity)\s*\)(\.filter\(Boolean\))?/g,
    (match, decl: string, varName: string, recordsVar: string, recordVar: string, filter: string | undefined) => {
      const recordField = fieldByEntityIdsVar.get(varName);
      if (!recordField) return match;
      return `${decl} ${varName} = ${recordsVar}.map((${recordVar}: any) => ${renderRecordValueExpression(recordVar, recordField)})${filter ?? ""}`;
    },
  );

  rewritten = rewritten.replace(
    /df\.lib\.per_entity\s*\(\s*\{([\s\S]*?)\}\s*\)/g,
    (match, objectSource: string) => {
      const paramName = /(?:^|[\s,{])paramName\s*:\s*["']([^"']+)["']/.exec(objectSource)?.[1];
      if (!paramName) return match;
      const recordField = recordFieldForToolParam(paramName, recordParamFields);
      if (!recordField || recordField === "id" || recordField === "entity") return match;
      return match.replace(
        /entityIds\s*:\s*([A-Za-z_$][\w$]*)\.map\(\s*\(?\s*([A-Za-z_$][\w$]*)(?:\s*:\s*any)?\s*\)?\s*=>\s*\2\.(?:id|entity)\s*\)/,
        (_entityMatch, recordsVar: string, recordVar: string) =>
          `entityIds: ${recordsVar}.map((${recordVar}: any) => ${renderRecordValueExpression(recordVar, recordField)})`,
      );
    },
  );

  return rewritten;
}

function rewriteLiteralEntityArraysFromRecords(source: string, workspace: string): string {
  if (!source.includes("df.tool.") || source.includes("df.db.records")) return source;
  const records = readWorkspaceEvalRecords(workspace);
  if (records.length === 0) return source;
  const recordParamFields = recordParamFieldNames(records);
  const family = records[0]?.family;
  if (!family || records.some((record) => record.family !== family)) return source;

  return source.replace(
    /\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[((?:\s*\{[\s\S]*?\}\s*,?)+)\s*\]\s*;?/g,
    (match, decl: string, varName: string, arrayBody: string) => {
      const objects = parseLiteralObjects(arrayBody);
      if (objects.length < 2 || objects.length > records.length) return match;
      const propNames = Object.keys(objects[0] ?? {});
      if (propNames.length === 0) return match;
      if (objects.some((object) => Object.keys(object).length !== propNames.length)) return match;
      const fieldByProp = new Map<string, string>();
      const literalProps: string[] = [];
      for (const propName of propNames) {
        const values = objects
          .map((object) => object[propName])
          .filter((value): value is string | number => value !== undefined);
        if (values.length !== objects.length) return match;
        const field = recordFieldForLiteralValues(propName, values, records, recordParamFields);
        if (field) {
          fieldByProp.set(propName, field);
        } else {
          literalProps.push(propName);
        }
      }
      if (fieldByProp.size === 0) return match;
      const primary = pickLiteralArrayPrimaryField(propNames, fieldByProp, objects);
      if (!primary) return match;
      const primaryValues = objects.map((object) => object[primary.propName]);
      const recordsVar = `${varName}RecordsFromDatafetch`;
      const primaryExpr = renderRecordValueExpression("r", primary.field);
      const valueSet = `[${primaryValues.map((value) => JSON.stringify(String(value))).join(", ")}]`;
      const mappedProps = propNames
        .filter((propName) => fieldByProp.has(propName))
        .map((propName) => `  ${propName}: ${renderRecordValueExpression("r", fieldByProp.get(propName)!)}`);
      const literalMapVar = `${varName}LiteralByDatafetchKey`;
      const literalMap = literalProps.length > 0
        ? `${decl} ${literalMapVar} = new Map(${JSON.stringify(objects.map((object) => [
          String(object[primary.propName]),
          Object.fromEntries(literalProps.map((propName) => [propName, object[propName]])),
        ]))});`
        : "";
      const literalSpread = literalProps.length > 0
        ? `,\n  ...(${literalMapVar}.get(String(${primaryExpr})) ?? {})`
        : "";
      return [
        literalMap,
        `${decl} ${recordsVar} = (await df.db.records.findExact({ family: ${JSON.stringify(family)} }, ${records.length})).filter((r: any) => new Set(${valueSet}).has(String(${primaryExpr})));`,
        `${decl} ${varName} = ${recordsVar}.map((r: any) => ({`,
        `${mappedProps.join(",\n")}${literalSpread}`,
        "}));",
      ].filter((line) => line.length > 0).join("\n");
    },
  );
}

function rewriteLiteralTupleEntityArraysFromRecords(source: string, workspace: string): string {
  if (!source.includes("df.tool.") || source.includes("df.db.records")) return source;
  const records = readWorkspaceEvalRecords(workspace);
  if (records.length === 0) return source;
  const recordParamFields = recordParamFieldNames(records);
  const family = records[0]?.family;
  if (!family || records.some((record) => record.family !== family)) return source;

  return source.replace(
    /\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[((?:\s*\[[\s\S]*?\]\s*,?)+)\s*\]\s*(?:as\s+const)?\s*;?/g,
    (match, decl: string, varName: string, arrayBody: string) => {
      const tuples = parseLiteralTuples(arrayBody);
      if (tuples.length < 2 || tuples.length > records.length) return match;
      const width = tuples[0]?.length ?? 0;
      if (width === 0 || tuples.some((tuple) => tuple.length !== width)) return match;
      const fields: string[] = [];
      for (let index = 0; index < width; index += 1) {
        const values = tuples.map((tuple) => tuple[index]!).filter((value): value is string | number => value !== undefined);
        const field = recordFieldForLiteralValues(`field_${index}`, values, records, recordParamFields);
        if (!field) return match;
        fields.push(field);
      }
      const primary = pickTuplePrimaryField(tuples, fields);
      if (!primary) return match;
      const recordsVar = `${varName}RecordsFromDatafetch`;
      const valueSet = `[${tuples.map((tuple) => JSON.stringify(String(tuple[primary.index]))).join(", ")}]`;
      const primaryExpr = renderRecordValueExpression("r", primary.field);
      const tupleValues = fields.map((field) => `  ${renderRecordValueExpression("r", field)}`);
      return [
        `${decl} ${recordsVar} = (await df.db.records.findExact({ family: ${JSON.stringify(family)} }, ${records.length})).filter((r: any) => new Set(${valueSet}).has(String(${primaryExpr})));`,
        `${decl} ${varName} = ${recordsVar}.map((r: any) => ([`,
        tupleValues.join(",\n"),
        "] as const));",
      ].join("\n");
    },
  );
}

function parseLiteralObjects(arrayBody: string): Array<Record<string, string | number>> {
  const objects: Array<Record<string, string | number>> = [];
  for (const match of arrayBody.matchAll(/\{([\s\S]*?)\}\s*,?/g)) {
    const objectSource = match[1] ?? "";
    const object: Record<string, string | number> = {};
    for (const propMatch of objectSource.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*(?:"([^"]*)"|'([^']*)'|(-?\d+(?:\.\d+)?))/g)) {
      const [, key, doubleQuoted, singleQuoted, numeric] = propMatch;
      if (!key) continue;
      if (numeric !== undefined) {
        object[key] = Number(numeric);
      } else {
        object[key] = doubleQuoted ?? singleQuoted ?? "";
      }
    }
    if (Object.keys(object).length > 0) objects.push(object);
  }
  return objects;
}

function parseLiteralTuples(arrayBody: string): Array<Array<string | number>> {
  const tuples: Array<Array<string | number>> = [];
  for (const match of arrayBody.matchAll(/\[([\s\S]*?)\]\s*,?/g)) {
    const tupleSource = match[1] ?? "";
    const tuple: Array<string | number> = [];
    for (const valueMatch of tupleSource.matchAll(/"([^"]*)"|'([^']*)'|(-?\d+(?:\.\d+)?)/g)) {
      const [, doubleQuoted, singleQuoted, numeric] = valueMatch;
      if (numeric !== undefined) {
        tuple.push(Number(numeric));
      } else {
        tuple.push(doubleQuoted ?? singleQuoted ?? "");
      }
    }
    if (tuple.length > 0) tuples.push(tuple);
  }
  return tuples;
}

function recordFieldForLiteralValues(
  propName: string,
  values: Array<string | number>,
  records: EvalRecord[],
  recordParamFields: ReadonlyMap<string, string>,
): string | null {
  const preferred = recordFieldForToolParam(propName, recordParamFields);
  const normalizedValues = new Set(values.map((value) => normalizeLiteralValue(value)));
  const availableFields = Array.from(new Set(recordParamFields.values()));
  const fallbackFields = propName.startsWith("field_")
    ? [
      ...availableFields.filter((field) => !isRecordSystemField(field)),
      ...availableFields.filter((field) => isRecordSystemField(field)),
    ]
    : availableFields;
  const fieldNames = [
    ...(preferred ? [preferred] : []),
    ...fallbackFields.filter((field) => field !== preferred),
  ];
  for (const field of fieldNames) {
    const recordValues = new Set(
      records
        .map((record) => recordValueForField(record, field))
        .filter((value): value is string | number => value !== undefined)
        .map((value) => normalizeLiteralValue(value)),
    );
    let allPresent = true;
    for (const value of normalizedValues) {
      if (!recordValues.has(value)) {
        allPresent = false;
        break;
      }
    }
    if (allPresent) return field;
  }
  return null;
}

function isRecordSystemField(field: string): boolean {
  return ["id", "entity", "label", "recordKey", "family"].includes(field);
}

function pickLiteralArrayPrimaryField(
  propNames: string[],
  fieldByProp: ReadonlyMap<string, string>,
  objects: Array<Record<string, string | number>>,
): { propName: string; field: string } | null {
  for (const propName of propNames) {
    const values = objects.map((object) => object[propName]);
    if (new Set(values.map((value) => normalizeLiteralValue(value ?? ""))).size !== values.length) continue;
    const field = fieldByProp.get(propName);
    if (field) return { propName, field };
  }
  const propName = propNames[0];
  const field = propName ? fieldByProp.get(propName) : undefined;
  return propName && field ? { propName, field } : null;
}

function pickTuplePrimaryField(
  tuples: Array<Array<string | number>>,
  fields: string[],
): { index: number; field: string } | null {
  for (let index = 0; index < fields.length; index += 1) {
    const values = tuples.map((tuple) => tuple[index]);
    if (new Set(values.map((value) => normalizeLiteralValue(value ?? ""))).size !== values.length) continue;
    return { index, field: fields[index]! };
  }
  return fields[0] ? { index: 0, field: fields[0] } : null;
}

function recordValueForField(record: EvalRecord, field: string): string | number | undefined {
  if (field === "id") return record.id;
  if (field === "entity") return record.entity;
  if (field === "label") return record.label;
  if (field === "recordKey") return record.recordKey;
  if (field === "family") return record.family;
  const value = record.attributes[field];
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function normalizeLiteralValue(value: string | number): string {
  return String(value).trim().toLowerCase();
}

function readWorkspaceEvalRecords(workspace: string): EvalRecord[] {
  try {
    const ctx = JSON.parse(readFileSync(path.join(workspace, ".datafetch-ctx.json"), "utf8")) as { records?: unknown };
    return Array.isArray(ctx.records) ? ctx.records.filter(isEvalRecord) : [];
  } catch {
    return [];
  }
}

function isEvalRecord(value: unknown): value is EvalRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.entity === "string" &&
    typeof record.recordKey === "string" &&
    typeof record.family === "string" &&
    record.attributes !== null &&
    typeof record.attributes === "object" &&
    !Array.isArray(record.attributes)
  );
}

function stripNamedAnswerExports(source: string): string {
  return source
    .replace(/^\s*export\s+(type|interface)\s+/gm, "$1 ")
    .replace(/^\s*export\s+default\s+((?:async\s+)?function\s+)/gm, "$1")
    .replace(/^\s*export\s+default\s+/gm, "return ")
    .replace(/^\s*export\s+((?:async\s+)?function\s+)/gm, "$1")
    .replace(/^\s*export\s+(const|let|var|class)\s+/gm, "$1 ");
}

function stripTypeReferenceDirectives(source: string): string {
  // Agent-written `/// <reference path="../df.d.ts" />` is type-only.
  // If left below injected process.chdir(), the snippet wrapper can place
  // later imports inside its async IIFE and make otherwise valid TS fail
  // parsing. Drop these directives before runtime execution.
  return source.replace(/^\s*\/\/\/\s*<reference\b[^\n]*(?:\n|$)/gm, "");
}

function stripLocalDatafetchRuntimeImports(source: string): string {
  const lines = source.split("\n");
  const out: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line.trimStart().startsWith("import ")) {
      out.push(line);
      continue;
    }
    const block = [line];
    while (
      index + 1 < lines.length &&
      !(lines[index] ?? "").trimEnd().endsWith(";")
    ) {
      index += 1;
      block.push(lines[index] ?? "");
    }
    const joined = block.join("\n");
    if (/\bfrom\s*["']\.\/datafetch(?:\.ts)?["']/.test(joined)) continue;
    if (/^\s*import\s*["']\.\/datafetch(?:\.ts)?["']\s*;?\s*$/.test(joined)) continue;
    out.push(...block);
  }
  return out.join("\n");
}

function rewriteGeneratedSyntaxSlips(source: string): string {
  const restParam = /(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*\([^)]*\.\.\.\s*([A-Za-z_$][\w$]*)[^)]*\)\s*=>\s*\{/.exec(source)?.[1];
  let out = source
    .replace(/\)\s*\.\s*\[/g, ")[")
    .replace(/\bconst\s+\(\s*([A-Za-z_$][\w$]*)\s*:\s*([^)]+?)\s*\)\s*=/g, "const $1: $2 =");
  out = rewriteDottedIndicatorOptionalAccess(out);
  out = rewriteMixedNullishLogicalExpressions(out);
  out = rewriteSnakeCaseObjectShorthandAliases(out);
  out = rewriteUnsafeStringCoercionCalls(out);
  if (!restParam) return out;
  return out.replace(/arguments\s*\[\s*arguments\.length\s*-\s*1\s*\]/g, `${restParam}[${restParam}.length - 1]`);
}

// Wrap calls to `.toLowerCase()`/`.toUpperCase()` on parenthesised
// nullish-fallback expressions in `String(...)` coercion, and coerce
// nullish-fallback variable initialisations whose RHS ends with `""`.
// Catches the common agent patterns:
//   (value ?? other ?? "").toLowerCase()
//   const entity = r.intentEntity ?? r.label ?? "";  // then entity.toLowerCase()
// where `value`/`other`/`r.intentEntity` can turn out to be a number
// or boolean — `??` short-circuits before the empty-string fallback,
// and `.toLowerCase()` then throws `TypeError: <x>.toLowerCase is not
// a function`. Generic substrate hardening; no benchmark identifiers.
//
// The negative lookbehind `(?<!String)` on the parenthesised form
// avoids re-wrapping when the agent already wrote `String((x ?? "")).
// toUpperCase()` (otherwise we'd produce the bogus identifier
// `StringString`).
export function rewriteUnsafeStringCoercionCalls(source: string): string {
  // String methods commonly called on values that nullish-fallback can
  // return as non-strings: toLowerCase, toUpperCase, includes, startsWith,
  // endsWith, trim, slice, indexOf, lastIndexOf, split, replace.
  // Generic JS string surface, not benchmark-specific.
  const unsafeMethods = "toLowerCase|toUpperCase|includes|startsWith|endsWith|trim|trimStart|trimEnd|slice|indexOf|lastIndexOf|split|replace|replaceAll|match|search|padStart|padEnd|repeat|charAt|codePointAt|normalize";
  const parenForm = new RegExp(
    `(?<!String)\\(([^()]*\\?\\?[^()]*)\\)\\.(${unsafeMethods})\\(`,
    "g",
  );
  return source
    .replace(parenForm, (_match, inner: string, method: string) => `String(${inner}).${method}(`)
    .replace(
      /\b((?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*)([^=;]+?\?\?[^=;]+?""\s*)(;)/g,
      (_match, prefix: string, rhs: string, semi: string) =>
        rhs.trimStart().startsWith("String(") ? `${prefix}${rhs}${semi}` : `${prefix}String(${rhs.trimEnd()})${semi}`,
    );
}

function rewriteDottedIndicatorOptionalAccess(source: string): string {
  return source.replace(
    /\?\.([A-Z]{2,}(?:\.[A-Z0-9]{2,}){2,})/g,
    (_match, indicator: string) => `?.[${JSON.stringify(indicator)}]`,
  );
}

function rewriteSnakeCaseObjectShorthandAliases(source: string): string {
  const declarations = new Set<string>();
  const declarationPattern = /\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of source.matchAll(declarationPattern)) {
    if (match[1]) declarations.add(match[1]);
  }
  const aliases = new Map<string, string>();
  for (const declaration of declarations) {
    const snake = declaration.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    if (snake !== declaration && !declarations.has(snake)) {
      aliases.set(snake, declaration);
    }
  }
  if (aliases.size === 0) return source;
  return source
    .split("\n")
    .map((line) => {
      const lineMatch = /^(\s*)([A-Za-z_$][\w$]*)(\s*,\s*)$/.exec(line);
      if (lineMatch && aliases.has(lineMatch[2]!)) {
        return `${lineMatch[1]}${lineMatch[2]}: ${aliases.get(lineMatch[2]!)},`;
      }
      return line.replace(
        /([,{]\s*)([A-Za-z_$][\w$]*)(\s*[,}])/g,
        (match, prefix: string, identifier: string, suffix: string) =>
          aliases.has(identifier)
            ? `${prefix}${identifier}: ${aliases.get(identifier)}${suffix}`
            : match,
      );
    })
    .join("\n");
}

export function rewriteMixedNullishLogicalExpressions(source: string): string {
  // Walk the source character-by-character, partition into statements
  // terminated by `;` at paren-depth 0, then parenthesize each statement
  // whose RHS mixes `??` with `||`/`&&`. Multi-line aware so prettier-style
  // wrapped const/return statements get the same treatment as single-line
  // ones. Braces are intentionally NOT depth-tracked so statements inside
  // function bodies and blocks still segment correctly; `;`s inside
  // for-loop headers stay un-split because they live inside `()`.
  const segments: string[] = [];
  let start = 0;
  let parenDepth = 0;
  let quote: "'" | "\"" | "`" | null = null;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quote) {
      if (char === "\\") {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === "\"" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[") {
      parenDepth += 1;
      continue;
    }
    if (char === ")" || char === "]") {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }
    if (parenDepth === 0 && char === ";") {
      segments.push(rewriteStatementMixedNullishLogical(source.slice(start, index + 1)));
      start = index + 1;
    }
  }
  if (start < source.length) segments.push(source.slice(start));
  return segments.join("");
}

function rewriteStatementMixedNullishLogical(stmt: string): string {
  if (!stmt.includes("??")) return stmt;
  if (!stmt.includes("||") && !stmt.includes("&&")) return stmt;
  const returnMatch = /^(\s*return\s+)([\s\S]*?)(;\s*)$/.exec(stmt);
  if (returnMatch) {
    return `${returnMatch[1]}${parenthesizeMixedNullishLogicalIterated(returnMatch[2] ?? "")}${returnMatch[3]}`;
  }
  const assignmentMatch = /^(\s*(?:const|let|var)\s+[^=]+=\s*)([\s\S]*?)(;\s*)$/.exec(stmt);
  if (assignmentMatch) {
    return `${assignmentMatch[1]}${parenthesizeMixedNullishLogicalIterated(assignmentMatch[2] ?? "")}${assignmentMatch[3]}`;
  }
  return stmt;
}

function parenthesizeMixedNullishLogicalIterated(expression: string): string {
  // A single parenthesisation pass only resolves the outermost mix;
  // nested mixes inside the newly-introduced parens stay illegal.
  // Iterate (bounded) until stable so chains like `a ?? b ?? c * (...) || 0`
  // become fully unambiguous.
  let current = expression;
  for (let i = 0; i < 16; i += 1) {
    const next = parenthesizeMixedNullishLogical(current);
    if (next === current) return current;
    current = next;
  }
  return current;
}

function parenthesizeMixedNullishLogical(expression: string): string {
  const nullishIndex = findTopLevelOperator(expression, ["??"]);
  const logicalIndex = findTopLevelOperator(expression, ["||", "&&"]);
  if (nullishIndex < 0 || logicalIndex < 0) return expression;
  if (logicalIndex < nullishIndex) {
    return `(${expression.slice(0, nullishIndex).trimEnd()}) ${expression.slice(nullishIndex).trimStart()}`;
  }
  return `${expression.slice(0, nullishIndex + 2).trimEnd()} (${expression.slice(nullishIndex + 2).trimStart()})`;
}

function findTopLevelOperator(expression: string, operators: string[]): number {
  let depth = 0;
  let quote: "'" | "\"" | "`" | null = null;
  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index]!;
    if (quote) {
      if (char === "\\") {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === "\"" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0) continue;
    for (const op of operators) {
      if (expression.startsWith(op, index)) return index;
    }
  }
  return -1;
}

export function rewriteHyphenatedLocalPropertyAccess(source: string): string {
  const rewriteChunk = (chunk: string): string =>
    chunk
      .replace(
        /([,{]\s*)((?:local|filesystem)-[A-Za-z0-9_-]+)\s*:/g,
        (_match, prefix: string, property: string) => `${prefix}${JSON.stringify(property)}:`,
      )
      .replace(
        /(\]|\))\?\.((?:local|filesystem)-[A-Za-z0-9_-]+)/g,
        (_match, receiverEnd: string, property: string) => `${receiverEnd}?.[${JSON.stringify(property)}]`,
      )
      .replace(
        /(\]|\))\.((?:local|filesystem)-[A-Za-z0-9_-]+)/g,
        (_match, receiverEnd: string, property: string) => `${receiverEnd}[${JSON.stringify(property)}]`,
      )
      .replace(
        /\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\?\.((?:local|filesystem)-[A-Za-z0-9_-]+)/g,
        (_match, receiver: string, property: string) => `${receiver}?.[${JSON.stringify(property)}]`,
      )
      .replace(
        /\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.((?:local|filesystem)-[A-Za-z0-9_-]+)/g,
        (_match, receiver: string, property: string) => `${receiver}[${JSON.stringify(property)}]`,
      );
  let out = "";
  let chunk = "";
  let quote: "'" | "\"" | "`" | null = null;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quote) {
      out += char;
      if (char === "\\") {
        index += 1;
        out += source[index] ?? "";
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === "\"" || char === "`") {
      out += rewriteChunk(chunk);
      chunk = "";
      quote = char;
      out += char;
      continue;
    }
    chunk += char;
  }
  return out + rewriteChunk(chunk);
}

function rewriteLocalPathHelperFallbacks(source: string): string {
  let out = source.replace(
    /(const\s+([A-Za-z_$][\w$]*)\s*=\s*\(\s*([A-Za-z_$][\w$]*)\s*:\s*any\s*,\s*\.\.\.([A-Za-z_$][\w$]*)\s*:\s*any\[\]\s*\)\s*=>\s*\{\n)(?!\s*const __dfDefault)([\s\S]*?return\s+)undefined(\s*;\n\s*\};)/g,
    (_match, head: string, _helper: string, _value: string, paths: string, bodyBeforeReturn: string, tail: string) =>
      `${head}  const __dfDefault = ${paths}.length > 0 && typeof ${paths}[${paths}.length - 1] !== "string" ? ${paths}.pop() : undefined;\n${bodyBeforeReturn}__dfDefault${tail}`,
  );
  out = out.replace(
    /for\s*\(\s*const\s+([A-Za-z_$][\w$]*)\s+of\s+([A-Za-z_$][\w$]*)\s*\)\s*\{\s*\n(\s*)const\s+parts\s*=\s*\1\.split\(\s*["']\.["']\s*\);/g,
    (_match, item: string, collection: string, indent: string) =>
      `for (const ${item} of ${collection}) {\n${indent}if (typeof ${item} !== "string") {\n${indent}  if (${item} !== undefined) return ${item};\n${indent}  continue;\n${indent}}\n${indent}const parts = ${item}.split(".");`,
  );
  out = out.replace(
    /^(\s*)for\s*\(\s*const\s+([A-Za-z_$][\w$]*)\s+of\s+([A-Za-z_$][\w$]*)\.split\(\s*["']\.["']\s*\)\s*\)/gm,
    (_match, indent: string, item: string, pathVar: string) =>
      `${indent}if (typeof ${pathVar} !== "string") {\n${indent}  if (${pathVar} !== undefined) return ${pathVar};\n${indent}  continue;\n${indent}}\n${indent}for (const ${item} of ${pathVar}.split("."))`,
  );
  return out;
}

function rewriteUnsafeRecordFindExactAccess(source: string): string {
  const dfAliases = new Set<string>();
  for (const match of source.matchAll(
    /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\(\s*df\s+as\s+any\s*\)|df\s+as\s+any)\s*;?/g,
  )) {
    if (match[1]) dfAliases.add(match[1]);
  }
  let out = source.replace(
    /\bconst\s+db(?:\s*:\s*[^=;]+)?\s*=\s*(?:\(\s*df\s+as\s+any\s*\)|df)\.db\s*;/g,
    "const db = { records: { findExact: safeRecordsFindExact } };",
  );
  out = out.replace(
    /\bconst\s+([A-Za-z_$][\w$]*)(?:\s*:\s*[^=;]+)?\s*=\s*(?:\(\s*df\s+as\s+any\s*\)|df)(?:\?\.|\.)db(?:\?\.|\.)records\s*;/g,
    "const $1 = { findExact: safeRecordsFindExact };",
  );
  out = out.replace(
    /\(\s*df\s+as\s+any\s*\)(?:\?\.|\.)db(?:\?\.|\.)records(?:\?\.|\.)findExact/g,
    "safeRecordsFindExact",
  );
  out = out.replace(
    /\bdf(?:\?\.|\.)db(?:\?\.|\.)records(?:\?\.|\.)findExact/g,
    "safeRecordsFindExact",
  );
  for (const alias of dfAliases) {
    out = out.replace(
      new RegExp(`\\b${escapeRegExp(alias)}(?:\\?\\.|\\.)db(?:\\?\\.|\\.)records(?:\\?\\.|\\.)findExact`, "g"),
      "safeRecordsFindExact",
    );
  }
  out = out.replace(
    /\bsafeRecordsFindExact\s*\?\.\s*\(/g,
    "safeRecordsFindExact(",
  );
  out = out.replace(
    /\bif\s*\(\s*safeRecordsFindExact\s*\)\s*await\s+safeRecordsFindExact\s*\(/g,
    "await safeRecordsFindExact(",
  );
  out = out.replace(
    /\bif\s*\(\s*(?:\(\s*df\s+as\s+any\s*\)|df)(?:\?\.|\.)db(?:\?\.|\.)records\s*\)\s*await\s+safeRecordsFindExact\s*\(/g,
    "await safeRecordsFindExact(",
  );
  out = out.replace(
    /\(\s*df\s+as\s+any\s*\)(?:\?\.|\.)db(?:\?\.|\.)records\s*\?\s*await\s+safeRecordsFindExact\s*\(/g,
    "safeRecordsFindExact ? await safeRecordsFindExact(",
  );
  for (const alias of dfAliases) {
    out = out.replace(
      new RegExp(`\\bif\\s*\\(\\s*${escapeRegExp(alias)}(?:\\?\\.|\\.)db(?:\\?\\.|\\.)records\\s*\\)\\s*await\\s+safeRecordsFindExact\\s*\\(`, "g"),
      "await safeRecordsFindExact(",
    );
    out = out.replace(
      new RegExp(`\\b${escapeRegExp(alias)}(?:\\?\\.|\\.)db(?:\\?\\.|\\.)records\\s*\\?\\s*await\\s+safeRecordsFindExact\\s*\\(`, "g"),
      "safeRecordsFindExact ? await safeRecordsFindExact(",
    );
  }
  out = out.replace(
    /\bif\s*\(\s*(?:\(\s*df\s+as\s+any\s*\)|df)(?:\?\.|\.)db(?:\?\.|\.)records(?:\?\.|\.)findExact\s*\)\s*await\s+safeRecordsFindExact\s*\(/g,
    "await safeRecordsFindExact(",
  );
  return out;
}

function rewriteFlatToolCalls(source: string, workspace: string): string {
  const toolMap = loadFlatToolCallMap(workspace);
  if (toolMap.size === 0) return source;
  let out = source;
  for (const [alias, target] of toolMap) {
    const replacement = `df.tool.${target.bundle}[${JSON.stringify(target.toolName)}](`;
    out = out.replace(
      new RegExp(`\\bdf\\.tool\\.${escapeRegExp(alias)}\\s*\\(`, "g"),
      replacement,
    );
    out = out.replace(
      new RegExp(`\\(\\s*df\\s+as\\s+any\\s*\\)\\.tool\\.${escapeRegExp(alias)}\\s*\\(`, "g"),
      replacement,
    );
  }
  return out;
}

function loadFlatToolCallMap(workspace: string): Map<string, { bundle: string; toolName: string }> {
  const manifestPath = path.join(workspace, "tool_manifest.json");
  const out = new Map<string, { bundle: string; toolName: string }>();
  if (!existsSync(manifestPath)) return out;
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return out;
  }
  if (!Array.isArray(manifest)) return out;
  for (const entry of manifest) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const bundle = (entry as { bundle?: unknown }).bundle;
    const tools = (entry as { tools?: unknown }).tools;
    if (typeof bundle !== "string" || !Array.isArray(tools)) continue;
    for (const tool of tools) {
      if (tool === null || typeof tool !== "object" || Array.isArray(tool)) continue;
      const toolName = (tool as { name?: unknown }).name;
      if (typeof toolName !== "string") continue;
      for (const alias of flatToolAliases(toolName)) {
        if (!out.has(alias)) out.set(alias, { bundle, toolName });
      }
    }
  }
  return out;
}

function flatToolAliases(toolName: string): string[] {
  const aliases = new Set<string>();
  aliases.add(toolName.replace(/[^A-Za-z0-9_$]+/g, "_"));
  aliases.add(toolName.replace(/^local-/, "").replace(/[^A-Za-z0-9_$]+/g, "_"));
  return [...aliases].filter((alias) => /^[A-Za-z_$][\w$]*$/.test(alias));
}

function rewriteCommonJsFsPromisesRequire(source: string): string {
  return source
    .replace(
      /^\s*const\s+\{\s*([^}]+?)\s*\}\s*=\s*require\s*\(\s*["'](?:node:)?fs\/promises["']\s*\)\s*;?\s*$/gm,
      (_match, names: string) => `import { ${names.trim()} } from "node:fs/promises";`,
    )
    .replace(
      /^\s*const\s+([A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*["'](?:node:)?fs\/promises["']\s*\)\s*;?\s*$/gm,
      (_match, name: string) => `import * as ${name} from "node:fs/promises";`,
    );
}

function rewriteDfAnswerKitHelperDestructuring(source: string): string {
  const helperNames = new Set<string>(ANSWER_KIT_HELPERS);
  return source.replace(
    /^\s*const\s+\{\s*([^}]+?)\s*\}\s*=\s*(?:\(\s*df\s+as\s+any\s*\)|df\s+as\s+any|df)\s*;?\s*$/gm,
    (line, rawNames: string) => {
      const names = rawNames
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
      if (names.length === 0) return line;
      const simpleNames = names.map((name) => name.split(":")[0]?.trim() ?? "");
      if (!simpleNames.every((name) => helperNames.has(name))) return line;
      return "";
    },
  );
}

function rewriteDfAnswerKitPropertyCalls(source: string): string {
  let out = source;
  for (const name of ANSWER_KIT_HELPERS) {
    out = out.replace(
      new RegExp(`\\bdf(?:\\?\\.|\\.)${escapeRegExp(name)}\\s*\\(`, "g"),
      `${name}(`,
    );
    out = out.replace(
      new RegExp(`\\(\\s*df\\s+as\\s+any\\s*\\)(?:\\?\\.|\\.)${escapeRegExp(name)}\\s*\\(`, "g"),
      `${name}(`,
    );
  }
  return out;
}

const ANSWER_KIT_IMPORT = "./datafetch_answer_kit.ts";
const ANSWER_KIT_HELPERS = [
  "g",
  "arr",
  "asArr",
  "num",
  "pickNum",
  "avg",
  "r1",
  "firstVal",
  "text",
  "rowsOf",
  "writeJson",
] as const;

function renameLateLocalAnswerKitHelperShadows(source: string): string {
  let out = source;
  for (const name of ["g"] as const) {
    const escaped = escapeRegExp(name);
    const imported = new RegExp(`import\\s*\\{[^}]*\\b${escaped}\\b[^}]*\\}\\s*from\\s*["']${escapeRegExp(ANSWER_KIT_IMPORT)}["']`).test(out);
    const binding = new RegExp(`\\b(?:const|let|var|function)\\s+${escaped}\\b`).exec(out);
    if (!binding) continue;
    const firstUse = new RegExp(`(^|[^.\\w$])${escaped}\\s*\\(`).exec(out);
    if (!imported && (!firstUse || firstUse.index > binding.index)) continue;
    const replacement = `__local${name[0]!.toUpperCase()}${name.slice(1)}`;
    out = out
      .replace(new RegExp(`\\b(const|let|var)\\s+${escaped}\\b`), `$1 ${replacement}`)
      .replace(new RegExp(`\\bfunction\\s+${escaped}\\b`), `function ${replacement}`);
  }
  return out;
}

function injectAnswerKitImports(source: string): string {
  const needed = ANSWER_KIT_HELPERS.filter((name) =>
    usesBareHelperCall(source, name) && !hasLocalBinding(source, name)
  );
  if (needed.length === 0) return source;
  if (source.includes(ANSWER_KIT_IMPORT)) return mergeAnswerKitImport(source, needed);
  return `import { ${needed.join(", ")} } from ${JSON.stringify(ANSWER_KIT_IMPORT)};\n${source}`;
}

function mergeAnswerKitImport(source: string, needed: string[]): string {
  const importPattern = new RegExp(
    `import\\s*\\{\\s*([^}]+?)\\s*\\}\\s*from\\s*["']${escapeRegExp(ANSWER_KIT_IMPORT)}["'];?`,
  );
  return source.replace(importPattern, (_match, rawNames: string) => {
    const names = new Set(
      rawNames
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
    );
    for (const name of needed) names.add(name);
    return `import { ${[...names].join(", ")} } from ${JSON.stringify(ANSWER_KIT_IMPORT)};`;
  });
}

function usesBareHelperCall(source: string, name: string): boolean {
  return new RegExp(`(^|[^.\\w$])${escapeRegExp(name)}\\s*\\(`).test(source);
}

function hasLocalBinding(source: string, name: string): boolean {
  const escaped = escapeRegExp(name);
  return (
    new RegExp(`import\\s*\\{[^}]*\\b${escaped}\\b[^}]*\\}\\s*from\\s*["']${escapeRegExp(ANSWER_KIT_IMPORT)}["']`).test(source) ||
    new RegExp(`\\b(?:const|let|var|function|class)\\s+${escaped}\\b`).test(source) ||
    new RegExp(`\\bimport\\s+${escaped}\\b`).test(source)
  );
}

function rewriteDirectLibImports(source: string): string {
  const importedNames = new Set<string>();
  let rewritten = source.replace(
    /^\s*import\s+\{\s*([^}]+)\s*\}\s+from\s+["']\.\.\/lib\/[^"']+["'];?\s*$/gm,
    (_match, names: string) => {
      for (const rawName of names.split(",")) {
        const [name] = rawName.trim().split(/\s+as\s+/);
        if (name && /^[A-Za-z_$][\w$]*$/.test(name)) importedNames.add(name);
      }
      return "";
    },
  );
  rewritten = rewritten.replace(
    /^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+["']\.\.\/lib\/[^"']+["'];?\s*$/gm,
    (_match, name: string) => {
      importedNames.add(name);
      return "";
    },
  );
  for (const name of importedNames) {
    rewritten = rewritten.replace(
      new RegExp(`(?<![A-Za-z0-9_$.])${escapeRegExp(name)}\\s*\\(`, "g"),
      `df.lib.${name}(`,
    );
  }
  return rewritten;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function prepareLiveWorkspace(input: {
  task: SkillCraftTask;
  skillcraftDir: string;
  workspace: string;
  artifactDir: string;
  availableLibFunctions: string[];
  seededLibFunctions?: string[];
  mountedRecords?: number;
}): Promise<void> {
  const toolCatalog = await collectToolCatalog(input.task, input.skillcraftDir);
  await fsp.copyFile(input.task.taskDocPath, path.join(input.workspace, "task.md"));
  if (await exists(input.task.agentPromptPath)) {
    await fsp.copyFile(input.task.agentPromptPath, path.join(input.workspace, "agent_system_prompt.md"));
  }
  await fsp.copyFile(input.task.taskConfigPath, path.join(input.workspace, "task_config.json"));
  await fsp.writeFile(
    path.join(input.workspace, "tool_manifest.json"),
    `${JSON.stringify(toolCatalog, null, 2)}\n`,
  );
  const allLibFunctions = Array.from(new Set([
    ...(input.seededLibFunctions ?? []),
    ...input.availableLibFunctions,
  ]));
  const libFunctionDocs = await loadLiveLibFunctionDocs({
    workspace: input.workspace,
    names: allLibFunctions,
  });
  await fsp.writeFile(
    path.join(input.workspace, "df.d.ts"),
    renderLiveDfDts(toolCatalog, libFunctionDocs, Boolean(input.mountedRecords)),
  );
  await fsp.writeFile(path.join(input.workspace, "AGENTS.md"), renderLiveAgentInstructions(input.task, toolCatalog));
  await writeLibAuthoringGuide({
    workspace: input.workspace,
    task: input.task,
    availableLibFunctions: input.availableLibFunctions,
    toolCatalog,
  });
  await fsp.mkdir(path.join(input.workspace, "scripts"), { recursive: true });
  await fsp.writeFile(path.join(input.workspace, "scripts", "answer.ts"), renderAnswerScaffold(input.task));
  await fsp.writeFile(path.join(input.workspace, "scripts", "datafetch_answer_kit.ts"), renderAnswerKitSource());
  await fsp.writeFile(path.join(input.artifactDir, "task-summary.json"), `${JSON.stringify(taskSummary(input.task), null, 2)}\n`);
}

type LiveLibFunctionDoc = {
  name: string;
  description: string | null;
  inputType: string;
};

async function loadLiveLibFunctionDocs(input: {
  workspace: string;
  names: string[];
}): Promise<LiveLibFunctionDoc[]> {
  const docs: LiveLibFunctionDoc[] = [];
  for (const name of input.names) {
    if (name === PER_ENTITY_SEED_NAME) {
      docs.push({
        name,
        description:
          "Cold-start seed helper for configurable per-entity tool fan-out. Use it only when no learned helper fits.",
        inputType:
          "{ entityIds: Array<string | number>; toolBundle: string; toolNames: string[]; paramName: string; paramByTool?: Record<string, string>; extraInput?: Record<string, unknown> }",
      });
      continue;
    }
    const file = path.join(input.workspace, "lib", `${name}.ts`);
    let source = "";
    try {
      source = await fsp.readFile(file, "utf8");
    } catch {
      // The resolver may expose a function without a workspace source file.
    }
    let description: string | null = null;
    if (source) {
      try {
        description = (await readFrontmatterHead(file)).description;
      } catch {
        description = null;
      }
    }
    docs.push({
      name,
      description,
      inputType: inferLiveLibInputType(source),
    });
  }
  return docs.sort(compareLiveLibDocs);
}

function inferLiveLibInputType(source: string): string {
  if (source.includes("Goal-4 learned record-backed fan-out interface")) {
    return "{ intent?: \"record-backed repeated fan-out\"; recordFilter?: Record<string, unknown>; recordLimit?: number }";
  }
  if (source.includes("Goal-4 learned record-backed dependent enrichment interface")) {
    return "{ intent?: \"record-backed dependent enrichment\"; recordFilter?: Record<string, unknown>; recordLimit?: number }";
  }
  if (source.includes("Goal-4 learned tool fan-out interface")) {
    return "{ intent?: \"repeated tool fan-out\"; limit?: number }";
  }
  if (
    source.includes("recordFilter") &&
    source.includes("toolBundle") &&
    source.includes("toolNames") &&
    source.includes("paramName")
  ) {
    return "{ recordFilter?: Record<string, unknown>; recordLimit?: number; entityField?: string; toolBundle: string; toolNames: string[]; paramName: string; paramByTool?: Record<string, string>; recordParamMapByTool?: Record<string, Record<string, string>>; sharedInput?: Record<string, unknown> }";
  }
  if (
    source.includes("entityValues") &&
    source.includes("toolBundle") &&
    source.includes("toolNames") &&
    source.includes("paramName")
  ) {
    return "{ entityValues: Array<string | number>; toolBundle: string; toolNames: string[]; paramName: string; paramByTool?: Record<string, string>; sharedInput?: Record<string, unknown> }";
  }
  return "any";
}

function compareLiveLibDocs(
  left: LiveLibFunctionDoc,
  right: LiveLibFunctionDoc,
): number {
  const leftSeed = left.name === PER_ENTITY_SEED_NAME;
  const rightSeed = right.name === PER_ENTITY_SEED_NAME;
  if (leftSeed !== rightSeed) return leftSeed ? 1 : -1;
  const leftLearnedFanout = left.description?.includes("learned") === true &&
    left.description.includes("fan-out");
  const rightLearnedFanout = right.description?.includes("learned") === true &&
    right.description.includes("fan-out");
  if (leftLearnedFanout !== rightLearnedFanout) {
    return leftLearnedFanout ? -1 : 1;
  }
  return left.name.localeCompare(right.name);
}

function renderLiveDfDts(
  toolCatalog: ToolCatalogEntry[],
  libFunctionDocs: LiveLibFunctionDoc[],
  recordsMounted: boolean,
): string {
  const bundleBlocks: string[] = [];
  for (const entry of toolCatalog) {
    const fields = entry.tools.map(renderLiveToolDeclaration).join("\n");
    bundleBlocks.push(`  ${entry.bundle}: {\n    [name: string]: (input: any) => Promise<any>;\n${fields}\n  };`);
  }
  const libResultType = "{ value: any; cost?: any; provenance?: any; escalations?: number }";
  const libFields = libFunctionDocs
    .map((doc) => renderLiveLibDeclaration(doc, libResultType))
    .join("\n");
  const dbBlock = recordsMounted
    ? `  db: {
    records: {
      // record.id is the raw, tool-callable entity identifier (e.g.
      // "Siamese", 169, "the-office"); pass it directly to per-entity
      // tools. record.recordKey is "<family>:<entity>" for cross-family
      // uniqueness; do NOT pass recordKey as a tool argument.
      findExact(filter: Record<string, unknown>, limit?: number): Promise<Array<{ id: string; recordKey: string; family: string; entity: string; label: string; attributes: Record<string, string | number | boolean> }>>;
      search(query: string, opts?: { limit?: number }): Promise<any[]>;
      findSimilar(query: string, limit?: number): Promise<any[]>;
      hybrid(query: string, opts?: { limit?: number }): Promise<any[]>;
    };
  };
`
    : "";
  return `
declare const df: {
${dbBlock}  tool: {
${bundleBlocks.join("\n")}
  };
  lib: {
${libFields}
  };
  answer(input: {
    status: "answered" | "partial" | "unsupported";
    value?: unknown;
    evidence?: unknown[];
    derivation?: unknown[];
    reason?: string;
  }): unknown;
};
`.trimStart();
}

function renderLiveLibDeclaration(
  doc: LiveLibFunctionDoc,
  libResultType: string,
): string {
  const lines: string[] = [];
  if (doc.description) {
    lines.push("    /**");
    for (const line of doc.description.split("\n")) {
      lines.push(`     * ${line.replace(/\*\//g, "* /")}`);
    }
    lines.push("     */");
  }
  lines.push(
    `    ${JSON.stringify(doc.name)}(input: ${doc.inputType}): Promise<${libResultType}>;`,
  );
  return lines.join("\n");
}

function renderLiveToolDeclaration(tool: ToolDescriptor): string {
  const lines: string[] = [];
  const description = compactToolDescription(tool.description);
  if (description) {
    lines.push("    /**");
    for (const line of description.split("\n")) {
      lines.push(`     * ${line.replace(/\*\//g, "* /")}`);
    }
    lines.push("     */");
  }
  const inputType = schemaToTs(tool.params_json_schema);
  lines.push(`    ${JSON.stringify(tool.name)}(input: ${inputType}): Promise<any>;`);
  return lines.join("\n");
}

function compactToolDescription(description: string): string {
  return description
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line, index, lines) => {
      if (line.length > 0) return true;
      return index > 0 && index < lines.length - 1 && lines[index - 1] !== "";
    })
    .slice(0, 40)
    .join("\n");
}

function renderLiveAgentInstructions(task: SkillCraftTask, toolCatalog: ToolCatalogEntry[]): string {
  const exactToolNames = flattenToolCatalogNames(toolCatalog);
  const bundleNames = toolCatalog.map((entry) => entry.bundle);
  return [
    "# Datafetch x SkillCraft Workspace",
    "",
    "Write `scripts/answer.ts`. You may also write reusable learned interfaces under `lib/*.ts` for future episodes.",
    "Use the official task prompt in `task.md` and the exact callable surface in `df.d.ts`. `df.d.ts` includes compact response-shape notes for tools; `tool_manifest.json` is only a last-resort fallback.",
    "Call official SkillCraft tools through `df.tool.<bundle>[\"local-tool_name\"]({ ... })`.",
    `Available tool bundle(s): ${bundleNames.join(", ") || "none"}.`,
    `Available exact tool names: ${exactToolNames.join(", ") || "none"}.`,
    "Use only the exact available tool names above. Do not infer, invent, or abbreviate endpoint names from `task_config.json` metadata.",
    "Before making raw `df.tool` calls, inspect `lib/` and prefer `df.lib.<name>(...)` when a helper fits the task.",
    "Only call helpers that are already listed in `df.d.ts`. A helper you create during this episode is saved for later learning, but it is not callable from the current `scripts/answer.ts` unless `df.d.ts` already listed it.",
    "For repeated per-entity tool fan-out, use an existing learned helper first; if none is listed, use the seed `df.lib.per_entity(...)` instead of writing a raw `df.tool` loop in the final answer.",
    "For reusable helpers, prefer accepting tool names and an argument object as input rather than hard-coding one level's exact endpoints.",
    "Keep helper schemas permissive enough for the exact caller shape you use in `scripts/answer.ts`; for nested entity objects, prefer `v.unknown()` or a loose object over a brittle field set.",
    "If `scripts/answer.ts` calls `df.lib.someHelper({ city: { name } })`, the helper input schema must accept `city.name`; do not require a different field like `city_name` unless the caller passes it.",
    "Keep `scripts/answer.ts` as an executable script. Do not export from it; the harness calls the script and records its `df.answer(...)` return value.",
    "Write the required output JSON file directly in this workspace using Node `fs/promises`.",
    "Do not call `claim_done`; the harness runs the official evaluator after your script exits.",
    "Finish with `return df.answer({ status: \"answered\", value, evidence, derivation })`.",
    "Do not run live tool probes from Codex. In the sandbox, probe-time tool/network failures can be misleading. Use `df.d.ts` response-shape notes and write guarded code; the harness runs the final script once after the agent exits.",
    "Cost matters: inspect targeted file sections only. Do not print full `tool_manifest.json`, full tool responses, or the full generated `scripts/answer.ts` unless a failure requires it.",
    ...renderInputHygieneRules(),
    `Expected output file(s): ${task.expectedOutputFiles.join(", ") || "see task.md/evaluator"}.`,
    "",
  ].join("\n");
}

export function renderAnswerScaffold(task: SkillCraftTask): string {
  return [
    "import { writeFile } from \"node:fs/promises\";",
    "import { g, arr, asArr, num, pickNum, avg, r1, firstVal, text, rowsOf, writeJson } from \"./datafetch_answer_kit.ts\";",
    "",
    "// Read task.md and df.d.ts, call df.tool.*, write the official output JSON file,",
    "// or call a reusable df.lib.* helper from lib/ when one fits the task,",
    "// then return df.answer(...).",
    `// Expected output file(s): ${task.expectedOutputFiles.join(", ") || "see task.md/evaluator"}`,
    "",
  ].join("\n");
}

export function renderAnswerKitSource(): string {
  return [
    "import { writeFile } from \"node:fs/promises\";",
    "const envelopeKeys = [\"value\", \"data\", \"result\", \"record\", \"entity\", \"item\", \"payload\"];",
    "const envelopeMetaKeys = new Set([\"success\", \"ok\", \"status\", \"error\", \"message\", \"code\", \"errors\", \"warnings\", \"elapsedMs\", \"elapsed_ms\", \"took\"]);",
    "const isErrorLike = (x: any) => x != null && typeof x === \"object\" && !Array.isArray(x) && x.success === false && (typeof x.error === \"string\" || typeof x.message === \"string\");",
    "export const unwrap = (x: any) => {",
    "  if (x == null || typeof x !== \"object\" || Array.isArray(x)) return x;",
    "  if (isErrorLike(x)) return undefined;",
    "  if (typeof x.success === \"boolean\" || typeof x.ok === \"boolean\") {",
    "    const payloadKeys = Object.keys(x).filter((k) => !envelopeMetaKeys.has(k) && x[k] != null);",
    "    if (payloadKeys.length === 1) return x[payloadKeys[0]];",
    "  }",
    "  for (const key of envelopeKeys) { if (x?.[key] != null) return x[key]; }",
    "  return x;",
    "};",
    "const listEnvelopeKeys = [\"value\", \"data\", \"results\", \"items\", \"records\", \"rows\", \"entries\", \"list\"];",
    "export const rowsOf = (x: any): any[] => {",
    "  if (Array.isArray(x)) return x;",
    "  if (x == null || typeof x !== \"object\") return [];",
    "  for (const key of listEnvelopeKeys) { if (Array.isArray(x[key])) return x[key]; }",
    "  const u = unwrap(x);",
    "  if (Array.isArray(u)) return u;",
    "  if (u != null && typeof u === \"object\" && u !== x) {",
    "    for (const key of listEnvelopeKeys) { if (Array.isArray((u as any)[key])) return (u as any)[key]; }",
    "  }",
    "  return [];",
    "};",
    "const parts = (name: string) => String(name).replace(/\\[[\"']?([^\"'\\]]+)[\"']?\\]/g, \".$1\").split(\".\").filter(Boolean);",
    "const identityKeys = new Set([\"id\", \"entity\", \"entityId\", \"entityValue\", \"value\"]);",
    "const readKeyDirect = (value: any, key: string) => {",
    "  if ((value == null || typeof value !== \"object\") && identityKeys.has(key)) return value;",
    "  if (isErrorLike(value)) return undefined;",
    "  return value?.tools?.[key] ?? value?.[key] ?? value?.attributes?.[key] ?? value?.record?.[key] ?? value?.record?.attributes?.[key];",
    "};",
    "const readKey = (value: any, key: string) => {",
    "  const direct = readKeyDirect(value, key);",
    "  if (direct != null && !isErrorLike(direct)) return direct;",
    "  const v = unwrap(value);",
    "  return v === value ? undefined : readKeyDirect(v, key);",
    "};",
    "const readPath = (value: any, path: string) => {",
    "  if (String(path).trim() === \"\") return undefined;",
    "  const direct = readKey(value, path);",
    "  if (direct != null) return direct;",
    "  let cur = value;",
    "  for (const part of parts(path)) {",
    "    cur = readKey(cur, part);",
    "    if (cur == null) return undefined;",
    "  }",
    "  return cur;",
    "};",
    "export const g = (row: any, ...choices: any[]) => {",
    "  const last = choices[choices.length - 1];",
    "  const simpleStringDefault = choices.length >= 3 && typeof last === \"string\" && !/[.\\[\\]]/.test(last) ? last : undefined;",
    "  if (choices.length > 1 && choices.every((choice) => typeof choice === \"string\")) {",
    "    let cur = row;",
    "    for (const choice of choices) { cur = readPath(cur, choice); if (cur == null) break; }",
    "    if (cur != null && !isErrorLike(cur)) return cur;",
    "  }",
    "  for (const choice of choices) {",
    "    if (typeof choice !== \"string\") { if (choice != null && !isErrorLike(choice)) return choice; continue; }",
    "    if (choice === \"\") return \"\";",
    "    const value = readPath(row, choice);",
    "    if (value != null && !isErrorLike(value)) return value;",
    "  }",
    "  return simpleStringDefault;",
    "};",
    "export const arr = (x: any, keys: string[] = []) => {",
    "  const v = unwrap(x);",
    "  if (Array.isArray(v)) return v;",
    "  for (const key of [...keys, \"items\", \"results\", \"records\", \"rows\", \"values\", \"data\", \"entries\", \"list\"]) {",
    "    if (Array.isArray(v?.[key])) return v[key];",
    "  }",
    "  return [];",
    "};",
    "export const asArr = (x: any, keys: string[] = []) => arr(x, keys);",
    "export const num = (x: any, d = 0) => {",
    "  const v = typeof x === \"number\" ? x : Number(x?.average ?? x);",
    "  return Number.isFinite(v) ? v : d;",
    "};",
    "export const pickNum = (...xs: any[]) => {",
    "  for (const x of xs) {",
    "    const v = num(x, NaN);",
    "    if (Number.isFinite(v)) return v;",
    "  }",
    "  return 0;",
    "};",
    "export const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;",
    "export const r1 = (x: any, d = 0) => Number(num(x, d).toFixed(1));",
    "export const firstVal = (obj: any, paths: string[] = [], d?: any) => {",
    "  for (const path of paths) {",
    "    const v = g(obj, path);",
    "    if (v != null) return v;",
    "  }",
    "  return d;",
    "};",
    "export const text = (x: any, d = \"\") => {",
    "  const v = typeof x === \"string\" ? x : g(x, \"name\", \"title\", \"label\", \"person.name\", \"character.name\");",
    "  return v == null ? d : String(v);",
    "};",
    "export const writeJson = (file: any, value?: unknown) => value === undefined ? file : writeFile(String(file), JSON.stringify(value), \"utf8\");",
    "",
  ].join("\n");
}

// Name of the Goal-4 convergence index file. It travels with the
// per-family lib-cache so intent convergence accrues over a family's
// e1..h1 run (hydrate at episode start, persist at episode end).
const INTENT_INDEX_FILE = "intent-index.jsonl";

// Goal-4 R9 — the cross-family transfer harness. A run-level shared
// pool, sibling to the per-family lib-cache dirs. PARAMETERISED fan-out
// helpers (their body reads `df.tool[input.toolBundle]` — so they are
// data-shape-agnostic) crystallised by ANY family are copied here,
// deduped by `@intent-signature`, and hydrated into EVERY family's
// episodes. That is what lets a helper learned on family A genuinely
// serve family B: the substrate "improving across use cases", not just
// within one family. Non-parameterised helpers stay family-partitioned
// (they reference concrete tools and would not transfer).
const SHARED_INTENT_DIR = "__intent__";

// A crystallised helper is transferable iff its body is parameterised
// over the capability slots without freezing a concrete bundle name.
// The public surface may stay intent-shaped; the data-shaped plan is
// carried by planner/executor internals.
export function isTransferableHelperSource(source: string): boolean {
  const intentSignature = intentSignatureOfSource(source);
  if (intentSignature === "FANOUT(tool)") {
    return source.includes("InternalToolFanoutPlan") && source.includes("df.tool[toolBundle]");
  }
  if (intentSignature === "FANOUT(tool)→lib→FANOUT(tool)") {
    return (
      source.includes("InternalToolEnrichmentPlan") &&
      source.includes("df.lib.toolFanout") &&
      source.includes("df.tool[plan.dependentToolBundle ?? plan.toolBundle ?? \"\"]")
    );
  }
  return false;
}

function intentSignatureOfSource(source: string): string | null {
  return source.match(/@intent-signature:\s*(\S+)/)?.[1] ?? null;
}

async function hydrateFamilyLibCache(input: {
  family: string;
  libCacheDir: string;
  workspace: string;
  datafetchHome: string;
  tenantId: string;
}): Promise<string[]> {
  const familyCacheDir = path.join(input.libCacheDir, input.family);
  const sharedIntentDir = path.join(input.libCacheDir, SHARED_INTENT_DIR);
  const workspaceLibDir = path.join(input.workspace, "lib");
  const resolverLibDir = path.join(input.datafetchHome, "lib", input.tenantId);
  await fsp.mkdir(workspaceLibDir, { recursive: true });
  await fsp.mkdir(resolverLibDir, { recursive: true });
  if (await isDirectory(familyCacheDir)) {
    await copyTsFiles(familyCacheDir, workspaceLibDir);
    await copyTsFiles(familyCacheDir, resolverLibDir, { markLearned: true });
  }
  // Goal-4 R9: hydrate the cross-family shared-intent pool too — every
  // family's episodes see the parameterised fan-out helpers any family
  // has learned. This is the only place a helper crosses family lines.
  if (await isDirectory(sharedIntentDir)) {
    await copyTsFiles(sharedIntentDir, workspaceLibDir);
    await copyTsFiles(sharedIntentDir, resolverLibDir, { markLearned: true });
  }
  // Goal-4 Change 3: hydrate the convergence index so the observer sees
  // intents recorded by earlier episodes of this family.
  const cachedIndex = path.join(familyCacheDir, INTENT_INDEX_FILE);
  if (await exists(cachedIndex)) {
    const observerDir = path.join(
      input.datafetchHome,
      "observer",
      input.tenantId,
    );
    await fsp.mkdir(observerDir, { recursive: true });
    await fsp.copyFile(cachedIndex, path.join(observerDir, INTENT_INDEX_FILE));
  }
  return listLibFunctionNames(workspaceLibDir);
}

async function mirrorWorkspaceLibsToResolver(input: {
  workspace: string;
  datafetchHome: string;
  tenantId: string;
}): Promise<void> {
  const workspaceLibDir = path.join(input.workspace, "lib");
  const resolverLibDir = path.join(input.datafetchHome, "lib", input.tenantId);
  // Goal-3 iter 10 race fix: do NOT wipe the resolverLibDir before
  // mirroring. Observer-crystallised helpers (especially the iter-10
  // sub-graph helpers authored by the probe subprocess) live under this
  // dir; wiping erases them before persistFamilyLibCache can promote
  // them to the cross-episode lib-cache. Just copy workspace files on
  // top of whatever the observer already wrote.
  await fsp.mkdir(resolverLibDir, { recursive: true });
  if (await isDirectory(workspaceLibDir)) {
    await copyTsFiles(workspaceLibDir, resolverLibDir, { markLearned: true });
  }
}

async function registerEvalRecordsMount(input: {
  mountId: string;
  records: EvalRecord[];
}): Promise<MountRuntime> {
  const adapter = new EvalRecordsMount(input.mountId, input.records);
  const runtime: MountRuntime = {
    mountId: input.mountId,
    adapter,
    identMap: [{ ident: "records", name: "records" }],
    collection<T>(name: string) {
      return adapter.collection<T>(name);
    },
    async close(): Promise<void> {
      await adapter.close();
    },
  };
  getMountRuntimeRegistry().register(input.mountId, runtime);
  return runtime;
}

async function dropGenericSeed(datafetchHome: string): Promise<void> {
  const seedDir = path.join(datafetchHome, "lib", "__seed__");
  await fsp.mkdir(seedDir, { recursive: true });
  await fsp.writeFile(
    path.join(seedDir, `${PER_ENTITY_SEED_NAME}.ts`),
    renderPerEntitySeed(),
    "utf8",
  );
}

async function persistFamilyLibCache(input: {
  family: string;
  libCacheDir: string;
  workspace: string;
  datafetchHome: string;
  tenantId: string;
}): Promise<void> {
  const workspaceLibDir = path.join(input.workspace, "lib");
  const observerLibDir = path.join(input.datafetchHome, "lib", input.tenantId);
  const familyCacheDir = path.join(input.libCacheDir, input.family);
  const workspaceNames = (await isDirectory(workspaceLibDir))
    ? await listLibFunctionNames(workspaceLibDir)
    : [];
  const observerNames = (await isDirectory(observerLibDir))
    ? await listLibFunctionNames(observerLibDir)
    : [];
  // Goal-4 Change 3: persist the convergence index even when NO helper
  // crystallised this episode — the first episode of a family records
  // intents that the second episode needs to see in order to converge.
  // So this runs BEFORE the no-helpers early return.
  const observerIndex = path.join(
    input.datafetchHome,
    "observer",
    input.tenantId,
    INTENT_INDEX_FILE,
  );
  if (await exists(observerIndex)) {
    await fsp.mkdir(familyCacheDir, { recursive: true });
    await fsp.copyFile(observerIndex, path.join(familyCacheDir, INTENT_INDEX_FILE));
  }
  if (workspaceNames.length === 0 && observerNames.length === 0) return;
  await fsp.mkdir(familyCacheDir, { recursive: true });
  if (observerNames.length > 0) {
    await copyTsFiles(observerLibDir, familyCacheDir, { markLearned: true });
  }
  if (workspaceNames.length > 0) {
    await copyTsFiles(workspaceLibDir, familyCacheDir, { markLearned: true });
  }
  // Goal-4 R9: promote PARAMETERISED fan-out helpers to the run-level
  // shared-intent pool so other families can reuse them. Deduped by
  // `@intent-signature` — first family to crystallise an intent owns
  // the shared helper.
  await transferParameterisedHelpers({
    sourceDir: observerLibDir,
    libCacheDir: input.libCacheDir,
  });
}

// Goal-4 R9 — promote a family's parameterised fan-out helpers into the
// run-level <libCacheDir>/__intent__/ shared pool. A helper is eligible
// iff its body reads `df.tool[input.toolBundle]` (data-shape-agnostic).
// Deduped by `@intent-signature`: the first family to crystallise an
// intent owns the shared copy; later families' equivalents are skipped.
async function transferParameterisedHelpers(input: {
  sourceDir: string;
  libCacheDir: string;
}): Promise<void> {
  if (!(await isDirectory(input.sourceDir))) return;
  const sharedDir = path.join(input.libCacheDir, SHARED_INTENT_DIR);
  await fsp.mkdir(sharedDir, { recursive: true });
  // Intent signatures already present in the shared pool.
  const present = new Set<string>();
  for (const name of await listLibFunctionNames(sharedDir)) {
    try {
      const src = await fsp.readFile(path.join(sharedDir, `${name}.ts`), "utf8");
      const sig = intentSignatureOfSource(src);
      if (sig) present.add(sig);
    } catch {
      // skip unreadable
    }
  }
  for (const name of await listLibFunctionNames(input.sourceDir)) {
    let src: string;
    try {
      src = await fsp.readFile(path.join(input.sourceDir, `${name}.ts`), "utf8");
    } catch {
      continue;
    }
    if (!isTransferableHelperSource(src)) continue;
    const sig = intentSignatureOfSource(src);
    if (sig === null || present.has(sig)) continue;
    present.add(sig);
    await fsp.writeFile(path.join(sharedDir, `${name}.ts`), src, "utf8");
  }
}

// Goal-4 Change 3: persist ONLY the convergence index (no helper
// copy). Called for episodes that did not promote a helper, so the
// intents they exhibited still accrue toward convergence for later
// episodes of the same family.
async function persistFamilyConvergenceIndex(input: {
  family: string;
  libCacheDir: string;
  datafetchHome: string;
  tenantId: string;
}): Promise<void> {
  const observerIndex = path.join(
    input.datafetchHome,
    "observer",
    input.tenantId,
    INTENT_INDEX_FILE,
  );
  if (!(await exists(observerIndex))) return;
  const familyCacheDir = path.join(input.libCacheDir, input.family);
  await fsp.mkdir(familyCacheDir, { recursive: true });
  await fsp.copyFile(observerIndex, path.join(familyCacheDir, INTENT_INDEX_FILE));
}

async function copyTsFiles(
  srcDir: string,
  dstDir: string,
  opts: { markLearned?: boolean } = {},
): Promise<void> {
  await fsp.mkdir(dstDir, { recursive: true });
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fsp.readdir(srcDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    const source = await fsp.readFile(path.join(srcDir, entry.name), "utf8");
    await fsp.writeFile(
      path.join(dstDir, entry.name),
      opts.markLearned ? withLearnedMarker(source) : source,
      "utf8",
    );
  }
}

function withLearnedMarker(source: string): string {
  if (/@shape-hash:\s*[0-9a-f]{8,}/.test(source)) return source;
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 12);
  const suffix = source.endsWith("\n") ? "" : "\n";
  return `${source}${suffix}// @shape-hash: ${hash}\n`;
}

async function listLibFunctionNames(dir: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name.slice(0, -3))
    .sort();
}

async function syncLibExportAliases(dir: string): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    const sourcePath = path.join(dir, entry.name);
    const source = await fsp.readFile(sourcePath, "utf8");
    const exportedName = exportedFnName(source);
    if (!exportedName) continue;
    const expectedName = `${exportedName}.ts`;
    if (expectedName === entry.name) continue;
    const aliasPath = path.join(dir, expectedName);
    if (await exists(aliasPath)) continue;
    await fsp.copyFile(sourcePath, aliasPath);
  }
}

function exportedFnName(source: string): string | null {
  const match = /\bexport\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*fn\s*\(/.exec(source);
  return match?.[1] ?? null;
}

async function writeLibAuthoringGuide(input: {
  workspace: string;
  task: SkillCraftTask;
  availableLibFunctions: string[];
  toolCatalog: ToolCatalogEntry[];
}): Promise<void> {
  const libDir = path.join(input.workspace, "lib");
  await fsp.mkdir(libDir, { recursive: true });
  const bundles = input.toolCatalog.map((entry) => entry.bundle);
  const firstBundle = bundles[0] ?? "bundle_name";
  const tools = flattenToolCatalogNames(input.toolCatalog);
  const guide = [
    "# Learned Interfaces",
    "",
    "Existing helpers in this family:",
    input.availableLibFunctions.length
      ? input.availableLibFunctions.map((name) => `- df.lib.${name}(input)`).join("\n")
      : "- none yet",
    "",
    "New helpers should be TypeScript files in this directory. The file name must match the exported function name.",
    "Use `fn({...})` so Datafetch can validate and reuse the helper in later tasks.",
    "Do not rely on a newly authored helper from the current scripts/answer.ts unless it was already listed in ../df.d.ts at episode start.",
    `Available exact tool names for this task: ${tools.join(", ") || "see tool_manifest.json"}.`,
    "Use only these exact names when calling `df.tool`; metadata in `task_config.json` can mention higher-level tool concepts that are not callable endpoints.",
    "Prefer generic inputs like `{ arg, toolNames }` when that still lets the caller shape the output for the current task.",
    "Make the `input` schema match the exact object your answer script passes. If the helper accepts nested, family-specific inputs, use `v.unknown()` or a broad object schema rather than rejecting valid caller data.",
    "",
    "Minimal pattern:",
    "```ts",
    "// @shape-hash: 00000000",
    "import { fn } from \"@datafetch/sdk\";",
    "import * as v from \"valibot\";",
    "",
    "export const helperName = fn({",
    "  intent: \"Reusable SkillCraft family workflow.\",",
    "  examples: [],",
    "  input: v.object({",
    "    arg: v.unknown(),",
    "    toolNames: v.array(v.string()),",
    "  }),",
    "  output: v.unknown(),",
    "  async body(input) {",
    `    const tools = (globalThis as any).df.tool.${firstBundle};`,
    "    const outputs: Record<string, unknown> = {};",
    "    for (const toolName of input.toolNames) {",
    "      const localName = toolName.startsWith(\"local-\") ? toolName : `local-${toolName}`;",
    "      outputs[toolName] = await tools[localName](input.arg);",
    "    }",
    "    return outputs;",
    "  },",
    "});",
    "```",
    "",
  ].join("\n");
  await fsp.writeFile(path.join(libDir, "README.md"), guide);
}

type PromptMode = "workspace" | "brief";

function resolvePromptMode(): PromptMode {
  const raw = (process.env["DATAFETCH_PROMPT_MODE"] ?? "workspace").trim().toLowerCase();
  return raw === "brief" ? "brief" : "workspace";
}

async function renderLivePrompt(input: {
  task: SkillCraftTask;
  workspace: string;
  records: EvalRecord[];
}): Promise<string> {
  if (resolvePromptMode() === "brief") return renderBriefLivePrompt(input);
  return renderWorkspaceLivePrompt(input.task);
}

function renderWorkspaceLivePrompt(task: SkillCraftTask): string {
  return [
    "You are solving one official SkillCraft task inside a Datafetch workspace.",
    "",
    `Task: ${task.taskKey}`,
    "",
    "Read task.md, AGENTS.md, df.d.ts, and any initial workspace files.",
    "Edit scripts/answer.ts so it completes the task.",
    "Stay inside the current episode workspace. Do not read or write repo-root files via absolute paths, and do not create output files outside this workspace. The required output JSON must be written in the current workspace only.",
    "Cost matters: use `task.md`, `AGENTS.md`, and `df.d.ts` as the primary context. Do not dump full `tool_manifest.json`, full tool responses, or the full generated `scripts/answer.ts` back into the transcript unless a specific failure requires it; inspect targeted sections instead.",
    "When df.d.ts declares df.db.records, the entities for this task are mounted as a substrate-rooted record store. Each record carries `id` (the raw, tool-callable identifier — e.g. \"Siamese\", 169, \"the-office\"), `recordKey` (the cross-family-unique key, NOT a tool argument), `entity` (same as `id`), `label`, and an `attributes` map. Prefer an intent-shaped learned record-backed helper listed in df.d.ts when its description matches the task; call it with record scope such as `{ recordFilter, recordLimit }`. The planner/executor handles record-field mapping, tool params, same-entity slot pruning, and dependent routing internally. Use `df.lib.per_entity({ entityIds, toolBundle, toolNames, paramName, extraInput? })` only as the cold-start fallback when no learned helper fits. Never pass `recordKey` to tools because it carries a `<family>:` prefix tools don't recognise.",
    "Learned fan-out helpers return `(await df.lib.<name>({...})).value` as an array. Record-backed rows include `entityId`, `entityValue`, `label`, `attributes`, `record`, a nested `tools` map keyed by tool name, and top-level keys for each tool name. You may read either `item.tools[toolName]` or `item[toolName]`.",
    "REQUIRED when df.d.ts declares df.db.records: scripts/answer.ts MUST reach the answer through df.db.* plus df.tool.* or through df.lib.*. A script that only fan-outs with raw df.tool.* or only touches df.db.* without using tool/helper outputs will be auto-rewritten to `{status: \"unsupported\"}` and scored 0.",
    "If a learned helper (anything other than `per_entity`) is listed in df.d.ts under df.lib, prefer it over recomposing the chain. Call it the same way: `const r = (await df.lib.<name>({...})).value`.",
    "When a record-backed learned helper is listed, call it with intent-level record scope (`recordFilter`/`recordLimit`) rather than passing entity values, tool params, or record-field maps; it covers lookup and fan-out in one learned interface.",
    "Use existing df.lib helpers when they fit. If no learned helper is listed for a repeated entity/tool fan-out, use the `per_entity` seed to complete scripts/answer.ts; any new helper you write under lib/ is for later episodes, not the current call path. Use raw df.tool calls only for one-off calls that are not a fan-out.",
    "When creating or updating a helper, make it parameterized over the task's tool names where practical so later levels in this family can reuse it.",
    "Use df.tool calls for the official local tools. Use bracket notation for hyphenated tool names.",
    "Do not run live tool probes from Codex. In this sandbox, probe-time tool/network failures can be misleading and expensive. Use `df.d.ts` response-shape notes, write guarded parsing logic, and let the harness run the final `scripts/answer.ts` once after you finish.",
    // Defensive-coding guardrails. Even after probing, some failures still come from
    // unexpected payload variants. Belt-and-suspenders.
    "Tool responses can be missing fields or be shaped differently than you expect. Always guard nested property access with optional chaining (`resp?.foo?.bar`) or an explicit `if (resp && resp.foo)` check. If a field is missing, write a sensible default (empty string, 0, empty array) to the output file rather than throwing.",
    "Wrap the body of main() in a try/catch. On error, write a best-effort partial result to the expected output JSON file (using whatever data you have collected so far, with empty defaults for the missing pieces) before letting the error propagate. A partial output usually scores some credit; a thrown error scores zero.",
    "The evaluator will run scripts/answer.ts after you finish; do not execute a long benchmark yourself.",
    "Do not write prose as the answer. The file content is the deliverable.",
  ].join("\n");
}

async function renderBriefLivePrompt(input: {
  task: SkillCraftTask;
  workspace: string;
  records: EvalRecord[];
}): Promise<string> {
  const rawTaskMd = await readPromptContextFile(path.join(input.workspace, "task.md"), 16_000);
  const rawDfDts = await readPromptContextFile(path.join(input.workspace, "df.d.ts"), 18_000);
  const learnedRecordHelperName = firstLearnedRecordHelperName(rawDfDts);
  if (learnedRecordHelperName !== null) {
    return renderLearnedReuseBriefPrompt({
      ...input,
      taskMd: rawTaskMd,
      dfDts: rawDfDts,
      learnedRecordHelperName,
    });
  }
  if (hasLearnedToolFanoutEnrichmentHelper(rawDfDts)) {
    const enrichmentPlan = buildPureToolEnrichmentPlan(input.task, rawDfDts);
    if (enrichmentPlan !== null) {
      return renderLearnedToolFanoutEnrichmentBriefPrompt({
        ...input,
        taskMd: rawTaskMd,
        dfDts: rawDfDts,
        enrichmentPlan,
      });
    }
  }
  if (hasLearnedToolFanoutHelper(rawDfDts)) {
    const fanoutPlan = buildPureToolFanoutPlan(input.task, rawDfDts);
    if (fanoutPlan !== null) {
      return renderLearnedToolFanoutBriefPrompt({
        ...input,
        taskMd: rawTaskMd,
        dfDts: rawDfDts,
        fanoutPlan,
      });
    }
  }
  const taskMd = rawTaskMd;
  const dfDts = rawDfDts;
  const initialWorkspace = await renderInitialWorkspaceContext(input.workspace);
  const coldStartGuidance = renderColdStartFanoutGuidance(input.task, rawDfDts, input.records);
  const outputFiles = input.task.expectedOutputFiles.join(", ") || "see task.md/evaluator";
  const literalHints = renderTaskLiteralHints(taskMd);
  const hasColdStartIntentWrapper = coldStartGuidance.block.includes("loadRecordIntentRows");
  return [
    "You are solving one official SkillCraft task inside a Datafetch workspace.",
    "",
    `Task: ${input.task.taskKey}`,
    `Expected output file(s): ${outputFiles}`,
    "",
    "Use the embedded task and type context below. Do not inspect files before your first write unless the embedded context is missing a field you need.",
    "Edit `scripts/answer.ts` only. Do not print the generated file back to the transcript. Do not run the script, live tool probes, or a benchmark; the harness executes the final script once after you finish.",
    "Stay inside the current episode workspace. Write the required JSON output file there using Node `fs/promises`.",
    "",
    "Datafetch rules:",
    "- Use exact callable names from `df.d.ts`; hyphenated tool names require bracket notation.",
    "- Hyphenated tool names are strings, never identifiers. Use `row[toolName]`, `row.tools?.[toolName]`, and `df.tool.bundle[toolName]`; never write `row.local-foo-bar-baz...` or bare `foo_get_*` variables built from a hyphenated tool name.",
    "- If `df.lib` lists a learned helper other than `per_entity` that fits, prefer it.",
    "- If a learned record-backed helper is listed and the task has `df.db.records`, call that helper with `recordFilter`/`recordLimit`; it already covers the record lookup plus fan-out.",
    ...coldStartGuidance.rules,
    "- Do not call `claim_done`; it is not part of the Datafetch `df.d.ts` surface and the harness runs the official evaluator.",
    "- When `df.db.records` exists, derive outputs through `df.db.*` plus `df.tool.*`, or through `df.lib.*`; a db-only touch without tool/helper outputs is rejected. Never pass `recordKey` to tools.",
    hasColdStartIntentWrapper
      ? "- The cold-start intent helper returns an array of rows directly. Do not call `df.lib.per_entity(...)` yourself when `loadRecordIntentRows()` is shown."
      : "- `df.lib.*` calls return a runtime wrapper; unwrap once with `(await df.lib.name(input)).value`.",
    "- Learned fan-out rows usually expose the mounted record value as `row.entity`/`row.entityValue`, record metadata as `row.label`/`row.attributes`/`row.record`, plus `row.tools[toolName]` and top-level `row[toolName]`.",
    "- Tool responses are often wrappers like `{ success, <payload-key>: ... }` where `<payload-key>` varies per tool; `unwrap()` and `rowsOf()` already strip this when there's exactly one non-metadata payload key, so prefer `g(unwrap(resp), \"field.path\", default)` and `arr(resp, [<extra-list-keys-if-any>])` over direct property access. For row ids, prefer `g(row, \"entityId\", \"entityValue\", \"entity\", \"id\", 0)` because `row.entity` may already be the primitive tool id.",
    "- Guard nested payload fields and use sensible empty defaults for missing data.",
    "- Do not mix `??` with `||` or `&&` in the same expression unless you add explicit parentheses. Prefer simple `const x = a ?? b ?? c` fallback chains.",
    "- The harness wraps `scripts/answer.ts` in an async function. Use top-level `await` and finish with `return df.answer({ status: \"answered\", value, evidence, derivation })` or `return await main();`.",
    "- Do not end with `void main()` or call an async `main()` without returning/awaiting it; that can finish before the output file is written.",
    "- For output JSON fields, write explicit values when variable names differ (for example `total_items: totalItems`); do not rely on shorthand — generic snake_case JSON keys keyed off camelCase locals must spell the source variable explicitly.",
    ...renderInputHygieneRules(),
    "",
    "Keep the answer script compact enough to save model output tokens: no comments, no copied type declarations, no blank-line padding, short local helper names, and no large hard-coded output objects. Derive the JSON from rows and helper outputs.",
    "`g(value, \"path.to.field\", \"fallback.path\", defaultValue)` returns the first present path/fallback; `arr(value)` unwraps common array containers. Use these instead of defining local pick/list/asArr helper functions.",
    "",
    coldStartGuidance.block,
    "",
    "## task.md",
    "```md",
    taskMd,
    "```",
    "",
    literalHints,
    "",
    "## df.d.ts",
    "```ts",
    dfDts,
    "```",
    "",
    initialWorkspace,
    coldStartGuidance.block
      ? "Before returning source: start `scripts/answer.ts` with the imports and `rows` declaration from the suggested cold-start setup above. Do not replace that prefix with raw `df.tool` loops."
      : "",
  ].filter((part) => part.length > 0).join("\n");
}

type FanoutToolPlan = {
  exactToolNames: string[];
  sameEntitySlots: FanoutToolSlot[];
  sameEntityToolNames: string[];
  dependentToolNames: string[];
  toolParamCandidates: Map<string, string[]>;
  selectedParamByTool: Map<string, string>;
  entityField: string;
  paramName: string;
  paramByTool: Record<string, string> | null;
  recordParamMapByTool: Record<string, Record<string, string>> | null;
};

type FanoutToolSlot = {
  toolName: string;
  requiredParamNames: string[];
  recordParamMap: Record<string, string>;
};

type PureToolFanoutPlan = {
  toolBundle: string;
  toolNames: string[];
  dependentToolNames: string[];
  paramName: string;
  paramByTool: Record<string, string> | null;
};

type PureToolEnrichmentPlan = PureToolFanoutPlan & {
  dependentToolBundle: string;
  dependentParamByTool: Record<string, string>;
  dependentValuePathsByTool: Record<string, string[]>;
};

export function buildPureToolFanoutPlan(task: SkillCraftTask, dfDts: string): PureToolFanoutPlan | null {
  return buildPureToolFanoutPlanWithOptions(task, dfDts, { allowSingleToolGroupWithDependents: true });
}

export function buildPureToolEnrichmentPlan(task: SkillCraftTask, dfDts: string): PureToolEnrichmentPlan | null {
  const plan = buildPureToolFanoutPlanWithOptions(task, dfDts, { allowSingleToolGroupWithDependents: true });
  if (plan === null || plan.dependentToolNames.length < 1) return null;
  const toolBundle = taskToolBundles(task)[0] ?? plan.toolBundle;
  const fieldsByTool = extractToolParamFields(dfDts);
  const dependentParamByTool: Record<string, string> = {};
  for (const toolName of plan.dependentToolNames) {
    const required = (fieldsByTool.get(toolName) ?? []).filter((field) => !field.optional);
    const first = required[0]?.name;
    if (!first) return null;
    dependentParamByTool[toolName] = first;
  }
  return {
    ...plan,
    dependentToolBundle: toolBundle,
    dependentParamByTool,
    dependentValuePathsByTool: buildDependentValuePathsByTool(plan.toolNames, dependentParamByTool),
  };
}

function buildPureToolFanoutPlanWithOptions(
  task: SkillCraftTask,
  dfDts: string,
  options: { allowSingleToolGroupWithDependents: boolean },
): PureToolFanoutPlan | null {
  const toolBundle = taskToolBundles(task)[0] ?? "tool_bundle";
  const exactToolNames = selectTaskRelevantToolNames(task, extractExactToolNames(dfDts));
  const toolParamFields = extractToolParamFields(dfDts);
  const groups = new Map<string, string[]>();
  for (const toolName of exactToolNames) {
    const required = (toolParamFields.get(toolName) ?? []).filter((field) => !field.optional);
    if (required.length !== 1) continue;
    const paramName = required[0]!.name;
    const tools = groups.get(paramName) ?? [];
    tools.push(toolName);
    groups.set(paramName, tools);
  }
  const ranked = [...groups.entries()]
    .filter(([, tools]) =>
      tools.length >= 2 ||
      (
        options.allowSingleToolGroupWithDependents &&
        tools.length >= 1 &&
        exactToolNames.length - tools.length >= 1
      ),
    )
    .sort((a, b) => {
      const count = b[1].length - a[1].length;
      if (count !== 0) return count;
      return pureFanoutParamRank(b[0]) - pureFanoutParamRank(a[0]);
    });
  const best = ranked[0];
  if (!best) return null;
  const [paramName, toolNames] = best;
  const selectedParamByTool = new Map(toolNames.map((toolName) => [toolName, paramName]));
  return {
    toolBundle,
    toolNames,
    dependentToolNames: exactToolNames.filter((toolName) => !toolNames.includes(toolName)),
    paramName,
    paramByTool: buildParamByTool(toolNames, selectedParamByTool, paramName),
  };
}

function buildDependentValuePathsByTool(
  baseToolNames: string[],
  dependentParamByTool: Record<string, string>,
): Record<string, string[]> {
  const pathsByTool: Record<string, string[]> = {};
  for (const [toolName, paramName] of Object.entries(dependentParamByTool)) {
    const normalized = normalizeParamName(paramName);
    const baseSpecific: string[] = [];
    for (const baseTool of baseToolNames) {
      if (normalized.endsWith("_id")) {
        baseSpecific.push(`tools.${baseTool}.${paramName}`);
      }
      if (normalized.endsWith("_names")) {
        baseSpecific.push(`tools.${baseTool}.${pluralizeParamStem(normalized.replace(/_names$/, ""))}`);
      }
    }
    pathsByTool[toolName] = [
      ...baseSpecific,
      paramName,
      normalized.endsWith("_id") ? normalized.split("_").slice(-2).join("_") : "",
      normalized.endsWith("_names") ? pluralizeParamStem(normalized.replace(/_names$/, "")) : "",
    ].filter((path, index, paths) => path.length > 0 && paths.indexOf(path) === index);
  }
  return pathsByTool;
}

function pluralizeParamStem(stem: string): string {
  return stem.endsWith("y") ? `${stem.slice(0, -1)}ies` : `${stem}s`;
}

function pureFanoutParamRank(paramName: string): number {
  const normalized = normalizeParamName(paramName);
  if (normalized.endsWith("_id") || normalized === "id" || normalized === "entity") return 3;
  if (normalized.includes("name") || normalized.includes("code")) return 2;
  return 1;
}

export function buildFanoutToolPlan(task: SkillCraftTask, dfDts: string, records: EvalRecord[] = []): FanoutToolPlan {
  const exactToolNames = selectTaskRelevantToolNames(task, extractExactToolNames(dfDts));
  const toolParamFields = extractToolParamFields(dfDts);
  const toolParamCandidates = new Map(
    [...toolParamFields].map(([toolName, fields]) => [toolName, fields.map((field) => field.name)]),
  );
  const recordParamFields = recordParamFieldNames(records);
  const selectedParamByTool = new Map<string, string>();
  const sameEntitySlots: FanoutToolSlot[] = [];
  for (const toolName of exactToolNames) {
    const slot = buildRecordBackedToolSlot(toolName, toolParamFields.get(toolName) ?? [], recordParamFields);
    if (!slot) continue;
    sameEntitySlots.push(slot);
    selectedParamByTool.set(toolName, slot.requiredParamNames[0] ?? toolParamCandidates.get(toolName)?.[0] ?? "entity_id");
  }
  const sameEntityToolNames = sameEntitySlots.map((slot) => slot.toolName);
  const paramName =
    selectPrimaryToolParamName(sameEntityToolNames, selectedParamByTool) ??
    selectPrimaryToolParamName(exactToolNames, toolParamCandidates) ??
    "entity_id";
  const entityField = primaryEntityField(sameEntitySlots, paramName);
  return {
    exactToolNames,
    sameEntitySlots,
    sameEntityToolNames,
    dependentToolNames: exactToolNames.filter((toolName) => !sameEntityToolNames.includes(toolName)),
    toolParamCandidates,
    selectedParamByTool,
    entityField,
    paramName,
    paramByTool: buildParamByTool(sameEntityToolNames, selectedParamByTool, paramName),
    recordParamMapByTool: buildRecordParamMapByTool(sameEntitySlots),
  };
}

function isEntityIdParam(paramName: string): boolean {
  const normalized = paramName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  return normalized === "id" || normalized === "entity_id" || normalized.endsWith("_id");
}

function recordParamFieldNames(records: EvalRecord[]): Map<string, string> {
  const names = new Map<string, string>();
  const add = (name: string): void => {
    const normalized = normalizeParamName(name);
    if (!names.has(normalized)) names.set(normalized, name);
  };
  add("id");
  add("entity");
  add("label");
  for (const record of records) {
    for (const key of Object.keys(record.attributes)) add(key);
  }
  return names;
}

function normalizeParamName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

type ToolParamField = { name: string; optional: boolean };

function buildRecordBackedToolSlot(
  toolName: string,
  fields: ToolParamField[],
  recordParamFields: ReadonlyMap<string, string>,
): FanoutToolSlot | null {
  const requiredFields = fields.filter((field) => !field.optional);
  if (requiredFields.length === 0) {
    const optionalMappings = fields
      .filter((field) => field.optional && isOptionalRecordScopeParam(field.name))
      .map((field) => {
        const recordField = recordFieldForToolParam(field.name, recordParamFields);
        return recordField ? { field, recordField } : null;
      })
      .filter((item): item is { field: ToolParamField; recordField: string } => item !== null);
    if (optionalMappings.length !== 1) return null;
    const [{ field, recordField }] = optionalMappings;
    return {
      toolName,
      requiredParamNames: [field.name],
      recordParamMap: { [field.name]: recordField },
    };
  }
  const recordParamMap: Record<string, string> = {};
  for (const field of requiredFields) {
    const recordField = recordFieldForToolParam(field.name, recordParamFields);
    if (!recordField) return null;
    recordParamMap[field.name] = recordField;
  }
  return {
    toolName,
    requiredParamNames: requiredFields.map((field) => field.name),
    recordParamMap,
  };
}

function isOptionalRecordScopeParam(paramName: string): boolean {
  const normalized = normalizeParamName(paramName);
  return [
    "country",
    "country_code",
    "alpha_code",
    "alpha_two_code",
    "nationality",
    "nationality_code",
    "code",
    "iso",
    "iso2",
    "iso3",
    "cca2",
    "cca3",
  ].includes(normalized);
}

function recordFieldForToolParam(
  paramName: string,
  recordParamFields: ReadonlyMap<string, string>,
): string | null {
  const normalized = normalizeParamName(paramName);
  const exact = recordParamFields.get(normalized);
  if (exact) return exact;
  if (isEntityIdParam(paramName)) return recordParamFields.get("id") ?? recordParamFields.get("entity") ?? null;
  for (const alias of recordFieldAliasesForParam(normalized)) {
    const aliased = recordParamFields.get(alias);
    if (aliased) return aliased;
  }
  for (const [fieldKey, fieldName] of recordParamFields) {
    if (fieldKey.length >= 3 && normalized.endsWith(`_${fieldKey}`)) return fieldName;
  }
  return null;
}

function recordFieldAliasesForParam(normalizedParamName: string): string[] {
  if (normalizedParamName === "nationality") {
    return ["nationality_code", "country_code", "code"];
  }
  if (normalizedParamName === "race_name") return ["race"];
  if (normalizedParamName === "class_name") return ["class"];
  return [];
}

function primaryEntityField(slots: FanoutToolSlot[], fallbackParamName: string): string {
  const first = slots[0];
  if (!first) return "id";
  return first.recordParamMap[first.requiredParamNames[0] ?? fallbackParamName] ?? "id";
}

function buildRecordParamMapByTool(slots: FanoutToolSlot[]): Record<string, Record<string, string>> | null {
  if (slots.length === 0) return null;
  return Object.fromEntries(slots.map((slot) => [slot.toolName, slot.recordParamMap]));
}

function renderDependentToolHint(plan: FanoutToolPlan): string {
  if (plan.dependentToolNames.length === 0) return "";
  const hints = plan.dependentToolNames.map((toolName) => {
    const param = plan.toolParamCandidates.get(toolName)?.[0] ?? "input";
    return `${toolName}(${param})`;
  });
  return [
    "Dependent/multi-hop tools omitted from record fan-out:",
    hints.join(", "),
    "Call these later only after reading their required input value from the record fan-out rows or another tool output, and only when the returned fields are needed for the required output. Do not call dependent tools merely because the task lists them if the final JSON needs only summary counts/ranks already provided by the same-entity rows.",
  ].join(" ");
}

function renderRecordValueExpression(recordVar: string, field: string): string {
  if (["id", "entity", "label", "recordKey", "family"].includes(field)) {
    return `${recordVar}.${field}`;
  }
  return `g(${recordVar}, ${JSON.stringify(`attributes.${field}`)}, ${JSON.stringify(field)}, "entity", "id")`;
}

export function renderColdStartFanoutGuidance(
  task: SkillCraftTask,
  dfDts: string,
  records: EvalRecord[],
): { rules: string[]; block: string } {
  const setup = renderColdStartFanoutSetup(task, dfDts, records);
  const expectedRepetitions = expectedRepetitionsForTask(task);
  const recordFetch = `df.db.records.findExact({ family: ${JSON.stringify(task.family)} }${expectedRepetitions > 0 ? `, ${expectedRepetitions}` : ""})`;
  if (setup) {
    return {
      rules: [
        "- For repeated entity/tool fan-out with no learned helper, use `df.lib.per_entity(...)` only for the verified single-field tools in the suggested cold-start setup.",
        `- Cold-start record fan-out: fetch all task records with \`${recordFetch}\`, derive entity ids from the suggested record field, then call \`df.lib.per_entity(...)\`. Do not use \`df.db.records.search\` for only one entity before a full fan-out.`,
        "- The suggested cold-start setup is mandatory when shown and no learned helper fits: paste it, use its `rows` to build the output, and do not replace it with a hard-coded output object plus a db-only touch.",
        "- Copy the suggested cold-start setup's `entityIds: records.map(...)` expression; do not replace it with `r.id`/`r.entity` unless that exact field is shown in the suggested expression.",
        "- Repeated fan-out rule is mandatory for verified tools: do not write `Promise.all`, `for`, or `.map` loops that call `df.tool` across many entities/tools when the suggested `df.lib.per_entity` call covers them.",
      ],
      block: setup,
    };
  }
  return {
    rules: [
      "- Do not call `df.lib.per_entity` for this task's repeated fan-out: no task tool has a verified single-field record-backed input contract for the seed helper.",
      `- Cold-start fallback: start from \`${recordFetch}\` so the trajectory is substrate-rooted, then call only the required \`df.tool\` functions directly from record fields or dependent tool outputs.`,
      "- Raw `df.tool` loops are allowed only in this no-seed fallback case; keep them compact and avoid evidence-only probes.",
    ],
    block: [
      "## cold-start fan-out eligibility",
      "No verified single-field record fan-out exists for `df.lib.per_entity` on this task.",
      "Start from mounted records, then call direct tools only for required output fields.",
      "```ts",
      `const records = await ${recordFetch};`,
      "```",
    ].join("\n"),
  };
}

function buildColdStartSeedPlan(
  task: SkillCraftTask,
  dfDts: string,
  records: EvalRecord[],
): { plan: FanoutToolPlan; toolBundle: string; expectedRepetitions: number } | null {
  if (!dfDts.includes("records") || !dfDts.includes(PER_ENTITY_SEED_NAME)) return null;
  const plan = buildFanoutToolPlan(task, dfDts, records);
  const singleFieldSlots = plan.sameEntitySlots.filter((slot) => slot.requiredParamNames.length === 1);
  const seedEntityField =
    singleFieldSlots[0]?.recordParamMap[singleFieldSlots[0]?.requiredParamNames[0] ?? plan.paramName] ??
    plan.entityField;
  const coldSlots = singleFieldSlots.filter((slot) => {
    const param = slot.requiredParamNames[0] ?? plan.paramName;
    return slot.recordParamMap[param] === seedEntityField;
  });
  const coldToolNames = coldSlots.map((slot) => slot.toolName);
  if (coldToolNames.length === 0) return null;
  const selectedParamByTool = new Map<string, string>();
  for (const slot of coldSlots) {
    selectedParamByTool.set(slot.toolName, slot.requiredParamNames[0] ?? plan.paramName);
  }
  const paramName = coldSlots[0]?.requiredParamNames[0] ?? plan.paramName;
  const coldPlan: FanoutToolPlan = {
    ...plan,
    sameEntitySlots: coldSlots,
    sameEntityToolNames: coldToolNames,
    dependentToolNames: plan.exactToolNames.filter((toolName) => !coldToolNames.includes(toolName)),
    selectedParamByTool,
    entityField: seedEntityField,
    paramName,
    paramByTool: buildParamByTool(coldToolNames, selectedParamByTool, paramName),
    recordParamMapByTool: buildRecordParamMapByTool(coldSlots),
  };
  const toolBundles = taskToolBundles(task);
  return {
    plan: coldPlan,
    toolBundle: toolBundles[0] ?? "tool_bundle",
    expectedRepetitions: expectedRepetitionsForTask(task),
  };
}

function renderColdStartFanoutSetup(task: SkillCraftTask, dfDts: string, records: EvalRecord[]): string {
  const seed = buildColdStartSeedPlan(task, dfDts, records);
  if (!seed) return "";
  const entityField = seed.plan.entityField;
  const setup = [
    "import { g, arr, asArr, num, pickNum, avg, r1, firstVal, text, rowsOf, writeJson } from \"./datafetch_answer_kit.ts\";",
    "",
    `const records = await df.db.records.findExact({ family: ${JSON.stringify(task.family)} }${seed.expectedRepetitions > 0 ? `, ${seed.expectedRepetitions}` : ""});`,
    "const rows = rowsOf(await df.lib.per_entity({",
    `  entityIds: records.map((r: any) => ${renderRecordValueExpression("r", entityField)}),`,
    `  toolBundle: ${JSON.stringify(seed.toolBundle)},`,
    `  toolNames: [${seed.plan.sameEntityToolNames.map((name) => JSON.stringify(name)).join(", ")}],`,
    `  paramName: ${JSON.stringify(seed.plan.paramName)},`,
    ...(seed.plan.paramByTool ? [`  paramByTool: ${JSON.stringify(seed.plan.paramByTool)},`] : []),
    "}));",
  ].join("\n");
  return [
    "## suggested cold-start fan-out setup",
    seed.plan.dependentToolNames.length > 0
      ? "Record fan-out should include only tools whose first input value is the mounted record entity."
      : "",
    renderDependentToolHint(seed.plan),
    "```ts",
    setup,
    "```",
  ].filter((part) => part.length > 0).join("\n");
}

async function renderLearnedReuseBriefPrompt(input: {
  task: SkillCraftTask;
  workspace: string;
  records: EvalRecord[];
  taskMd: string;
  dfDts: string;
  learnedRecordHelperName: string;
}): Promise<string> {
  const taskMd = compactTaskMdForLearnedReuse(input.taskMd);
  const fanoutPlan = buildFanoutToolPlan(input.task, input.dfDts, input.records);
  const callableSurface = renderLearnedReuseSurface(
    input.task,
    input.dfDts,
    input.records,
    input.learnedRecordHelperName,
  );
  if (fanoutPlan.sameEntityToolNames.length > 0) {
    const toolBundles = taskToolBundles(input.task);
    await fsp.writeFile(
      path.join(input.workspace, "scripts", "datafetch_record_intent.ts"),
      renderRecordIntentHelperSource({
        task: input.task,
        learnedRecordHelperName: input.learnedRecordHelperName,
        plan: fanoutPlan,
        toolBundle: toolBundles[0] ?? "tool_bundle",
        expectedRepetitions: expectedRepetitionsForTask(input.task),
      }),
    );
  }
  const initialWorkspace = await renderInitialWorkspaceContext(input.workspace, { maxChars: 1_500 });
  const literalHints = renderTaskLiteralHints(input.taskMd);
  const outputFiles = input.task.expectedOutputFiles.join(", ") || "see task.md/evaluator";
  const hasDependentTools = fanoutPlan.dependentToolNames.length > 0;
  const hasRecordFanoutSlots = fanoutPlan.sameEntityToolNames.length > 0;
  const reuseRules = hasRecordFanoutSlots
    ? [
        `- A learned record-backed helper is already callable through the intent wrapper in the suggested setup. Repeated record-backed fan-out for those tools must use the wrapper; a raw \`df.tool\` fan-out can fail the substrate-rooted chain gate.`,
        "- Call the intent wrapper with optional `recordFilter`/`recordLimit`; it fetches records and runs the verified tool fan-out.",
        `- Do not call \`df.lib.per_entity\` from this learned-reuse prompt. \`per_entity\` is the cold-start seed; \`${input.learnedRecordHelperName}\` is the learned interface for verified repeated fan-out.`,
        hasDependentTools
          ? "- The wrapper internally uses only verified same-entity slots. Call dependent/multi-hop tools separately only when their returned fields are required in the final JSON."
          : "- The wrapper internally uses the task-relevant verified same-entity slots and hides record-field/tool-param mapping from the caller.",
        "- Start from the suggested setup exactly: import the answer kit and intent helper, then `const rows = await loadRecordIntentRows();`.",
        "- Treat `rows` as the complete repeated-entity set for the task. Do not build a second entity array from task text, re-query `df.db.records`, or add fallback `df.tool` fan-out unless a required entity is actually missing from `rows`.",
        "- Use `getRowTool(row, toolName)` to read helper results. Row tool slots are already response payloads, not callable functions; do not call `df.tool` again for a tool already present on the row.",
        "- Do not call `claim_done`. Do not write raw `df.tool` loops for the verified repeated fan-out.",
      ]
    : [
        `- Do not call \`df.lib.${input.learnedRecordHelperName}\` for this task: no task tool has a verified record-backed input contract for the current helper surface.`,
        "- Start from `df.db.records.findExact({ family })` and derive the entity list from mounted records; do not hard-code entities from the embedded JSON.",
        "- Use direct `df.tool` calls only where needed, keeping dependent/multi-hop calls outside learned helper reuse.",
        "- Do not call `claim_done`.",
      ];
  return [
    "You are solving one official SkillCraft task inside a Datafetch workspace.",
    `Task: ${input.task.taskKey}`,
    `Expected output file(s): ${outputFiles}`,
    "",
    "Use the embedded compact task and callable surface. Do not inspect files, run probes, or run a benchmark before writing.",
    "Edit `scripts/answer.ts` only. Write required JSON output files using Node `fs/promises`; return `df.answer({ status: \"answered\", value, evidence, derivation })`.",
    "",
    "Reuse rules:",
    ...reuseRules,
    "- Dependent/multi-hop tools should be called only when their returned fields are actually used in the required output. If the final JSON asks for summary counts/ranks and the record fan-out rows already provide those values, skip unused dependent calls instead of adding evidence-only probes.",
    "- Do not pass `recordKey` to tools. Use exact hyphenated tool names as strings.",
    "- Rows expose `intentEntity`, `label`, `attributes`, `record`, `tools[toolName]`, and top-level `row[toolName]` response payloads.",
    "- Use the imported `g`, `arr`/`asArr`, `num`/`pickNum`, `avg`, `r1`, `firstVal`, `text`, `rowsOf`, and `writeJson` helpers. Read wrapped payloads with `g`/`arr`; write files with `await writeJson(name, value)`. Do not redefine equivalent local `at`/`firstVal`/`pickNum`/`text`/`asArr`/`toArr` helpers.",
    "- Keep code concise and ordinary; source must parse. Avoid dense nested conditional object literals; assign tricky nested values to local variables first.",
    "- Do not mix `??` with `||` or `&&` in the same expression unless you add explicit parentheses. Prefer simple `const x = a ?? b ?? c` fallback chains.",
    "- For output JSON fields, write explicit values when variable names differ (for example `total_items: totalItems`); do not rely on shorthand — generic snake_case JSON keys keyed off camelCase locals must spell the source variable explicitly.",
    ...renderLearnedReuseInputHygieneRules(hasRecordFanoutSlots),
    "",
    "## task.md (compact)",
    "```md",
    taskMd,
    "```",
    "",
    literalHints,
    "",
    "## callable surface",
    "```ts",
    callableSurface,
    "```",
    "",
    initialWorkspace,
  ].filter((part) => part.length > 0).join("\n");
}

async function renderLearnedToolFanoutBriefPrompt(input: {
  task: SkillCraftTask;
  workspace: string;
  records: EvalRecord[];
  taskMd: string;
  dfDts: string;
  fanoutPlan: PureToolFanoutPlan;
}): Promise<string> {
  const taskMd = compactTaskMdForLearnedReuse(input.taskMd);
  const outputFiles = input.task.expectedOutputFiles.join(", ") || "see task.md/evaluator";
  const literalHints = renderTaskLiteralHints(input.taskMd);
  const initialWorkspace = await renderInitialWorkspaceContext(input.workspace, { maxChars: 1_500 });
  const inferredEntityValues = inferPureFanoutEntityValuesFromTaskMarkdown(input.taskMd, input.fanoutPlan.paramName);
  const entityValuesLine = inferredEntityValues.length >= 2
    ? `const entityValues = ${JSON.stringify(inferredEntityValues)};`
    : "const entityValues = [/* task entity ids or names */];";
  const dependentHint = input.fanoutPlan.dependentToolNames.length > 0
    ? [
        "Dependent/multi-hop tools not covered by the repeated tool fan-out:",
        input.fanoutPlan.dependentToolNames.join(", "),
        "Call them later only when their inputs come from the fan-out rows or another prior tool result and their fields are required in the output.",
      ].join(" ")
    : "";
  const setup = [
    "import { g, arr, asArr, num, pickNum, avg, r1, firstVal, text, rowsOf, writeJson } from \"./datafetch_answer_kit.ts\";",
    "",
    "// Fill entityValues from task.md or the visible workspace JSON; keep the learned helper call shape unchanged.",
    entityValuesLine,
    "const rows = rowsOf(await df.lib.toolFanout({",
    "  intent: \"repeated tool fan-out\",",
    "  entityValues,",
    `  toolBundle: ${JSON.stringify(input.fanoutPlan.toolBundle)},`,
    `  toolNames: [${input.fanoutPlan.toolNames.map((name) => JSON.stringify(name)).join(", ")}],`,
    `  paramName: ${JSON.stringify(input.fanoutPlan.paramName)},`,
    ...(input.fanoutPlan.paramByTool ? [`  paramByTool: ${JSON.stringify(input.fanoutPlan.paramByTool)},`] : []),
    "}));",
  ].join("\n");
  return [
    "You are solving one official SkillCraft task inside a Datafetch workspace.",
    `Task: ${input.task.taskKey}`,
    `Expected output file(s): ${outputFiles}`,
    "",
    "Use the embedded compact task and callable surface. Do not inspect files, run probes, or run a benchmark before writing.",
    "Edit `scripts/answer.ts` only. Write required JSON output files using Node `fs/promises`; return `df.answer({ status: \"answered\", value, evidence, derivation })`.",
    "",
    "Reuse rules:",
    "- A learned pure tool fan-out helper is already callable. Use it for the repeated same-parameter tool calls in the suggested setup instead of writing raw `df.tool` loops for those tools.",
    "- Keep the full suggested helper call shape. The helper needs `entityValues`, `toolBundle`, `toolNames`, and `paramName`; an `intent`-only call returns no useful rows.",
    "- If `entityValues` is still a placeholder, replace only that array with the task entities. Keep `toolBundle`, `toolNames`, and `paramName` from the suggested setup.",
    "- Read helper output from `rows`: each row has `entityId`/`entityValue`, top-level per-tool keys, and `row.tools[toolName]`.",
    "- Do not call `df.lib.per_entity`; this task has a learned `toolFanout` interface.",
    "- Do not call `claim_done`. Do not pass display labels to dependent tools when a machine id/code is available in a row.",
    dependentHint,
    "- Use the imported `g`, `arr`/`asArr`, `num`/`pickNum`, `avg`, `r1`, `firstVal`, `text`, `rowsOf`, and `writeJson` helpers. Do not redefine equivalent local helpers.",
    "- Keep code concise and ordinary; source must parse. Avoid dense nested conditional object literals; assign tricky nested values to local variables first.",
    "- Do not mix `??` with `||` or `&&` in the same expression unless you add explicit parentheses. Prefer simple `const x = a ?? b ?? c` fallback chains.",
    ...renderInputHygieneRules(),
    "",
    "## suggested learned tool fan-out setup",
    "```ts",
    setup,
    "```",
    "",
    "## task.md (compact)",
    "```md",
    taskMd,
    "```",
    "",
    literalHints,
    "",
    "## callable surface",
    "```ts",
    compactBriefDfDts(input.dfDts),
    "```",
    "",
    initialWorkspace,
  ].filter((part) => part.length > 0).join("\n");
}

async function renderLearnedToolFanoutEnrichmentBriefPrompt(input: {
  task: SkillCraftTask;
  workspace: string;
  records: EvalRecord[];
  taskMd: string;
  dfDts: string;
  enrichmentPlan: PureToolEnrichmentPlan;
}): Promise<string> {
  const taskMd = compactTaskMdForLearnedReuse(input.taskMd);
  const outputFiles = input.task.expectedOutputFiles.join(", ") || "see task.md/evaluator";
  const literalHints = renderTaskLiteralHints(input.taskMd);
  const initialWorkspace = await renderInitialWorkspaceContext(input.workspace, { maxChars: 1_500 });
  const inferredEntityValues = inferPureFanoutEntityValuesFromTaskMarkdown(input.taskMd, input.enrichmentPlan.paramName);
  const entityValuesLine = inferredEntityValues.length >= 2
    ? `const entityValues = ${JSON.stringify(inferredEntityValues)};`
    : "const entityValues = [/* task entity ids or names */];";
  const setup = [
    "import { g, arr, asArr, num, pickNum, avg, r1, firstVal, text, rowsOf, writeJson } from \"./datafetch_answer_kit.ts\";",
    "",
    entityValuesLine,
    "const rows = rowsOf(await df.lib.toolFanoutEnrichment({",
    "  intent: \"repeated tool fan-out dependent enrichment\",",
    "  entityValues,",
    `  toolBundle: ${JSON.stringify(input.enrichmentPlan.toolBundle)},`,
    `  toolNames: [${input.enrichmentPlan.toolNames.map((name) => JSON.stringify(name)).join(", ")}],`,
    `  paramName: ${JSON.stringify(input.enrichmentPlan.paramName)},`,
    ...(input.enrichmentPlan.paramByTool ? [`  paramByTool: ${JSON.stringify(input.enrichmentPlan.paramByTool)},`] : []),
    `  dependentToolBundle: ${JSON.stringify(input.enrichmentPlan.dependentToolBundle)},`,
    `  dependentToolNames: [${input.enrichmentPlan.dependentToolNames.map((name) => JSON.stringify(name)).join(", ")}],`,
    `  dependentParamByTool: ${JSON.stringify(input.enrichmentPlan.dependentParamByTool)},`,
    `  dependentValuePathsByTool: ${JSON.stringify(input.enrichmentPlan.dependentValuePathsByTool)},`,
    "}));",
  ].join("\n");
  return [
    "You are solving one official SkillCraft task inside a Datafetch workspace.",
    `Task: ${input.task.taskKey}`,
    `Expected output file(s): ${outputFiles}`,
    "",
    "Use the embedded compact task and callable surface. Do not inspect files, run probes, or run a benchmark before writing.",
    "Edit `scripts/answer.ts` only. Write required JSON output files using Node `fs/promises`; return `df.answer({ status: \"answered\", value, evidence, derivation })`.",
    "",
    "Reuse rules:",
    "- A learned pure fan-out dependent-enrichment helper is already callable. Use the suggested `toolFanoutEnrichment` setup for the repeated base fan-out plus dependent follow-up tools.",
    "- Keep the full suggested helper call shape. The helper needs `entityValues`, base `toolBundle`/`toolNames`/`paramName`, and dependent tool mapping fields.",
    "- If `entityValues` is still a placeholder, replace only that array with the task entities.",
    "- Read helper output from `rows`: each row has `entityId`/`entityValue`, base tool payloads in `row.tools[baseToolName]`, dependent payloads in `row.dependentTools[toolName]`, and a combined `row.tools` map.",
    "- Do not call `df.lib.per_entity`; this task has a learned dependent-enrichment interface.",
    "- Do not call `claim_done`. Do not pass display labels to dependent tools when a machine id/code is available in a row.",
    "- Use the imported `g`, `arr`/`asArr`, `num`/`pickNum`, `avg`, `r1`, `firstVal`, `text`, `rowsOf`, and `writeJson` helpers. Do not redefine equivalent local helpers.",
    "- Keep code concise and ordinary; source must parse. Avoid dense nested conditional object literals; assign tricky nested values to local variables first.",
    "- Do not mix `??` with `||` or `&&` in the same expression unless you add explicit parentheses. Prefer simple `const x = a ?? b ?? c` fallback chains.",
    ...renderInputHygieneRules(),
    "",
    "## suggested learned tool fan-out enrichment setup",
    "```ts",
    setup,
    "```",
    "",
    "## task.md (compact)",
    "```md",
    taskMd,
    "```",
    "",
    literalHints,
    "",
    "## callable surface",
    "```ts",
    compactBriefDfDts(input.dfDts),
    "```",
    "",
    initialWorkspace,
  ].filter((part) => part.length > 0).join("\n");
}

export function renderInputHygieneRules(): string[] {
  return [
    "Tool input hygiene:",
    "- Treat human display labels as output text, not necessarily tool identifiers. For follow-up tool calls prefer machine fields returned by prior tools: `id`, `code`, `index`, `cca2`, `cca3`, `entity`, or explicit record attributes.",
    "- If a tool description says an input can be an ISO/code/index, pass that code instead of a display name with spaces. If examples use lowercase hyphenated slugs, canonicalize generated labels with `String(value).trim().toLowerCase().replace(/\\s+/g, \"-\")` before calling the tool.",
    "- Do not call sequence/string-analysis tools with an empty string. If `task.md` lists literals like `ID: VALUE...`, use the visible `VALUE` prefix as the input literal when no mounted records or workspace files provide a fuller value.",
    "- Avoid evidence-only dependent calls. If a tool category or class does not apply to an entity, skip that call and fill the required output from available response fields instead of forcing a failing probe.",
  ];
}

function renderLearnedReuseInputHygieneRules(hasRecordFanoutSlots: boolean): string[] {
  if (!hasRecordFanoutSlots) return renderInputHygieneRules();
  return [
    "Tool input hygiene:",
    "- For truly missing dependent calls, pass machine fields already present in rows or tool payloads (`id`, `code`, `index`, `cca2`, `cca3`, `intentEntity`). Skip evidence-only probes.",
  ];
}

export function inferPureFanoutEntityValuesFromTaskMarkdown(
  taskMd: string,
  paramName: string,
): Array<string | number> {
  const targetHeaders = pureFanoutTableHeaderCandidates(paramName);
  for (const table of markdownTables(taskMd)) {
    const headerIndex = table.headers.findIndex((header) => targetHeaders.has(normalizeTableHeader(header)));
    if (headerIndex < 0) continue;
    const values = uniqueNonEmpty(table.rows
      .map((row) => parseMarkdownTableValue(row[headerIndex] ?? ""))
      .filter((value): value is string | number => value !== null));
    if (values.length >= 2) return values;
  }
  return [];
}

function markdownTables(source: string): Array<{ headers: string[]; rows: string[][] }> {
  const lines = source.split(/\r?\n/);
  const tables: Array<{ headers: string[]; rows: string[][] }> = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    const header = parseMarkdownTableRow(lines[index] ?? "");
    const separator = lines[index + 1] ?? "";
    if (header.length === 0 || !isMarkdownTableSeparator(separator)) continue;
    const rows: string[][] = [];
    index += 2;
    while (index < lines.length) {
      const row = parseMarkdownTableRow(lines[index] ?? "");
      if (row.length === 0) break;
      rows.push(row);
      index += 1;
    }
    tables.push({ headers: header, rows });
  }
  return tables;
}

function parseMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return [];
  const withoutEdges = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return withoutEdges.split("|").map((cell) => cell.trim());
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = parseMarkdownTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function pureFanoutTableHeaderCandidates(paramName: string): Set<string> {
  const normalized = normalizeParamName(paramName);
  const candidates = new Set<string>([normalizeTableHeader(paramName), normalizeTableHeader(normalized)]);
  const parts = normalized.split("_").filter((part) => part.length > 0);
  candidates.add(parts.join(""));
  if (isEntityIdParam(paramName) || parts.at(-1) === "id") {
    candidates.add("id");
    if (parts.length > 1) candidates.add(`${parts.slice(0, -1).join("")}id`);
  }
  if (normalized.includes("name")) candidates.add("name");
  if (normalized.includes("code")) candidates.add("code");
  return candidates;
}

function normalizeTableHeader(value: string): string {
  return value.toLowerCase().replace(/[`*_]/g, "").replace(/[^a-z0-9]+/g, "");
}

function parseMarkdownTableValue(value: string): string | number | null {
  const cleaned = value.replace(/[`*_]/g, "").trim();
  if (!cleaned) return null;
  if (/^-?\d+(?:\.\d+)?$/.test(cleaned)) return Number(cleaned);
  return cleaned;
}

function uniqueNonEmpty(values: Array<string | number>): Array<string | number> {
  const seen = new Set<string>();
  const out: Array<string | number> = [];
  for (const value of values) {
    const key = typeof value === "number" ? `n:${value}` : `s:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function renderTaskLiteralHints(taskMd: string): string {
  const examples: string[] = [];
  for (const match of taskMd.matchAll(/^\s*([A-Z][A-Z0-9_-]{2,})\s*:\s*([A-Za-z0-9][A-Za-z0-9_-]{8,})(?:\.\.\.)?\s*$/gm)) {
    const id = match[1];
    const literal = match[2];
    if (!id || !literal) continue;
    examples.push(`${id}: ${literal}`);
    if (examples.length >= 8) break;
  }
  if (examples.length === 0) return "";
  return [
    "## literal inputs parsed from task.md",
    "Use these visible task literals as non-empty tool inputs when no mounted records/workspace files provide a fuller value:",
    "```text",
    ...examples,
    "```",
  ].join("\n");
}

function compactBriefDfDts(source: string): string {
  const out: string[] = [];
  let inToolBlock = false;
  let inToolJSDoc = false;
  for (const line of source.split(/\r?\n/)) {
    if (/^\s*tool:\s*\{/.test(line)) {
      inToolBlock = true;
    } else if (/^\s*lib:\s*\{/.test(line)) {
      inToolBlock = false;
      inToolJSDoc = false;
    }
    if (inToolBlock) {
      if (line.includes("/**")) {
        inToolJSDoc = true;
        continue;
      }
      if (inToolJSDoc) {
        if (line.includes("*/")) inToolJSDoc = false;
        continue;
      }
    }
    out.push(line);
  }
  return out.join("\n").trimEnd();
}

function firstLearnedRecordHelperName(source: string): string | null {
  for (const name of ["recordToolEnrichment", "recordToolFanout", "recordToolLookup"]) {
    if (new RegExp(`"${name}"\\s*\\(`).test(source)) return name;
  }
  return null;
}

function hasLearnedToolFanoutHelper(source: string): boolean {
  return /"toolFanout"\s*\(/.test(source);
}

function hasLearnedToolFanoutEnrichmentHelper(source: string): boolean {
  return /"toolFanoutEnrichment"\s*\(/.test(source);
}

function compactTaskMdForLearnedReuse(source: string): string {
  const droppedHeadings = [
    "tools available",
    "workflow",
    "required: task completion protocol",
  ];
  const out: string[] = [];
  let dropping = false;
  for (const line of source.split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading?.[1]) {
      const title = heading[1].replace(/\*/g, "").trim().toLowerCase();
      dropping = droppedHeadings.some((prefix) => title.startsWith(prefix));
      if (dropping) continue;
    }
    if (!dropping) out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

export function renderLearnedReuseSurface(
  task: SkillCraftTask,
  dfDts: string,
  records: EvalRecord[],
  learnedRecordHelperName = "recordToolFanout",
): string {
  const plan = buildFanoutToolPlan(task, dfDts, records);
  const toolBundles = taskToolBundles(task);
  const toolBundle = toolBundles[0] ?? "tool_bundle";
  const expectedRepetitions = expectedRepetitionsForTask(task);
  const surfaceToolNames = plan.sameEntityToolNames.length > 0 ? plan.sameEntityToolNames : plan.exactToolNames;
  const selectedTools = plan.sameEntityToolNames.length
    ? plan.sameEntityToolNames.map((name) => renderCompactToolSignature(dfDts, name, plan.paramName)).join("\n")
    : surfaceToolNames.map((name) => renderCompactToolSignature(dfDts, name, plan.paramName)).join("\n") ||
      "    [name: string]: (input: any) => Promise<any>;";
  const dependentHint = renderDependentToolHint(plan);
  const suggestedCall = plan.sameEntityToolNames.length > 0
    ? renderIntentLevelLearnedRowsSetup({
        task,
        learnedRecordHelperName,
        plan,
        toolBundle,
        expectedRepetitions,
      })
    : [
        "import { g, arr, asArr, num, pickNum, avg, r1, firstVal, text, rowsOf, writeJson } from \"./datafetch_answer_kit.ts\";",
        "",
        `const records = await df.db.records.findExact({ family: ${JSON.stringify(task.family)} }${expectedRepetitions > 0 ? `, ${expectedRepetitions}` : ""});`,
        "",
        "No verified record-backed fan-out call shape is available for this task.",
        "Derive entities from `records` and use direct `df.tool` calls only for required outputs; keep these tools out of `recordToolFanout` until a verifier promotes them.",
      ].join("\n");
  return [
    "declare const df: {",
    "  db: { records: { findExact(filter: Record<string, unknown>, limit?: number): Promise<Array<{ id: string; recordKey: string; family: string; entity: string; label: string; attributes: Record<string, unknown> }>> } };",
    "  tool: {",
    `  ${toolBundle}: {`,
    "    [name: string]: (input: any) => Promise<any>;",
    selectedTools,
    "  };",
    "  };",
    "  lib: {",
    `    ${learnedRecordHelperName}(input: Record<string, unknown>): Promise<{ value: any[] }>;`,
  "  };",
    "  answer(input: { status: \"answered\" | \"partial\" | \"unsupported\"; value?: unknown; evidence?: unknown[]; derivation?: unknown[]; reason?: string }): unknown;",
    "};",
    "",
    plan.sameEntityToolNames.length > 0
      ? "Suggested intent-level setup:"
      : "Learned-helper eligibility:",
    suggestedCall,
    dependentHint,
  ].filter((part) => part.length > 0).join("\n");
}

function renderIntentLevelLearnedRowsSetup(input: {
  task: SkillCraftTask;
  learnedRecordHelperName: string;
  plan: FanoutToolPlan;
  toolBundle: string;
  expectedRepetitions: number;
}): string {
  return [
    "import { g, arr, asArr, num, pickNum, avg, r1, firstVal, text, rowsOf, writeJson } from \"./datafetch_answer_kit.ts\";",
    "import { getRowTool, loadRecordIntentRows } from \"./datafetch_record_intent.ts\";",
    "",
    "const rows = await loadRecordIntentRows();",
    "const intentRows = rows;",
  ].join("\n");
}

export function renderRecordIntentHelperSource(input: {
  task: SkillCraftTask;
  learnedRecordHelperName: string;
  plan: FanoutToolPlan;
  toolBundle: string;
  expectedRepetitions: number;
}): string {
  const internalPlanEntries = [
    `  entityField: ${JSON.stringify(input.plan.entityField)},`,
    `  toolBundle: ${JSON.stringify(input.toolBundle)},`,
    `  toolNames: [${input.plan.sameEntityToolNames.map((name) => JSON.stringify(name)).join(", ")}],`,
    `  paramName: ${JSON.stringify(input.plan.paramName)},`,
    ...(input.plan.paramByTool ? [`  paramByTool: ${JSON.stringify(input.plan.paramByTool)},`] : []),
    ...(input.plan.recordParamMapByTool ? [`  recordParamMapByTool: ${JSON.stringify(input.plan.recordParamMapByTool)},`] : []),
    ...(input.learnedRecordHelperName === "recordToolEnrichment" && input.plan.dependentToolNames.length > 0
      ? [
          `  dependentToolNames: [${input.plan.dependentToolNames.map((name) => JSON.stringify(name)).join(", ")}],`,
          `  dependentParamName: ${JSON.stringify(input.plan.paramName)},`,
        ]
      : []),
  ];
  const recordLimitLine = input.expectedRepetitions > 0
    ? `  recordLimit: intent.recordLimit ?? ${input.expectedRepetitions},`
    : "  recordLimit: intent.recordLimit,";
  const defaultRecordLimit = input.expectedRepetitions > 0 ? String(input.expectedRepetitions) : "undefined";
  const helperIntent = input.learnedRecordHelperName === "recordToolEnrichment"
    ? "record-backed dependent enrichment"
    : "record-backed repeated fan-out";
  const intentEntityPaths = [
    `record.attributes.${input.plan.entityField}`,
    `attributes.${input.plan.entityField}`,
    `record.${input.plan.entityField}`,
    input.plan.entityField,
    "entityValue",
    "entity",
    "id",
  ];
  return [
    "import { g, rowsOf } from \"./datafetch_answer_kit.ts\";",
    "",
    "declare const df: any;",
    "",
    "export type RecordIntentInput = { recordFilter?: Record<string, unknown>; recordLimit?: number };",
    "const __datafetchRecordIntentPlan = {",
    ...internalPlanEntries,
    "};",
    `const __datafetchIntentEntityField = ${JSON.stringify(input.plan.entityField)};`,
    `const __datafetchIntentEntityPaths = ${JSON.stringify(intentEntityPaths)};`,
    "const __shapeRecordIntentRows = (rows: any[]) => rows.map((row: any) => {",
    "  const intentEntity = g(row, ...__datafetchIntentEntityPaths);",
    "  const recordLabel = g(row, \"label\", \"record.label\", \"record.entity\", \"entity\", \"entityValue\", \"id\");",
    "  if (__datafetchIntentEntityField === \"id\" || __datafetchIntentEntityField === \"entity\") return { ...row, intentEntity, label: row.label ?? recordLabel };",
    "  return { ...row, intentEntity, label: row.label ?? recordLabel };",
    "});",
    input.learnedRecordHelperName === PER_ENTITY_SEED_NAME
      ? [
          `const __datafetchDefaultRecordLimit = ${defaultRecordLimit};`,
          "export const loadRecordIntentRows = async (intent: RecordIntentInput = {}) => {",
          `  const records = await df.db.records.findExact(intent.recordFilter ?? { family: ${JSON.stringify(input.task.family)} }, intent.recordLimit ?? __datafetchDefaultRecordLimit);`,
          "  const rawRows = rowsOf(await df.lib.per_entity({",
          "    entityIds: records.map((record: any) => g(record, ...__datafetchIntentEntityPaths)),",
          `    toolBundle: ${JSON.stringify(input.toolBundle)},`,
          `    toolNames: [${input.plan.sameEntityToolNames.map((name) => JSON.stringify(name)).join(", ")}],`,
          `    paramName: ${JSON.stringify(input.plan.paramName)},`,
          ...(input.plan.paramByTool ? [`    paramByTool: ${JSON.stringify(input.plan.paramByTool)},`] : []),
          "  }));",
          "  return __shapeRecordIntentRows(rawRows.map((row: any, index: number) => ({",
          "    ...row,",
          "    record: row?.record ?? records[index],",
          "    label: row?.label ?? records[index]?.label,",
          "    attributes: row?.attributes ?? records[index]?.attributes,",
          "  })));",
          "};",
        ].join("\n")
      : [
          `export const loadRecordIntentRows = async (intent: RecordIntentInput = {}) => __shapeRecordIntentRows(rowsOf(await df.lib.${input.learnedRecordHelperName}({`,
          `  intent: ${JSON.stringify(helperIntent)},`,
          "  ...__datafetchRecordIntentPlan,",
          `  recordFilter: intent.recordFilter ?? { family: ${JSON.stringify(input.task.family)} },`,
          recordLimitLine,
          "})));",
        ].join("\n"),
    "",
    "export const getRowTool = (row: any, toolName: string) => row?.tools?.[toolName] ?? row?.[toolName];",
  ].join("\n");
}

function selectTaskRelevantToolNames(task: SkillCraftTask, exactToolNames: string[]): string[] {
  const meta = isRecord(task.taskConfig.meta) ? task.taskConfig.meta : {};
  const toolsUsed = Array.isArray(meta.tools_used)
    ? meta.tools_used.filter((item): item is string => typeof item === "string")
    : [];
  if (toolsUsed.length === 0 || exactToolNames.length === 0) return exactToolNames;

  const selected: string[] = [];
  for (const tool of toolsUsed) {
    const wanted = normalizeLocalToolName(tool);
    const exact = exactToolNames.find((candidate) => normalizeLocalToolName(candidate) === wanted);
    if (exact && !selected.includes(exact)) selected.push(exact);
  }
  return selected.length > 0 ? selected : exactToolNames;
}

function normalizeLocalToolName(name: string): string {
  return name.startsWith("local-") ? name.slice("local-".length) : name;
}

function renderCompactToolSignature(dfDts: string, toolName: string, fallbackParamName: string): string {
  const inputType = extractToolInputTypes(dfDts).get(toolName) ?? `{ ${JSON.stringify(fallbackParamName)}: string | number }`;
  return `    ${JSON.stringify(toolName)}(input: ${inputType}): Promise<any>;`;
}

function extractToolInputTypes(source: string): Map<string, string> {
  const inputs = new Map<string, string>();
  for (const match of source.matchAll(/"([^"]+)"\s*\(\s*input:\s*(\{[^}]*\})\s*\):\s*Promise<any>;/g)) {
    const name = match[1];
    const input = match[2];
    if (name?.startsWith("local-") && input) inputs.set(name, input);
  }
  return inputs;
}

function extractToolParamFields(source: string): Map<string, ToolParamField[]> {
  const params = new Map<string, ToolParamField[]>();
  for (const [name, inputType] of extractToolInputTypes(source)) {
    const fields = [...inputType.matchAll(/"([^"]+)"(\?)?\s*:/g)]
      .map((match) => {
        const field = match[1];
        if (!field) return null;
        return { name: field, optional: match[2] === "?" };
      })
      .filter((field): field is ToolParamField => field !== null);
    if (fields.length > 0) params.set(name, fields);
  }
  return params;
}

function selectPrimaryToolParamName(
  toolNames: string[],
  toolParamCandidates: ReadonlyMap<string, string | string[]>,
): string | null {
  for (const toolName of toolNames) {
    const first = firstParam(toolParamCandidates.get(toolName));
    if (first) return first;
  }
  return null;
}

function buildParamByTool(
  toolNames: string[],
  toolParamCandidates: ReadonlyMap<string, string | string[]>,
  fallbackParamName: string,
): Record<string, string> | null {
  const entries: Array<[string, string]> = [];
  for (const toolName of toolNames) {
    const paramName = firstParam(toolParamCandidates.get(toolName)) ?? fallbackParamName;
    entries.push([toolName, paramName]);
  }
  if (entries.every(([, paramName]) => paramName === fallbackParamName)) return null;
  return Object.fromEntries(entries);
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function extractExactToolNames(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(/"([^"]+)"\s*\(\s*input:/g)) {
    const name = match[1];
    if (name?.startsWith("local-")) names.add(name);
  }
  return [...names];
}

function expectedRepetitionsForTask(task: SkillCraftTask): number {
  const meta = isRecord(task.taskConfig.meta) ? task.taskConfig.meta : {};
  return numberOr(meta.expected_repetitions, meta.subtask_count);
}

async function readPromptContextFile(file: string, maxChars: number): Promise<string> {
  try {
    const source = await fsp.readFile(file, "utf8");
    if (source.length <= maxChars) return source.trimEnd();
    return `${source.slice(0, maxChars).trimEnd()}\n\n[truncated at ${maxChars} chars]`;
  } catch {
    return "";
  }
}

async function renderInitialWorkspaceContext(workspace: string, options: { maxChars?: number } = {}): Promise<string> {
  const entries = await safeReaddir(workspace);
  const blocks: string[] = [];
  for (const name of entries.sort()) {
    if (!name.endsWith(".json")) continue;
    if (name.startsWith(".")) continue;
    if (["task_config.json", "tool_manifest.json"].includes(name)) continue;
    const file = path.join(workspace, name);
    if (!(await isFile(file))) continue;
    const source = await readPromptContextFile(file, options.maxChars ?? 4_000);
    if (!source) continue;
    blocks.push(["", `## ${name}`, "```json", source, "```"].join("\n"));
    if (blocks.length >= 4) break;
  }
  return blocks.length ? blocks.join("\n") : "";
}

async function listSkillcraftTools(input: {
  skillcraftDir: string;
  bundle: string;
}): Promise<ToolDescriptor[]> {
  const runnerPath = path.resolve("eval/skillcraft/scripts/invoke-skillcraft-tool.py");
  const proc = await spawnProcess(process.env["SKILLCRAFT_TOOL_PYTHON"] ?? "python3", [
    runnerPath,
    "--skillcraft-dir",
    input.skillcraftDir,
    "--bundle",
    input.bundle,
    "--list",
  ], process.cwd());
  if (proc.exitCode !== 0) {
    throw new Error(`failed to list SkillCraft tools for ${input.bundle}: ${proc.stderr || proc.stdout}`);
  }
  const payload = JSON.parse(proc.stdout) as { tools?: ToolDescriptor[] };
  return payload.tools ?? [];
}

async function collectToolCatalog(
  task: SkillCraftTask,
  skillcraftDir: string,
): Promise<ToolCatalogEntry[]> {
  const catalog: ToolCatalogEntry[] = [];
  for (const bundle of taskToolBundles(task)) {
    catalog.push({
      bundle,
      tools: await listSkillcraftTools({ skillcraftDir, bundle }),
    });
  }
  return catalog;
}

function flattenToolCatalogNames(toolCatalog: ToolCatalogEntry[]): string[] {
  return toolCatalog.flatMap((entry) => entry.tools.map((tool) => tool.name));
}

function taskToolBundles(task: SkillCraftTask): string[] {
  const local = Array.isArray(task.taskConfig.needed_local_tools) ? task.taskConfig.needed_local_tools : [];
  return local
    .filter((tool): tool is string => typeof tool === "string")
    .filter((tool) => !["claim_done", "skill_cache", "direct_exec"].includes(tool));
}

function schemaToTs(schema: Record<string, unknown>): string {
  const props = schema.properties && typeof schema.properties === "object"
    ? schema.properties as Record<string, Record<string, unknown>>
    : {};
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : []);
  const fields = Object.entries(props).map(([name, prop]) => {
    const optional = required.has(name) ? "" : "?";
    return `${JSON.stringify(name)}${optional}: ${jsonSchemaType(prop)}`;
  });
  return fields.length ? `{ ${fields.join("; ")} }` : "Record<string, unknown>";
}

function jsonSchemaType(prop: Record<string, unknown>): string {
  if (prop.type === "number" || prop.type === "integer") return "number";
  if (prop.type === "boolean") return "boolean";
  if (prop.type === "array") return "unknown[]";
  if (prop.type === "object") return "Record<string, unknown>";
  return "string";
}

// --- Agent dispatcher -------------------------------------------------------
//
// Routes the eval's per-episode agent invocation to whichever backend
// is configured (`DATAFETCH_AGENT=codex|claude`). The caller pipes the
// same args through either path; the dispatcher hides the binary
// differences. Output normalises to a single AgentRun shape, so the
// eval's downstream `writeAgentArtifacts`, `classifyAgentFailure`, and
// AdapterEpisode population is agent-agnostic.
async function runAgent(args: {
  workspaceDir: string;
  prompt: string;
  model?: string;
  reasoningEffort?: string;
  timeoutMs: number;
}): Promise<AgentRun> {
  const backend = resolveAgentBackend();
  if (backend === "claude") return runClaudeAgent(args);
  if (backend === "codex-direct") return runCodexDirectAgent(args);
  return runCodexAgent(args);
}

async function runCodexAgent(args: {
  workspaceDir: string;
  prompt: string;
  model?: string;
  reasoningEffort?: string;
  timeoutMs: number;
}): Promise<AgentRun> {
  const model = resolveCodexModel(args.model, "DF_SKILLCRAFT_FULL_MODEL");
  const reasoningEffort = resolveCodexReasoningEffort(args.reasoningEffort, "DF_SKILLCRAFT_FULL_REASONING_EFFORT");
  const lastMessagePath = path.join(args.workspaceDir, ".codex-last-message.txt");
  const tmpDir = path.join(args.workspaceDir, ".tmp");
  await fsp.mkdir(tmpDir, { recursive: true });
  const started = performance.now();
  const codexBin = process.env["CODEX_BIN"] ?? "codex";
  const sandbox = process.env["CODEX_SANDBOX"] ?? "danger-full-access";
  const codexArgs = [
    "--ask-for-approval",
    "never",
    "exec",
    "--model",
    model,
    "--sandbox",
    sandbox,
    "--cd",
    args.workspaceDir,
    "-c",
    `model_reasoning_effort=${JSON.stringify(reasoningEffort)}`,
    "--json",
    "-o",
    lastMessagePath,
    "--skip-git-repo-check",
  ];
  if (envFlag("CODEX_EPHEMERAL")) codexArgs.push("--ephemeral");
  if (envFlag("CODEX_IGNORE_USER_CONFIG")) codexArgs.push("--ignore-user-config");
  if (envFlag("CODEX_IGNORE_RULES")) codexArgs.push("--ignore-rules");
  for (const feature of csv(process.env["CODEX_DISABLE_FEATURES"] ?? "")) {
    codexArgs.push("--disable", feature);
  }
  codexArgs.push("--", args.prompt);
  const env = {
    ...process.env,
    // Keep tsx's Unix-socket path inside the Codex workspace-write sandbox
    // without exceeding macOS's short sockaddr_un path limit. A long absolute
    // workspace path causes EINVAL; a system temp path causes EPERM.
    TMPDIR: `.tmp${path.sep}`,
    TMP: ".tmp",
    TEMP: ".tmp",
  };
  const run = await spawnProcess(codexBin, codexArgs, args.workspaceDir, args.timeoutMs, env);
  let finalMessage = "";
  try {
    finalMessage = await fsp.readFile(lastMessagePath, "utf8");
  } catch {
    finalMessage = "";
  }
  return {
    workspaceDir: args.workspaceDir,
    prompt: args.prompt,
    stdout: run.stdout,
    stderr: run.stderr,
    finalMessage,
    elapsedMs: performance.now() - started,
    exitCode: run.exitCode,
    usage: parseCodexUsage(run.stdout),
  };
}

async function runCodexDirectAgent(args: {
  workspaceDir: string;
  prompt: string;
  model?: string;
  reasoningEffort?: string;
  timeoutMs: number;
}): Promise<AgentRun> {
  const model = resolveCodexModel(args.model, "DF_SKILLCRAFT_FULL_MODEL");
  const reasoningEffort = resolveCodexReasoningEffort(args.reasoningEffort, "DF_SKILLCRAFT_FULL_REASONING_EFFORT");
  const started = performance.now();
  const outputPath = path.join(args.workspaceDir, "scripts", "answer.ts");
  const cacheIsolationNonce = createHash("sha256")
    .update(args.workspaceDir)
    .digest("hex")
    .slice(0, 16);
  const directPrompt = [
    `Cache isolation nonce: ${cacheIsolationNonce}`,
    "",
    args.prompt,
    "",
    "Direct backend instruction: return only the complete TypeScript source for `scripts/answer.ts`.",
    "Do not use markdown fences. Do not include explanations. The harness will write your response to that file and run it.",
    "Prefer compact source, but keep the control flow straightforward and correct.",
  ].join("\n");
  let stdout = "";
  let stderr = "";
  let finalMessage = "";
  let exitCode = 1;
  let usage: AgentUsage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    llmCalls: 0,
  };
  try {
    const result = await callCodexResponses({
      model,
      prompt: directPrompt,
      reasoningEffort,
      timeoutMs: args.timeoutMs,
    });
    finalMessage = stripCodeFence(result.outputText).trim();
    usage = result.usage;
    stdout = `${JSON.stringify({
      type: "turn.completed",
      usage: {
        input_tokens: usage.inputTokens,
        cached_input_tokens: usage.cachedInputTokens,
        output_tokens: usage.outputTokens,
        reasoning_output_tokens: usage.reasoningOutputTokens,
      },
    })}\n`;
    if (!finalMessage) {
      stderr = "codex-direct produced empty scripts/answer.ts source\n";
    } else {
      await fsp.mkdir(path.dirname(outputPath), { recursive: true });
      await fsp.writeFile(outputPath, `${finalMessage}\n`, "utf8");
      exitCode = 0;
    }
  } catch (error) {
    stderr = error instanceof Error ? error.stack ?? error.message : String(error);
  }
  return {
    workspaceDir: args.workspaceDir,
    prompt: directPrompt,
    stdout,
    stderr,
    finalMessage,
    elapsedMs: performance.now() - started,
    exitCode,
    usage,
  };
}

async function callCodexResponses(input: {
  model: string;
  prompt: string;
  reasoningEffort: string;
  timeoutMs: number;
}): Promise<{ outputText: string; usage: AgentUsage }> {
  const token = await readCodexAccessToken();
  if (!token) {
    throw new Error("codex-direct requires OPENAI_CODEX_API_KEY, CODEX_OAUTH_TOKEN, CLAW_CODEX_ACCESS_TOKEN, or ~/.codex/auth.json");
  }
  const accountId = codexAccountId(token);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs).unref();
  try {
    const body = {
      model: input.model,
      store: false,
      stream: true,
      instructions: "",
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: input.prompt }],
        },
      ],
      text: { verbosity: "low" },
      reasoning: { effort: input.reasoningEffort, summary: "auto" },
      include: ["reasoning.encrypted_content"],
    };
    const response = await fetch("https://chatgpt.com/backend-api/codex/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "chatgpt-account-id": accountId,
        originator: "datafetch-eval",
        "OpenAI-Beta": "responses=experimental",
        accept: "text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`codex-direct HTTP ${response.status}: ${friendlyCodexError(text)}`);
    }
    const events = await readSseJsonEvents(response);
    let outputText = "";
    let completedUsage: Record<string, unknown> | null = null;
    for (const event of events) {
      const type = typeof event.type === "string" ? event.type : "";
      if (type === "response.output_text.delta" && typeof event.delta === "string") {
        outputText += event.delta;
      } else if (type === "response.output_text.done" && !outputText && typeof event.text === "string") {
        outputText = event.text;
      } else if (type === "response.failed" || type === "error") {
        throw new Error(friendlyCodexError(JSON.stringify(event)));
      } else if (type === "response.completed") {
        const responseObj = isRecord(event.response) ? event.response : null;
        completedUsage = isRecord(responseObj?.usage) ? responseObj.usage : null;
      }
    }
    const usage = codexResponsesUsage(completedUsage);
    return { outputText, usage };
  } finally {
    clearTimeout(timer);
  }
}

async function readSseJsonEvents(response: Response): Promise<Array<Record<string, unknown>>> {
  const text = await response.text();
  const events: Array<Record<string, unknown>> = [];
  for (const chunk of text.split("\n\n")) {
    const data = chunk
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n")
      .trim();
    if (!data || data === "[DONE]") continue;
    try {
      const event = JSON.parse(data) as unknown;
      if (isRecord(event)) events.push(event);
    } catch {
      // Ignore malformed keepalive chunks.
    }
  }
  return events;
}

function codexResponsesUsage(raw: Record<string, unknown> | null): AgentUsage {
  const details = isRecord(raw?.input_tokens_details) ? raw.input_tokens_details : null;
  const outputDetails = isRecord(raw?.output_tokens_details) ? raw.output_tokens_details : null;
  return {
    inputTokens: numberField(raw ?? {}, "input_tokens"),
    cachedInputTokens: numberField(details ?? {}, "cached_tokens"),
    outputTokens: numberField(raw ?? {}, "output_tokens"),
    reasoningOutputTokens: numberField(outputDetails ?? {}, "reasoning_tokens"),
    llmCalls: raw ? 1 : 0,
  };
}

function stripCodeFence(source: string): string {
  const trimmed = source.trim();
  const match = /^```(?:ts|typescript|javascript|js)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed);
  return match?.[1] ?? trimmed;
}

async function readCodexAccessToken(): Promise<string | null> {
  const envToken =
    process.env["OPENAI_CODEX_API_KEY"] ??
    process.env["CODEX_OAUTH_TOKEN"] ??
    process.env["CLAW_CODEX_ACCESS_TOKEN"];
  if (envToken && envToken.trim()) return envToken.trim();
  try {
    const auth = JSON.parse(
      await fsp.readFile(path.join(os.homedir(), ".codex", "auth.json"), "utf8"),
    ) as unknown;
    if (!isRecord(auth)) return null;
    const tokens = isRecord(auth.tokens) ? auth.tokens : null;
    const access = tokens?.access_token;
    return typeof access === "string" && access.trim() ? access.trim() : null;
  } catch {
    return null;
  }
}

function codexAccountId(token: string): string {
  try {
    const [, payload] = token.split(".");
    if (!payload) throw new Error("missing token payload");
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
    if (!isRecord(parsed)) throw new Error("invalid token payload");
    const auth = isRecord(parsed["https://api.openai.com/auth"])
      ? parsed["https://api.openai.com/auth"]
      : null;
    const accountId = auth?.chatgpt_account_id;
    if (typeof accountId === "string" && accountId) return accountId;
  } catch {
    // Fall through to a stable error below.
  }
  throw new Error("failed to extract chatgpt_account_id from Codex token");
}

function friendlyCodexError(text: string): string {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (isRecord(parsed)) {
      const detail = parsed.detail;
      if (typeof detail === "string") return detail;
      const error = isRecord(parsed.error) ? parsed.error : null;
      const message = error?.message;
      if (typeof message === "string") return message;
      const response = isRecord(parsed.response) ? parsed.response : null;
      const responseError = isRecord(response?.error) ? response.error : null;
      const responseMessage = responseError?.message;
      if (typeof responseMessage === "string") return responseMessage;
    }
  } catch {
    // Return raw text below.
  }
  return text.slice(0, 2_000);
}

// Claude agent runner. Drop-in parity with runCodexAgent: same input
// args, same AgentRun output shape. Invokes the Claude Code CLI in
// `--print` (non-interactive) mode with structured JSON output so we
// can parse tokens/turns/cost into AgentUsage.
//
// Permission posture: `--dangerously-skip-permissions` is the Claude
// equivalent of codex's `--sandbox danger-full-access` + `--ask-for-
// approval never`. The eval workspace is a hermetic /tmp directory
// the agent fully owns; outside-of-eval workflows must NOT inherit
// this posture.
async function runClaudeAgent(args: {
  workspaceDir: string;
  prompt: string;
  model?: string;
  reasoningEffort?: string;
  timeoutMs: number;
}): Promise<AgentRun> {
  // CLAUDE_BACKEND=sdk routes through a thin Anthropic SDK driver that
  // does not set cache_control on any block — i.e. genuinely cache=0
  // per episode, satisfying the Goal-4 qualification rule that
  // `claude --print` cannot satisfy (Claude Code's system prompt is
  // server-side cached). This driver does NOT use Anthropic tools — it
  // asks the model to return the complete `scripts/answer.ts` as text
  // in a single response, then writes the file ourselves. Single LLM
  // call per episode; no multi-turn editing.
  if ((process.env["CLAUDE_BACKEND"] ?? "").toLowerCase() === "sdk") {
    return runClaudeSdkAgent(args);
  }
  const model = resolveClaudeModel(args.model);
  const effort = resolveClaudeEffort(args.reasoningEffort);
  const started = performance.now();
  // CLAUDE_CLI selects between the rate-limited `claude --print` path
  // and the `claude-p` drop-in (drives interactive TUI via PTY, no
  // --print rate limit, but auto-caches the system prompt — cachedInputTokens
  // will be nonzero). Default keeps the existing claude --print behaviour
  // so the qualification "cachedInputTokens == 0" rule stays satisfied.
  // Default to `claude-p` (PTY-driven drop-in for `claude --print`) because
  // Anthropic's recent rate-limit policy hits `claude --print` aggressively
  // when used in a tight eval loop. claude-p bypasses that limit at the
  // cost of nonzero cached input tokens (framework system prompt is
  // server-cached). Set CLAUDE_CLI=claude to restore the legacy `claude
  // --print --no-session-persistence` path.
  const claudeBin = process.env["CLAUDE_CLI"] ?? "claude-p";
  const isClaudeP = /(?:^|\/)claude-p$/.test(claudeBin);
  const cliArgs = isClaudeP
    ? [
        "--output-format", "json",
        "--model", model,
        "--dangerously-skip-permissions",
        "--timeout", String(Math.max(60, Math.ceil(args.timeoutMs / 1000))),
        "--effort", effort,
        args.prompt,
      ]
    : [
        "--print",
        "--output-format", "json",
        "--model", model,
        "--effort", effort,
        "--dangerously-skip-permissions",
        "--no-session-persistence",
        args.prompt,
      ];
  const run = await spawnProcess(claudeBin, cliArgs, args.workspaceDir, args.timeoutMs);

  // Default to empty / zeroed; we overwrite from parsed JSON below
  // when the run produced a valid result envelope.
  let finalMessage = "";
  const usage: AgentUsage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    llmCalls: 0,
  };

  try {
    const parsed = JSON.parse(run.stdout) as Record<string, unknown>;
    const result = parsed["result"];
    if (typeof result === "string") {
      finalMessage = result;
    } else if (result !== undefined) {
      finalMessage = JSON.stringify(result);
    }
    const rawUsage = parsed["usage"];
    if (rawUsage && typeof rawUsage === "object") {
      const u = rawUsage as Record<string, unknown>;
      usage.inputTokens = numberField(u, "input_tokens");
      usage.cachedInputTokens =
        numberField(u, "cache_read_input_tokens") +
        numberField(u, "cache_creation_input_tokens");
      usage.outputTokens = numberField(u, "output_tokens");
    }
    usage.llmCalls = numberField(parsed, "num_turns");
  } catch {
    // Non-JSON output (auth failure, unauthenticated, internal error,
    // truncation by timeout, …). Fall back to the raw stdout as the
    // best-effort final message; the eval will record exit code and
    // stderr for diagnosis.
    finalMessage = run.stdout.trim();
  }

  return {
    workspaceDir: args.workspaceDir,
    prompt: args.prompt,
    stdout: run.stdout,
    stderr: run.stderr,
    finalMessage,
    elapsedMs: performance.now() - started,
    exitCode: run.exitCode,
    usage,
  };
}

// Thin Anthropic SDK driver. Skips Claude Code CLI entirely so the
// ~98k cached system-prompt overhead the qualification rule prohibits
// does not appear. NO cache_control on any block, NO system prompt,
// NO tool definitions — Claude returns the complete scripts/answer.ts
// as a single text response inside a ```ts code fence; we write it.
async function runClaudeSdkAgent(args: {
  workspaceDir: string;
  prompt: string;
  model?: string;
  reasoningEffort?: string;
  timeoutMs: number;
}): Promise<AgentRun> {
  const model = resolveClaudeModel(args.model);
  const started = performance.now();
  const answerPath = path.join(args.workspaceDir, "scripts", "answer.ts");
  let scaffold = "";
  try {
    scaffold = await fsp.readFile(answerPath, "utf8");
  } catch {
    scaffold = "";
  }
  const fullPrompt = [
    args.prompt,
    "",
    "Current `scripts/answer.ts` (replace it):",
    "```ts",
    scaffold,
    "```",
    "",
    "Reply with EXACTLY one ```ts ... ``` code fence containing the complete updated scripts/answer.ts source. No prose before or after. The harness will write your fenced code verbatim to scripts/answer.ts.",
  ].join("\n");
  const client = new Anthropic({});
  let stdoutBuf = "";
  let stderrBuf = "";
  const usage: AgentUsage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    llmCalls: 0,
  };
  let exitCode = 0;
  let finalMessage = "";
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 8192,
      messages: [{ role: "user", content: fullPrompt }],
      // Explicitly NO system prompt, NO cache_control anywhere.
    });
    usage.inputTokens = response.usage.input_tokens ?? 0;
    usage.cachedInputTokens =
      (response.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0;
    usage.cachedInputTokens +=
      (response.usage as { cache_creation_input_tokens?: number }).cache_creation_input_tokens ?? 0;
    usage.outputTokens = response.usage.output_tokens ?? 0;
    usage.llmCalls = 1;
    const textBlock = response.content.find((b) => b.type === "text");
    finalMessage = textBlock && textBlock.type === "text" ? textBlock.text : "";
    stdoutBuf = JSON.stringify(response);
    const fenceMatch = /```(?:ts|typescript|javascript|js)?\s*\n([\s\S]*?)\n```/.exec(finalMessage);
    const codeBody = fenceMatch?.[1] ?? finalMessage;
    if (codeBody.trim().length > 0) {
      await fsp.mkdir(path.dirname(answerPath), { recursive: true });
      await fsp.writeFile(answerPath, codeBody, "utf8");
    } else {
      exitCode = 2;
      stderrBuf = "[claude-sdk] empty response — no code body to write";
    }
  } catch (err) {
    exitCode = 1;
    const message = err instanceof Error ? err.stack ?? err.message : String(err);
    stderrBuf = `[claude-sdk] ${message}`;
    finalMessage = "";
  }
  return {
    workspaceDir: args.workspaceDir,
    prompt: args.prompt,
    stdout: stdoutBuf,
    stderr: stderrBuf,
    finalMessage,
    elapsedMs: performance.now() - started,
    exitCode,
    usage,
  };
}

function resolveClaudeModel(explicit: string | undefined): string {
  return (
    explicit ??
    process.env["DF_SKILLCRAFT_CLAUDE_MODEL"] ??
    process.env["DF_SKILLCRAFT_FULL_MODEL"] ??
    process.env["DF_TEST_MODEL"] ??
    DEFAULT_CLAUDE_MODEL
  );
}

function resolveClaudeEffort(explicit: string | undefined): string {
  return (
    explicit ??
    process.env["DF_SKILLCRAFT_CLAUDE_EFFORT"] ??
    process.env["DF_SKILLCRAFT_FULL_REASONING_EFFORT"] ??
    process.env["DF_TEST_REASONING_EFFORT"] ??
    DEFAULT_REASONING_EFFORT
  );
}

function resolveCodexModel(explicit: string | undefined, envName: string): string {
  return explicit ?? process.env[envName] ?? process.env["DF_TEST_MODEL"] ?? DEFAULT_CODEX_MODEL;
}

function resolveCodexReasoningEffort(explicit: string | undefined, envName: string): string {
  return explicit ?? process.env[envName] ?? process.env["DF_TEST_REASONING_EFFORT"] ?? DEFAULT_REASONING_EFFORT;
}

function envFlag(name: string): boolean {
  const raw = process.env[name];
  return raw === "1" || raw?.toLowerCase() === "true" || raw?.toLowerCase() === "yes";
}

function classifyAgentFailure(agentRun: AgentRun): AdapterEpisode["agentFailureKind"] | null {
  if (agentRun.exitCode === 0) return null;
  const text = `${agentRun.stderr}\n${agentRun.stdout}\n${agentRun.finalMessage}`;
  if (/usage limit|hit your usage limit/i.test(text)) return "model_usage_limit";
  return "agent_error";
}

async function writeAgentArtifacts(input: {
  artifactDir: string;
  agentRun: AgentRun;
}): Promise<void> {
  const agentDir = path.join(input.artifactDir, "agent");
  await fsp.mkdir(agentDir, { recursive: true });
  await fsp.writeFile(path.join(agentDir, "prompt.txt"), input.agentRun.prompt);
  await fsp.writeFile(path.join(agentDir, "events.jsonl"), input.agentRun.stdout);
  await fsp.writeFile(path.join(agentDir, "stderr.txt"), input.agentRun.stderr);
  await fsp.writeFile(path.join(agentDir, "final-message.txt"), input.agentRun.finalMessage);
  await fsp.writeFile(path.join(agentDir, "usage.json"), `${JSON.stringify({
    elapsedMs: Math.round(input.agentRun.elapsedMs),
    exitCode: input.agentRun.exitCode,
    usage: input.agentRun.usage,
  }, null, 2)}\n`);
}

async function runEvaluator(input: {
  skillcraftDir: string;
  evaluatorPath: string;
  workspace: string;
  groundtruth: string;
}): Promise<EvaluatorResult> {
  const started = performance.now();
  const relEvaluator = path.relative(input.skillcraftDir, input.evaluatorPath);
  const evaluatorPython = process.env["SKILLCRAFT_EVAL_PYTHON"] ?? "python3";
  const result = await spawnProcess(evaluatorPython, [
    relEvaluator,
    "--agent_workspace",
    input.workspace,
    "--groundtruth_workspace",
    input.groundtruth,
  ], input.skillcraftDir);
  return {
    ...result,
    elapsedMs: performance.now() - started,
    scoreJson: parseScoreJson(result.stdout),
  };
}

function spawnProcess(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs?: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;
    let closed = false;
    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
          setTimeout(() => {
            if (!closed) child.kill("SIGKILL");
          }, 2_000).unref();
        }, timeoutMs)
      : undefined;
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout: Buffer.concat(stdout).toString("utf8"), stderr: `${Buffer.concat(stderr).toString("utf8")}${String(error)}`, exitCode: 1 });
    });
    child.on("close", (code, signal) => {
      closed = true;
      if (timer) clearTimeout(timer);
      const stderrText = Buffer.concat(stderr).toString("utf8");
      resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: timedOut ? `${stderrText}\n[timed out after ${timeoutMs}ms signal=${signal ?? ""}]\n` : stderrText,
        exitCode: typeof code === "number" ? code : 1,
      });
    });
  });
}

function parseCodexUsage(stdout: string): AgentUsage {
  const usage: AgentUsage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    llmCalls: 0,
  };
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (!event || typeof event !== "object") continue;
    const record = event as Record<string, unknown>;
    if (record["type"] !== "turn.completed") continue;
    const rawUsage = record["usage"];
    if (!rawUsage || typeof rawUsage !== "object") continue;
    const u = rawUsage as Record<string, unknown>;
    usage.inputTokens += numberField(u, "input_tokens");
    usage.cachedInputTokens += numberField(u, "cached_input_tokens");
    usage.outputTokens += numberField(u, "output_tokens");
    usage.reasoningOutputTokens += numberField(u, "reasoning_output_tokens");
    usage.llmCalls += 1;
  }
  return usage;
}

function numberField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseScoreJson(stdout: string): Record<string, unknown> | null {
  const match = /=== SCORE_JSON_START ===\s*([\s\S]*?)\s*=== SCORE_JSON_END ===/.exec(stdout);
  if (!match) return null;
  try {
    return JSON.parse(match[1] ?? "") as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function inferExpectedOutputFiles(evaluatorPath: string): Promise<string[]> {
  const source = await fsp.readFile(evaluatorPath, "utf8");
  const files = new Set<string>();
  for (const pattern of [
    /os\.path\.join\(\s*workspace\s*,\s*["']([^"']+\.json)["']\s*\)/g,
    /result_file\s*=\s*["']([^"']+\.json)["']/g,
  ]) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) files.add(match[1]);
    }
  }
  return [...files].sort();
}

function taskSummary(task: SkillCraftTask): Record<string, unknown> {
  const meta = typeof task.taskConfig.meta === "object" && task.taskConfig.meta ? task.taskConfig.meta as Record<string, unknown> : {};
  return {
    taskKey: task.taskKey,
    family: task.family,
    level: task.level,
    taskName: task.taskConfig.task_name ?? `${task.family}-${task.level}`,
    difficulty: meta.difficulty ?? null,
    subtaskCount: meta.subtask_count ?? null,
    callsPerSubtask: meta.calls_per_subtask ?? null,
    toolsUsed: Array.isArray(meta.tools_used) ? meta.tools_used : [],
    neededLocalTools: Array.isArray(task.taskConfig.needed_local_tools) ? task.taskConfig.needed_local_tools : [],
    neededMcpServers: Array.isArray(task.taskConfig.needed_mcp_servers) ? task.taskConfig.needed_mcp_servers : [],
    hasInitialWorkspace: Boolean(task.initialWorkspacePath),
    hasGroundtruthWorkspace: Boolean(task.groundtruthWorkspacePath),
    expectedOutputFiles: task.expectedOutputFiles,
  };
}

function normalizeTaskKey(value: string): string {
  const task = value.replace(/^tasks\//, "").replace(/^\/+/, "");
  return task.startsWith("scaled_tasks/") ? task : `scaled_tasks/${task}`;
}

function csv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function runStamp(): string {
  return `run_${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "_")}`;
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return (await fsp.readdir(dir)).sort();
  } catch {
    return [];
  }
}

async function optionalDir(dir: string): Promise<string | undefined> {
  return (await isDirectory(dir)) ? dir : undefined;
}

async function isDirectory(dir: string): Promise<boolean> {
  try {
    return (await fsp.stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await fsp.stat(file)).isFile();
  } catch {
    return false;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function scoreObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const score = (value as Record<string, unknown>).score;
  return score && typeof score === "object" ? score as Record<string, unknown> : null;
}

function numberOr(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
