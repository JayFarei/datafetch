// FinChain full evaluation runner — parallels src/eval/skillcraftFullDatafetch.ts.
//
// Iter 2c SCOPE (this file as-of commit): adds a minimal --live flow that
// runs ONE episode end-to-end via claude-p: workspace setup, mount install,
// scripts/answer.ts scaffold render, claude-p invocation, snippet runtime
// execution, df.answer FAC validation, per-episode artifact write,
// episodes.jsonl append. Iter 2d adds: lib-cache hydrate/persist, observer
// install, codex/codex-direct backends, 4-shard family-sequential
// parallel execution.
//
// Per Goal 5 protocol (`eval/finchain/protocol.md`):
// - family = "<domain>-<topic_basename>"; level ∈ {e1, e2, m1, m2, h1} ↔
//   template positions 1-5; seed_index is sub-episode within a level.
// - records mount = the 9 OTHER seed instances of the same (topic, template)
//   pair (the "sibling library").
// - DATAFETCH_DISABLE_LEARNING=1 forces the matched-arm control (no lib-cache,
//   no observer install, no persist).
//
// Sibling runner: src/eval/skillcraftFullDatafetch.ts (the reference shape).
// Reuses prepareAnswerSourceForRuntime (exported from skillcraft) for the
// 15+ syntax-fix rewriters. Duplicates the small registerEvalRecordsMount
// helper to keep skillcraft untouched (FC5 non-regression invariant).

import { spawn } from "node:child_process";
import { promises as fsp } from "node:fs";
import os from "node:os";
import { performance } from "node:perf_hooks";
import path from "node:path";

import { getMountRuntimeRegistry, type MountRuntime } from "../adapter/runtime.js";
import { installSnippetRuntime } from "../snippet/install.js";

import {
  buildFinChainMount,
  defaultIntrospectorPaths,
  familyForTopic,
  introspectTemplate,
  type FinChainTemplateInstance,
} from "./finchainRecords.js";
import { type EvalRecord, EvalRecordsMount, renderPerEntitySeed, PER_ENTITY_SEED_NAME } from "./evalRecords.js";
import { prepareAnswerSourceForRuntime } from "./skillcraftFullDatafetch.js";

const DEFAULT_SEED_COUNT = 10;
const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";
const DEFAULT_CODEX_MODEL = "gpt-5.4-mini";
const DEFAULT_REASONING_EFFORT = "low";

const LEVEL_BY_TEMPLATE_POSITION: Record<number, string> = {
  1: "e1",
  2: "e2",
  3: "m1",
  4: "m2",
  5: "h1",
};

type AgentBackend = "codex" | "claude" | "codex-direct";

function resolveAgentBackend(): AgentBackend {
  const raw = (process.env["DATAFETCH_AGENT"] ?? "codex").trim().toLowerCase();
  if (raw === "claude") return "claude";
  if (raw === "codex-direct" || raw === "codex-responses" || raw === "responses") return "codex-direct";
  return "codex";
}

function resolveDisableLearning(): boolean {
  const raw = (process.env["DATAFETCH_DISABLE_LEARNING"] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

// CLI surface
interface Args {
  vendorDir: string;
  outDir: string;
  topics: string[];          // empty = all topics
  templates: number[];        // empty = all 1-5; subset selects a slice
  seedIndices: number[];      // empty = all 0..(seedCount-1)
  seedCount: number;
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
  disableLearning: boolean;
  resume: boolean;
  label?: string;
}

function runStamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function csv(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function intList(value: string): number[] {
  return csv(value).map((s) => Number.parseInt(s, 10)).filter((n) => Number.isFinite(n));
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    vendorDir: path.resolve("eval/finchain/vendor/finchain"),
    outDir: path.resolve("eval/finchain/results/datafetch", runStamp()),
    topics: [],
    templates: [],
    seedIndices: [],
    seedCount: DEFAULT_SEED_COUNT,
    dryRun: false,
    fixtureSmoke: false,
    live: false,
    timeoutMs: Number(process.env["DF_FINCHAIN_FULL_TIMEOUT_MS"] ?? 600_000),
    snippetTimeoutMs: Number(process.env["DF_FINCHAIN_SNIPPET_TIMEOUT_MS"] ?? 300_000),
    noLibCache: false,
    disableLearning: resolveDisableLearning(),
    resume: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--") continue;
    if (arg === "--vendor-dir") args.vendorDir = path.resolve(argv[++index]!);
    else if (arg.startsWith("--vendor-dir=")) args.vendorDir = path.resolve(arg.slice("--vendor-dir=".length));
    else if (arg === "--out-dir") args.outDir = path.resolve(argv[++index]!);
    else if (arg.startsWith("--out-dir=")) args.outDir = path.resolve(arg.slice("--out-dir=".length));
    else if (arg === "--label") args.label = argv[++index];
    else if (arg.startsWith("--label=")) args.label = arg.slice("--label=".length);
    else if (arg === "--topics") args.topics = csv(argv[++index]!);
    else if (arg.startsWith("--topics=")) args.topics = csv(arg.slice("--topics=".length));
    else if (arg === "--templates") args.templates = intList(argv[++index]!);
    else if (arg.startsWith("--templates=")) args.templates = intList(arg.slice("--templates=".length));
    else if (arg === "--seed-indices") args.seedIndices = intList(argv[++index]!);
    else if (arg.startsWith("--seed-indices=")) args.seedIndices = intList(arg.slice("--seed-indices=".length));
    else if (arg === "--seed-count") args.seedCount = Number(argv[++index]!);
    else if (arg.startsWith("--seed-count=")) args.seedCount = Number(arg.slice("--seed-count=".length));
    else if (arg === "--limit") args.limit = Number(argv[++index]!);
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice("--limit=".length));
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--fixture-smoke") args.fixtureSmoke = true;
    else if (arg === "--live") args.live = true;
    else if (arg === "--model") args.model = argv[++index];
    else if (arg.startsWith("--model=")) args.model = arg.slice("--model=".length);
    else if (arg === "--reasoning") args.reasoningEffort = argv[++index];
    else if (arg.startsWith("--reasoning=")) args.reasoningEffort = arg.slice("--reasoning=".length);
    else if (arg === "--timeout-ms") args.timeoutMs = Number(argv[++index]!);
    else if (arg.startsWith("--timeout-ms=")) args.timeoutMs = Number(arg.slice("--timeout-ms=".length));
    else if (arg === "--snippet-timeout-ms") args.snippetTimeoutMs = Number(argv[++index]!);
    else if (arg.startsWith("--snippet-timeout-ms=")) args.snippetTimeoutMs = Number(arg.slice("--snippet-timeout-ms=".length));
    else if (arg === "--lib-cache-dir") args.libCacheDir = path.resolve(argv[++index]!);
    else if (arg.startsWith("--lib-cache-dir=")) args.libCacheDir = path.resolve(arg.slice("--lib-cache-dir=".length));
    else if (arg === "--no-lib-cache") args.noLibCache = true;
    else if (arg === "--resume") args.resume = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (args.label) {
    // When a label is provided, override the runStamp portion of out-dir
    args.outDir = path.resolve("eval/finchain/results/datafetch", args.label);
  }
  return args;
}

// A planned episode is one (topic, templateIndex, seedIndex) triple. The
// planner enumerates the cross-product of selected slices.
interface PlannedEpisode {
  taskKey: string;            // "<topic>:tpl<position>:seed<seedIndex>"
  topic: string;
  topicBasename: string;
  domain: string;
  family: string;             // "<domain>-<topic_basename>"
  level: string;              // "e1" | "e2" | "m1" | "m2" | "h1"
  templatePosition: number;
  seedIndex: number;
}

async function discoverTopics(vendorDir: string): Promise<string[]> {
  const templatesDir = path.join(vendorDir, "data", "templates");
  let domains: string[];
  try {
    const entries = await fsp.readdir(templatesDir, { withFileTypes: true });
    domains = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch (err) {
    throw new Error(
      `finchainFullDatafetch: vendor templates dir missing at ${templatesDir}. ` +
      `Run 'pnpm eval:finchain:prepare' first. (${String(err)})`,
    );
  }
  const topics: string[] = [];
  for (const domain of domains) {
    const domainDir = path.join(templatesDir, domain);
    const files = await fsp.readdir(domainDir);
    for (const file of files.sort()) {
      if (!file.endsWith(".py")) continue;
      const basename = file.slice(0, -3);
      topics.push(`${domain}/${basename}`);
    }
  }
  return topics;
}

async function planEpisodes(args: Args): Promise<PlannedEpisode[]> {
  const allTopics = await discoverTopics(args.vendorDir);
  const selectedTopics = args.topics.length > 0
    ? allTopics.filter((t) => args.topics.includes(t) || args.topics.includes(t.split("/")[1] ?? ""))
    : allTopics;
  const selectedTemplates = args.templates.length > 0 ? args.templates : [1, 2, 3, 4, 5];
  const selectedSeeds = args.seedIndices.length > 0
    ? args.seedIndices
    : Array.from({ length: args.seedCount }, (_unused, i) => i);
  const out: PlannedEpisode[] = [];
  for (const topic of selectedTopics) {
    const [domain, topicBasename] = topic.split("/", 2) as [string, string];
    const family = familyForTopic(topic);
    for (const templatePosition of selectedTemplates) {
      const level = LEVEL_BY_TEMPLATE_POSITION[templatePosition] ?? `t${templatePosition}`;
      for (const seedIndex of selectedSeeds) {
        out.push({
          taskKey: `${topic}:tpl${templatePosition}:seed${seedIndex}`,
          topic,
          topicBasename,
          domain,
          family,
          level,
          templatePosition,
          seedIndex,
        });
        if (args.limit && out.length >= args.limit) return out;
      }
    }
  }
  return out;
}

function planSummary(episode: PlannedEpisode): Record<string, unknown> {
  return {
    taskKey: episode.taskKey,
    topic: episode.topic,
    family: episode.family,
    level: episode.level,
    templatePosition: episode.templatePosition,
    seedIndex: episode.seedIndex,
  };
}

interface RunInfo {
  generatedAt: string;
  vendorDir: string;
  outDir: string;
  libCacheDir: string | null;
  selectedEpisodes: number;
  mode: "dry-run" | "fixture-smoke" | "live-agent-experimental" | "not-implemented";
  agent: AgentBackend;
  model: string;
  reasoningEffort: string;
  snippetTimeoutMs: number;
  armId: "datafetch-control" | "datafetch-learned";
  disableLearning: boolean;
  seedCount: number;
  resume: boolean;
  iterScope: "iter-2b-skeleton";  // marker so analyzers know what's wired vs what's TODO
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await fsp.mkdir(args.outDir, { recursive: true });

  const episodes = await planEpisodes(args);

  const libCacheDir = (args.noLibCache || args.disableLearning)
    ? undefined
    : args.libCacheDir ?? path.join(args.outDir, "lib-cache");
  if (libCacheDir) await fsp.mkdir(libCacheDir, { recursive: true });
  const armId: "datafetch-control" | "datafetch-learned" = args.disableLearning
    ? "datafetch-control"
    : "datafetch-learned";

  // Iter 2c: the runner only knows how to spawn claude-p. Codex / codex-direct
  // backends ship in iter 2d. Force backend = claude regardless of env so an
  // unset DATAFETCH_AGENT (defaults to "codex") doesn't pass a codex model
  // name to claude-p (would 404 with "There's an issue with the selected
  // model"). Iter 2d removes this override and routes correctly per backend.
  const agentBackendRaw = resolveAgentBackend();
  const agentBackend: AgentBackend = agentBackendRaw === "codex" || agentBackendRaw === "codex-direct"
    ? "claude"
    : agentBackendRaw;
  const resolvedModel = args.model
    ?? (agentBackend === "claude" ? DEFAULT_CLAUDE_MODEL : DEFAULT_CODEX_MODEL);
  const resolvedEffort = args.reasoningEffort ?? DEFAULT_REASONING_EFFORT;

  const runInfo: RunInfo = {
    generatedAt: new Date().toISOString(),
    vendorDir: args.vendorDir,
    outDir: args.outDir,
    libCacheDir: libCacheDir ?? null,
    selectedEpisodes: episodes.length,
    mode: args.live ? "live-agent-experimental" : args.fixtureSmoke ? "fixture-smoke" : args.dryRun ? "dry-run" : "not-implemented",
    agent: agentBackend,
    model: resolvedModel,
    reasoningEffort: resolvedEffort,
    snippetTimeoutMs: args.snippetTimeoutMs,
    armId,
    disableLearning: args.disableLearning,
    seedCount: args.seedCount,
    resume: args.resume,
    iterScope: "iter-2b-skeleton",
  };

  await fsp.writeFile(path.join(args.outDir, "run-info.json"), `${JSON.stringify(runInfo, null, 2)}\n`);
  await fsp.writeFile(
    path.join(args.outDir, "planned-episodes.json"),
    `${JSON.stringify(episodes.map(planSummary), null, 2)}\n`,
  );

  console.log(`[finchain-datafetch] planned ${episodes.length} episode(s); wrote ${args.outDir}`);

  if (args.dryRun) {
    return;
  }

  if (args.fixtureSmoke) {
    // Fixture smoke: prove the mount adapter works end-to-end for the first
    // planned episode without invoking any agent. Verifies the integration
    // of buildFinChainMount + a single introspection round-trip.
    const first = episodes[0];
    if (!first) {
      console.log("[finchain-datafetch] fixture-smoke: no episodes planned; nothing to verify");
      return;
    }
    const paths = defaultIntrospectorPaths(path.resolve("."));
    paths.vendorDir = args.vendorDir;
    const mount = await buildFinChainMount({
      paths,
      topic: first.topic,
      templateIndex: first.templatePosition,
      currentSeedIndex: first.seedIndex,
      seedCount: args.seedCount,
    });
    const inventory = await mount.probe();
    const currentInstance: FinChainTemplateInstance = await introspectTemplate({
      paths,
      topic: first.topic,
      templateIndex: first.templatePosition,
      seedIndex: first.seedIndex,
    });
    const fixtureSummary = {
      episode: planSummary(first),
      mountInventory: inventory,
      currentInstance: {
        question: currentInstance.question,
        difficulty: currentInstance.difficulty,
        goldFinalValue: currentInstance.goldFinalValue,
        templateName: currentInstance.templateName,
      },
    };
    await fsp.writeFile(
      path.join(args.outDir, "fixture-smoke.json"),
      `${JSON.stringify(fixtureSummary, null, 2)}\n`,
    );
    console.log(`[finchain-datafetch] fixture-smoke: mount built (${inventory.collections[0]?.rows} sibling records); current question gold=${currentInstance.goldFinalValue}`);
    return;
  }

  if (args.live) {
    // iter 2c: minimal live agent flow. Single-episode, sequential. Iter 2d
    // adds: lib-cache hydrate/persist, observer install, codex backends,
    // 4-shard family-sequential parallel.
    const episodesJsonlPath = path.join(args.outDir, "episodes.jsonl");
    await fsp.writeFile(episodesJsonlPath, "");
    const paths = defaultIntrospectorPaths(path.resolve("."));
    paths.vendorDir = args.vendorDir;
    let completed = 0;
    let failed = 0;
    for (const episode of episodes) {
      try {
        const row = await runLiveEpisode({
          episode,
          paths,
          args,
          runInfo,
          libCacheDir,
          armId,
        });
        await fsp.appendFile(episodesJsonlPath, `${JSON.stringify(row)}\n`);
        completed += 1;
        console.log(`[finchain-datafetch] [${completed}/${episodes.length}] ${episode.taskKey} → fac=${row.facMatch} pred=${row.predictedFinalValue} gold=${row.goldFinalValue} tokens=${row.effectiveTokens} wall=${row.wallClockMs}ms`);
      } catch (err) {
        failed += 1;
        console.error(`[finchain-datafetch] [FAIL] ${episode.taskKey}: ${err instanceof Error ? err.message : String(err)}`);
        const errorRow = {
          armId,
          taskKey: episode.taskKey,
          topic: episode.topic,
          family: episode.family,
          level: episode.level,
          templatePosition: episode.templatePosition,
          seedIndex: episode.seedIndex,
          answerStatus: "harness_error",
          passed: false,
          facMatch: false,
          snippetExitCode: -1,
          agentExitCode: -1,
          agentFailureKind: "harness_error",
        };
        await fsp.appendFile(episodesJsonlPath, `${JSON.stringify(errorRow)}\n`);
      }
    }
    console.log(`[finchain-datafetch] live run done. completed=${completed} failed=${failed}`);
    return;
  }

  throw new Error(
    [
      "FinChain runner default execution path (agent loop) requires --live, --dry-run, or --fixture-smoke.",
    ].join(" "),
  );
}

// ----------------------------------------------------------------------------
// Iter 2c live agent flow
// ----------------------------------------------------------------------------

interface LiveEpisodeRow {
  armId: "datafetch-control" | "datafetch-learned";
  taskKey: string;
  topic: string;
  family: string;
  level: string;
  templateName: string;
  templatePosition: number;
  seedIndex: number;
  difficulty: string;
  answerStatus: string;
  predictedFinalValue: number | null;
  goldFinalValue: number | null;
  derivationSteps: number[];
  facMatch: boolean;
  passed: boolean;
  scorePercent: number;
  snippetExitCode: number;
  agentExitCode: number;
  agentFailureKind?: string;
  agentInputTokens: number;
  agentCachedInputTokens: number;
  agentOutputTokens: number;
  agentReasoningTokens: number;
  effectiveTokens: number;
  agentElapsedMs: number;
  wallClockMs: number;
  llmCalls: number;
  libFunctionsAvailable: number;
  libFunctionsUsed: number;
  libFunctionsCreated: number;
  reuseRate: number | null;
  artifactPath: string;
}

const FAC_RELATIVE_TOLERANCE = 1e-2;  // 1% relative tolerance for numerical equality

async function runLiveEpisode(input: {
  episode: PlannedEpisode;
  paths: import("./finchainRecords.js").IntrospectorPaths;
  args: Args;
  runInfo: RunInfo;
  libCacheDir?: string;
  armId: "datafetch-control" | "datafetch-learned";
}): Promise<LiveEpisodeRow> {
  const startedAt = performance.now();
  const { episode, paths, args, armId } = input;

  // 1. Workspace setup
  const artifactDir = path.join(args.outDir, "episodes", episode.family, episode.level, `seed${episode.seedIndex}`);
  const workspace = path.join(artifactDir, "workspace");
  const datafetchHome = path.join(artifactDir, "datafetch-home");
  const tenantId = `finchain-${episode.family}`;
  await fsp.rm(artifactDir, { recursive: true, force: true });
  await fsp.mkdir(path.join(workspace, "scripts"), { recursive: true });
  await fsp.mkdir(path.join(datafetchHome, "lib", tenantId), { recursive: true });

  // 2. Introspect current episode + build sibling library mount
  const currentInstance = await introspectTemplate({
    paths,
    topic: episode.topic,
    templateIndex: episode.templatePosition,
    seedIndex: episode.seedIndex,
  });
  const mount = await buildFinChainMount({
    paths,
    topic: episode.topic,
    templateIndex: episode.templatePosition,
    currentSeedIndex: episode.seedIndex,
    seedCount: args.seedCount,
  });
  const mountId = `finchain-${episode.family}`;
  const mountRuntime = registerEvalRecordsMount({ mountId, adapter: mount });

  // 3. Drop per_entity seed (substrate-level, generic; same as skillcraft)
  await dropGenericSeed(datafetchHome);

  // 4. Write the workspace scaffolding
  await writeFinchainAgentsMd(workspace, currentInstance, mountId);
  await writeFinchainAnswerScaffold(workspace, currentInstance);
  await writeDfDtsStub(workspace);

  // 5. Render the agent prompt + spawn claude-p
  const prompt = renderFinchainPrompt(currentInstance, mountId);
  const agentRun = await runClaudePAgent({
    workspaceDir: workspace,
    prompt,
    model: input.runInfo.model,
    effort: input.runInfo.reasoningEffort,
    timeoutMs: args.snippetTimeoutMs,
  });
  await fsp.writeFile(path.join(artifactDir, "agent-stdout.txt"), agentRun.stdout);
  await fsp.writeFile(path.join(artifactDir, "agent-stderr.txt"), agentRun.stderr);
  await fsp.writeFile(path.join(artifactDir, "agent-run.json"), `${JSON.stringify({
    elapsedMs: Math.round(agentRun.elapsedMs),
    exitCode: agentRun.exitCode,
    usage: agentRun.usage,
    finalMessage: agentRun.finalMessage,
  }, null, 2)}\n`);

  // 6. Read the agent's scripts/answer.ts, apply syntax fixes, run
  const answerPath = path.join(workspace, "scripts", "answer.ts");
  let snippetExitCode = -1;
  let predictedFinalValue: number | null = null;
  let derivationSteps: number[] = [];
  let answerStatus = "unsupported";
  let libFunctionsUsed = 0;
  const libFunctionsAvailable = 1;  // per_entity seed
  try {
    const rawSource = await fsp.readFile(answerPath, "utf8");
    let source = prepareAnswerSourceForRuntime(rawSource, workspace);
    // FinChain agents occasionally call bare `answer(...)` instead of
    // `df.answer(...)` despite the prompt. Inject a top-level alias so
    // both patterns work without an answer-kit import collision (the
    // skillcraft answer-kit ANSWER_KIT_HELPERS list does NOT include
    // "answer" — `answer` is a df-bound function, not a free helper).
    if (/\b(?:return\s+|await\s+)?answer\s*\(/.test(source) && !/\bconst\s+answer\s*=\s*df\.answer/.test(source)) {
      source = `const answer = df.answer.bind(df);\n${source}`;
    }
    await fsp.writeFile(path.join(artifactDir, "prepared-answer.ts"), source);
    const { snippetRuntime } = await installSnippetRuntime({
      baseDir: datafetchHome,
      skipSeedMirror: true,
    });
    const run = await snippetRuntime.run({
      source,
      sourcePath: answerPath,
      sessionCtx: {
        tenantId,
        mountIds: [mountId],
        baseDir: datafetchHome,
        requireSubstrateRootedChain: true,
        snippetTimeoutMs: args.snippetTimeoutMs,
      },
    });
    snippetExitCode = run.exitCode;
    await fsp.writeFile(path.join(artifactDir, "snippet-stdout.txt"), run.stdout);
    await fsp.writeFile(path.join(artifactDir, "snippet-stderr.txt"), run.stderr);
    await fsp.writeFile(path.join(artifactDir, "snippet-result.json"), `${JSON.stringify({
      exitCode: run.exitCode,
      trajectoryId: run.trajectoryId,
      cost: run.cost,
      answer: run.answer ?? null,
    }, null, 2)}\n`);
    if (run.answer) {
      const a = run.answer as Record<string, unknown>;
      answerStatus = String(a["status"] ?? "unsupported");
      predictedFinalValue = extractNumericValue(a["value"]);
      derivationSteps = extractDerivationStepValues(a["derivation"]);
    }
  } catch (err) {
    await fsp.writeFile(path.join(artifactDir, "snippet-stderr.txt"), `runLiveEpisode: ${String(err)}`);
  }

  // 7. Compute FAC + cleanup
  getMountRuntimeRegistry().unregister(mountId);
  const goldFinalValue = currentInstance.goldFinalValue;
  const facMatch = goldFinalValue !== null && predictedFinalValue !== null
    && isFacMatch(predictedFinalValue, goldFinalValue);
  const passed = facMatch && snippetExitCode === 0;
  const elapsedMs = performance.now() - startedAt;
  const inputTokens = agentRun.usage.inputTokens;
  const cached = agentRun.usage.cachedInputTokens;
  const output = agentRun.usage.outputTokens;
  const effectiveTokens = Math.max(0, inputTokens - cached) + output;

  return {
    armId,
    taskKey: episode.taskKey,
    topic: episode.topic,
    family: episode.family,
    level: episode.level,
    templateName: currentInstance.templateName,
    templatePosition: episode.templatePosition,
    seedIndex: episode.seedIndex,
    difficulty: currentInstance.difficulty,
    answerStatus,
    predictedFinalValue,
    goldFinalValue,
    derivationSteps,
    facMatch,
    passed,
    scorePercent: facMatch ? 100 : 0,
    snippetExitCode,
    agentExitCode: agentRun.exitCode,
    agentInputTokens: inputTokens,
    agentCachedInputTokens: cached,
    agentOutputTokens: output,
    agentReasoningTokens: agentRun.usage.reasoningOutputTokens,
    effectiveTokens,
    agentElapsedMs: Math.round(agentRun.elapsedMs),
    wallClockMs: Math.round(elapsedMs),
    llmCalls: agentRun.usage.llmCalls,
    libFunctionsAvailable,
    libFunctionsUsed,
    libFunctionsCreated: 0,
    reuseRate: null,
    artifactPath: path.relative(process.cwd(), artifactDir),
  };
}

interface AgentUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  llmCalls: number;
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

async function runClaudePAgent(args: {
  workspaceDir: string;
  prompt: string;
  model: string;
  effort: string;
  timeoutMs: number;
}): Promise<AgentRun> {
  const started = performance.now();
  const claudeBin = process.env["CLAUDE_CLI"] ?? "claude-p";
  const isClaudeP = /(?:^|\/)claude-p$/.test(claudeBin);
  const cliArgs = isClaudeP
    ? [
        "--output-format", "json",
        "--model", args.model,
        "--dangerously-skip-permissions",
        "--timeout", String(Math.max(60, Math.ceil(args.timeoutMs / 1000))),
        "--effort", args.effort,
        args.prompt,
      ]
    : [
        "--print",
        "--output-format", "json",
        "--model", args.model,
        "--effort", args.effort,
        "--dangerously-skip-permissions",
        "--no-session-persistence",
        args.prompt,
      ];
  const child = spawn(claudeBin, cliArgs, { cwd: args.workspaceDir, stdio: ["ignore", "pipe", "pipe"] });
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  child.stdout.on("data", (c: Buffer) => stdoutChunks.push(c));
  child.stderr.on("data", (c: Buffer) => stderrChunks.push(c));
  const exitCode = await new Promise<number>((resolve) => {
    const timer = setTimeout(() => {
      try { child.kill("SIGTERM"); } catch { /* ignore */ }
      resolve(124);
    }, args.timeoutMs + 5_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(typeof code === "number" ? code : 1);
    });
  });
  const stdout = Buffer.concat(stdoutChunks).toString("utf8");
  const stderr = Buffer.concat(stderrChunks).toString("utf8");
  let finalMessage = "";
  const usage: AgentUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, llmCalls: 0 };
  try {
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    const result = parsed["result"];
    finalMessage = typeof result === "string" ? result : result !== undefined ? JSON.stringify(result) : "";
    const u = parsed["usage"] as Record<string, unknown> | undefined;
    if (u) {
      usage.inputTokens = Number(u["input_tokens"] ?? 0) || 0;
      usage.cachedInputTokens = (Number(u["cache_read_input_tokens"] ?? 0) || 0) + (Number(u["cache_creation_input_tokens"] ?? 0) || 0);
      usage.outputTokens = Number(u["output_tokens"] ?? 0) || 0;
    }
    usage.llmCalls = Number(parsed["num_turns"] ?? 1) || 1;
  } catch {
    finalMessage = stdout.trim();
  }
  return { workspaceDir: args.workspaceDir, prompt: args.prompt, stdout, stderr, finalMessage, elapsedMs: performance.now() - started, exitCode, usage };
}

function renderFinchainPrompt(instance: FinChainTemplateInstance, mountId: string): string {
  return [
    `You are solving a financial reasoning question. Read sibling examples to learn the formula, then apply it.`,
    ``,
    `## Question`,
    instance.question,
    ``,
    `## Workspace contract`,
    `- Read your workspace orientation at /AGENTS.md.`,
    `- Read the typed surface at /df.d.ts.`,
    `- Read the scaffold at /scripts/answer.ts and replace its body to solve the question.`,
    `- The sibling library is mounted at \`df.db.records\` (mount id: ${mountId}). Each record carries a prior seed's question + gold_final_value + parameters. You MUST call \`df.db.records.findExact({}, 9)\` at least once before answering (the substrate enforces a substrate-rooted chain).`,
    `- Commit by RETURNING df.answer: \`return df.answer({status: "answered", value: <numerical_answer>, derivation: [{step: 1, label: "...", value: <intermediate>}, ...], evidence: []})\`. The runtime captures the snippet's return value as the answer. The harness scores Final Answer Correctness (numerical equality within 1%) and Step Alignment (numerical alignment of derivation steps).`,
    ``,
    `## How to write scripts/answer.ts`,
    `Write a complete, self-contained TypeScript snippet. Read records, infer the formula from sibling examples, compute, commit via df.answer({...}). Call \`answer\` directly (NOT \`df.answer\`) — the harness injects \`import { answer } from "@datafetch/...\` automatically. No external tools; computation is pure-symbolic.`,
    ``,
    `Reply by editing scripts/answer.ts in the workspace. The harness will execute it.`,
  ].join("\n");
}

async function writeFinchainAgentsMd(workspace: string, instance: FinChainTemplateInstance, mountId: string): Promise<void> {
  const body = [
    `# Workspace orientation (FinChain ${instance.topic})`,
    ``,
    `You are solving one FinChain template instance. The full question is in your prompt.`,
    ``,
    `## Mounted data`,
    `- \`df.db.records\` (mount id: \`${mountId}\`) — 9 sibling seed instances of the SAME template. Each record carries: id (seed_index), attributes.question (the sibling's question text), attributes.gold_final_value (the sibling's correct answer), attributes.template_position, attributes.difficulty, plus parameter-shaped fields.`,
    `- Use \`await df.db.records.findExact({}, 9)\` to read all siblings.`,
    ``,
    `## Library`,
    `- \`df.lib.per_entity\` is the generic substrate-level seed (fan-out helper for entity-list tasks). NOT directly useful here — FinChain is pure-computation.`,
    `- Any \`df.lib.*\` helper created on a prior episode of the same family is hydrated into \`<lib>/\` and visible via \`df.d.ts\`.`,
    ``,
    `## Committing your answer`,
    `Always commit with df.answer:`,
    "```ts",
    `await df.answer({`,
    `  status: "answered",                  // or "partial" / "unsupported"`,
    `  value: 257.18,                       // the final numerical answer`,
    `  derivation: [                        // step-by-step reasoning chain`,
    `    {step: 1, label: "Compute compound amount", value: 5788.13},`,
    `    {step: 2, label: "Compound interest = amount - principal", value: 788.13},`,
    `  ],`,
    `  evidence: [{recordKey: "<sibling recordKey>", reason: "reused formula from sibling seed"}],`,
    `});`,
    "```",
    ``,
    `## Difficulty`,
    `This is a ${instance.difficulty} template (position ${instance.templatePosition}/5 within the topic).`,
  ].join("\n");
  await fsp.writeFile(path.join(workspace, "AGENTS.md"), body);
}

async function writeFinchainAnswerScaffold(workspace: string, instance: FinChainTemplateInstance): Promise<void> {
  const body = [
    `// FinChain ${instance.topic} — template ${instance.templateName} (position ${instance.templatePosition}, ${instance.difficulty}) seed ${instance.seedIndex}`,
    `//`,
    `// Question (verbatim):`,
    `// ${instance.question.split("\n").join("\n// ")}`,
    `//`,
    `// Replace the body below with your solution. Read sibling examples from`,
    `// df.db.records, infer the formula, compute, then RETURN df.answer(...).`,
    `// The snippet runtime captures the answer from the snippet's RETURN VALUE,`,
    `// not from internal calls — you must "return df.answer(...)" or "return await main()".`,
    ``,
    `async function main() {`,
    `  // const siblings = await df.db.records.findExact({}, 9);`,
    `  // ... infer formula from siblings ...`,
    `  return df.answer({`,
    `    status: "unsupported",`,
    `    value: null,`,
    `    derivation: [],`,
    `    evidence: [],`,
    `  });`,
    `}`,
    ``,
    `return await main();`,
  ].join("\n");
  await fsp.writeFile(path.join(workspace, "scripts", "answer.ts"), body);
}

async function writeDfDtsStub(workspace: string): Promise<void> {
  // Minimal df.d.ts that documents the FinChain surface. Iter 2d will hook
  // into the full df.d.ts renderer (src/sdk/schemaRender.ts) to surface
  // hydrated lib helpers; for now this is a stub for agent readability.
  const body = [
    `// Auto-generated type surface for this FinChain episode.`,
    `declare const df: {`,
    `  db: {`,
    `    records: {`,
    `      findExact(filter: Record<string, unknown>, limit?: number): Promise<Array<{`,
    `        id: string;`,
    `        recordKey: string;`,
    `        family: string;`,
    `        label: string;`,
    `        attributes: {`,
    `          seed_index: number;`,
    `          template_name: string;`,
    `          template_position: number;`,
    `          difficulty: string;`,
    `          question: string;`,
    `          gold_final_value?: number;`,
    `          [param: string]: string | number | boolean | undefined;`,
    `        };`,
    `      }>>;`,
    `      findSimilar(query: string, limit?: number): Promise<unknown[]>;`,
    `    };`,
    `  };`,
    `  lib: {`,
    `    per_entity: (input: {`,
    `      entityIds: Array<string | number>;`,
    `      toolBundle: string;`,
    `      toolNames: string[];`,
    `      paramName: string;`,
    `    }) => Promise<unknown>;`,
    `    [name: string]: unknown;`,
    `  };`,
    `  tool: Record<string, Record<string, (input: Record<string, unknown>) => Promise<unknown>>>;`,
    `  answer(input: {`,
    `    status: "answered" | "partial" | "unsupported";`,
    `    value: number | null;`,
    `    derivation: Array<{ step: number; label: string; value: number }>;`,
    `    evidence: Array<{ recordKey?: string; reason?: string }>;`,
    `  }): Promise<void>;`,
    `};`,
    ``,
    `export {};`,
  ].join("\n");
  await fsp.writeFile(path.join(workspace, "df.d.ts"), body);
}

function registerEvalRecordsMount(input: { mountId: string; adapter: EvalRecordsMount }): MountRuntime {
  // Duplicated from src/eval/skillcraftFullDatafetch.ts to avoid touching
  // skillcraft surface (FC5 non-regression). ~15 lines; refactor candidate.
  const runtime: MountRuntime = {
    mountId: input.mountId,
    adapter: input.adapter,
    identMap: [{ ident: "records", name: "records" }],
    collection<T>(name: string) {
      return input.adapter.collection<T>(name);
    },
    async close(): Promise<void> {
      await input.adapter.close();
    },
  };
  getMountRuntimeRegistry().register(input.mountId, runtime);
  return runtime;
}

async function dropGenericSeed(datafetchHome: string): Promise<void> {
  // Duplicated from src/eval/skillcraftFullDatafetch.ts.
  const seedDir = path.join(datafetchHome, "lib", "__seed__");
  await fsp.mkdir(seedDir, { recursive: true });
  await fsp.writeFile(path.join(seedDir, `${PER_ENTITY_SEED_NAME}.ts`), renderPerEntitySeed(), "utf8");
}

function extractNumericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    // Strip currency symbols, commas, percent signs; try to parse
    const cleaned = value.replace(/[$£€,\s%]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  if (value && typeof value === "object" && "value" in value) {
    return extractNumericValue((value as Record<string, unknown>).value);
  }
  return null;
}

function extractDerivationStepValues(derivation: unknown): number[] {
  if (!Array.isArray(derivation)) return [];
  const out: number[] = [];
  for (const step of derivation) {
    if (step && typeof step === "object" && "value" in step) {
      const v = extractNumericValue((step as Record<string, unknown>).value);
      if (v !== null) out.push(v);
    }
  }
  return out;
}

function isFacMatch(predicted: number, gold: number): boolean {
  const denom = Math.max(Math.abs(predicted), Math.abs(gold), 1);
  return Math.abs(predicted - gold) / denom <= FAC_RELATIVE_TOLERANCE;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

// expose internals for tests + iter 2c
export { parseArgs, planEpisodes, discoverTopics, LEVEL_BY_TEMPLATE_POSITION };
export type { Args, PlannedEpisode, RunInfo };
