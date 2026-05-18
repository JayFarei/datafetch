// FinChain full evaluation runner — parallels src/eval/skillcraftFullDatafetch.ts.
//
// Iter 2b SCOPE (this file as-of commit): argument parsing, mount
// construction via buildFinChainMount (from finchainRecords.ts), per-episode
// workspace setup, run-info + planned-tasks artifact writes, --dry-run flow,
// --fixture-smoke flow. Agent invocation (claude / codex / codex-direct) is
// scaffolded with an explicit "not implemented" path that iter 2c fills in.
// Trajectory + scoring + lib-cache hydrate / persist also land in iter 2c.
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
// Shared logic could be extracted in a future refactor; iter 2b keeps the
// two files independent to avoid touching SkillCraft surface area (FC5
// non-regression invariant).

import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildFinChainMount,
  defaultIntrospectorPaths,
  familyForTopic,
  introspectTemplate,
  type FinChainTemplateInstance,
} from "./finchainRecords.js";

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

  const agentBackend = resolveAgentBackend();
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
    // iter 2c lands the agent backend integrations + per-episode trajectory
    // write + observer install. Until then, surface the explicit gap.
    throw new Error(
      [
        "FinChain --live agent invocation is wired in iter 2c.",
        "Iter 2b ships the runner skeleton (argument parsing, planner, mount integration via --fixture-smoke).",
        "Re-run with --dry-run or --fixture-smoke to exercise the iter 2b surface.",
      ].join(" "),
    );
  }

  throw new Error(
    [
      "FinChain runner default execution path (agent loop) is not implemented in iter 2b.",
      "Use --dry-run to inspect the planner, --fixture-smoke to exercise the mount integration,",
      "or wait for iter 2c which lands the agent backend.",
    ].join(" "),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

// expose internals for tests + iter 2c
export { parseArgs, planEpisodes, discoverTopics, LEVEL_BY_TEMPLATE_POSITION };
export type { Args, PlannedEpisode, RunInfo };
