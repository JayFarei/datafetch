// CRAG Task-3 finance evaluation runner for the datafetch code-as-agent
// harness. Closely adapts src/eval/finchainFullDatafetch.ts: it mirrors a
// per-question workspace, renders df.d.ts (df.db.records + df.tool.cragFinance
// + df.answer; plus df.lib helpers + observer crystallisation for the learned
// arm), invokes claude-p via stream-json to write scripts/answer.ts calling
// df.answer(...), captures the committed answer, runs the observer to
// crystallise df.lib helpers (learned arm only), and writes per-question
// artifacts + a results JSONL the CRAG 3-way scorer consumes.
//
// Substrate consumer discipline (HARD CONSTRAINTS): this file branches on
// nothing in src/. df.db.records is the generic EvalRecordsMount over the CRAG
// company corpus (src/eval/cragRecords.ts); df.tool.cragFinance is the generic
// Python tool bridge (eval/crag/scripts/crag-tool-runner.py POSTing to the
// FastAPI mock server). No preseeded measured helpers, no helper-name leaks in
// the prompt, no df.answer relaxation. Same model + scorer for both arms; the
// ONLY arm difference is whether the observer attaches and df.lib is exposed.

import { spawn } from "node:child_process";
import { promises as fsp } from "node:fs";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { getMountRuntimeRegistry, type MountRuntime } from "../adapter/runtime.js";
import { installObserver } from "../observer/install.js";
import { installSnippetRuntime } from "../snippet/install.js";

import {
  buildCragCompanyMount,
  CRAG_COMPANY_MOUNT_ID,
} from "./cragRecords.js";
import { type EvalRecordsMount, renderPerEntitySeed, PER_ENTITY_SEED_NAME } from "./evalRecords.js";
import { prepareAnswerSourceForRuntime } from "./skillcraftFullDatafetch.js";

const DEFAULT_QUESTIONS = path.resolve("eval/crag/finance_composable.json");
const DEFAULT_DICT = path.resolve(
  "eval/crag/vendor/CRAG/mock_api/cragkg/finance/company_name.dict",
);
const DEFAULT_TOOL_RUNNER = path.resolve("eval/crag/scripts/crag-tool-runner.py");
const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";
const DEFAULT_REASONING_EFFORT = "low";
const TOOL_BUNDLE = "cragFinance";

type Arm = "cold" | "learned";

interface CragQuestion {
  interaction_id: string;
  query_time: string;
  domain: string;
  question_type: string;
  static_or_dynamic: string;
  query: string;
  answer: string;
  split: number;
  answer_type: "valid" | "invalid" | "no_answer" | string;
}

interface Args {
  questions: string;
  dictPath: string;
  toolRunnerPath: string;
  types: string[];
  limit: number;
  arm: Arm;
  outDir: string;
  model: string;
  reasoningEffort: string;
  snippetTimeoutMs: number;
  python: string;
}

function runStamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function csv(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    questions: DEFAULT_QUESTIONS,
    dictPath: DEFAULT_DICT,
    toolRunnerPath: DEFAULT_TOOL_RUNNER,
    types: ["comparison", "aggregation"],
    limit: 16,
    arm: "cold",
    outDir: path.resolve("runs/code-harness-evals/wf-crag", runStamp()),
    model: DEFAULT_CLAUDE_MODEL,
    reasoningEffort: DEFAULT_REASONING_EFFORT,
    snippetTimeoutMs: Number(process.env["DF_CRAG_SNIPPET_TIMEOUT_MS"] ?? 300_000),
    python: process.env["DATAFETCH_TOOL_PYTHON"]
      ?? path.resolve("eval/crag/vendor/venv311/bin/python"),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--") continue;
    else if (arg === "--questions") args.questions = path.resolve(argv[++i]!);
    else if (arg.startsWith("--questions=")) args.questions = path.resolve(arg.slice("--questions=".length));
    else if (arg === "--dict") args.dictPath = path.resolve(argv[++i]!);
    else if (arg.startsWith("--dict=")) args.dictPath = path.resolve(arg.slice("--dict=".length));
    else if (arg === "--tool-runner") args.toolRunnerPath = path.resolve(argv[++i]!);
    else if (arg.startsWith("--tool-runner=")) args.toolRunnerPath = path.resolve(arg.slice("--tool-runner=".length));
    else if (arg === "--types") args.types = csv(argv[++i]!);
    else if (arg.startsWith("--types=")) args.types = csv(arg.slice("--types=".length));
    else if (arg === "--limit") args.limit = Number(argv[++i]!);
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice("--limit=".length));
    else if (arg === "--arm") args.arm = (argv[++i] as Arm);
    else if (arg.startsWith("--arm=")) args.arm = arg.slice("--arm=".length) as Arm;
    else if (arg === "--out-dir") args.outDir = path.resolve(argv[++i]!);
    else if (arg.startsWith("--out-dir=")) args.outDir = path.resolve(arg.slice("--out-dir=".length));
    else if (arg === "--model") args.model = argv[++i]!;
    else if (arg.startsWith("--model=")) args.model = arg.slice("--model=".length);
    else if (arg === "--reasoning") args.reasoningEffort = argv[++i]!;
    else if (arg.startsWith("--reasoning=")) args.reasoningEffort = arg.slice("--reasoning=".length);
    else if (arg === "--snippet-timeout-ms") args.snippetTimeoutMs = Number(argv[++i]!);
    else if (arg.startsWith("--snippet-timeout-ms=")) args.snippetTimeoutMs = Number(arg.slice("--snippet-timeout-ms=".length));
    else if (arg === "--python") args.python = path.resolve(argv[++i]!);
    else if (arg.startsWith("--python=")) args.python = path.resolve(arg.slice("--python=".length));
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (args.arm !== "cold" && args.arm !== "learned") {
    throw new Error(`--arm must be cold|learned (got ${args.arm})`);
  }
  return args;
}

async function loadQuestions(input: { questions: string; types: string[]; limit: number }): Promise<CragQuestion[]> {
  const raw = await fsp.readFile(input.questions, "utf8");
  const all = JSON.parse(raw) as CragQuestion[];
  const typeSet = new Set(input.types);
  // Stable family order: group by question_type, then by interaction_id, so
  // the learned arm warms crystallised helpers on later same-type siblings.
  const filtered = all
    .filter((q) => typeSet.has(q.question_type))
    .sort((a, b) =>
      a.question_type.localeCompare(b.question_type) ||
      a.interaction_id.localeCompare(b.interaction_id));
  // Bounded slice: take an even split across the requested types where
  // possible so a 16-cap over [comparison, aggregation] yields 8 + 8.
  if (filtered.length <= input.limit) return filtered;
  const perType = Math.max(1, Math.floor(input.limit / Math.max(1, input.types.length)));
  const picked: CragQuestion[] = [];
  for (const t of input.types) {
    const ofType = filtered.filter((q) => q.question_type === t);
    picked.push(...ofType.slice(0, perType));
  }
  // Top up to the limit from the remaining (in stable order) if rounding left room.
  if (picked.length < input.limit) {
    const chosen = new Set(picked.map((q) => q.interaction_id));
    for (const q of filtered) {
      if (picked.length >= input.limit) break;
      if (!chosen.has(q.interaction_id)) picked.push(q);
    }
  }
  return picked
    .slice(0, input.limit)
    .sort((a, b) =>
      a.question_type.localeCompare(b.question_type) ||
      a.interaction_id.localeCompare(b.interaction_id));
}

interface ResultRow {
  arm: Arm;
  interaction_id: string;
  question_type: string;
  answer_type: string;
  query: string;
  gold: string;
  predicted: string | null;
  answerStatus: string;
  snippetExitCode: number;
  agentExitCode: number;
  libFunctionsAvailable: number;
  libFunctionsUsed: number;
  wallClockMs: number;
  artifactPath: string;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  await fsp.mkdir(args.outDir, { recursive: true });
  const questions = await loadQuestions(args);

  const runInfo = {
    generatedAt: new Date().toISOString(),
    questionsPath: args.questions,
    dictPath: args.dictPath,
    toolRunnerPath: args.toolRunnerPath,
    types: args.types,
    limit: args.limit,
    arm: args.arm,
    model: args.model,
    reasoningEffort: args.reasoningEffort,
    selected: questions.length,
    mountId: CRAG_COMPANY_MOUNT_ID,
    toolBundle: TOOL_BUNDLE,
  };
  await fsp.writeFile(path.join(args.outDir, "run-info.json"), `${JSON.stringify(runInfo, null, 2)}\n`);
  await fsp.writeFile(
    path.join(args.outDir, "selected-questions.json"),
    `${JSON.stringify(questions.map((q) => ({ interaction_id: q.interaction_id, question_type: q.question_type, answer_type: q.answer_type, query: q.query })), null, 2)}\n`,
  );

  console.log(`[crag-datafetch] arm=${args.arm} selected ${questions.length} question(s); out=${args.outDir}`);

  // Build the company corpus mount ONCE and register it; reuse across
  // questions. The learned arm shares one datafetch-home so crystallised
  // df.lib helpers persist and can warm-reuse on later questions.
  const mount = await buildCragCompanyMount({ dictPath: args.dictPath, mountId: CRAG_COMPANY_MOUNT_ID });
  const mountId = CRAG_COMPANY_MOUNT_ID;
  registerEvalRecordsMount({ mountId, adapter: mount });

  // Per-arm datafetch-home. The cold arm gets a throwaway home with no
  // observer / no df.lib hydration; the learned arm persists helpers.
  const datafetchHome = path.join(args.outDir, "datafetch-home");
  const tenantId = "crag-finance";
  await fsp.mkdir(path.join(datafetchHome, "lib", tenantId), { recursive: true });
  await dropGenericSeed(datafetchHome);

  const resultsPath = path.join(args.outDir, "results.jsonl");
  await fsp.writeFile(resultsPath, "");

  let completed = 0;
  let failed = 0;
  for (let idx = 0; idx < questions.length; idx += 1) {
    const q = questions[idx]!;
    try {
      const row = await runLiveQuestion({ q, idx, args, mountId, datafetchHome, tenantId });
      await fsp.appendFile(resultsPath, `${JSON.stringify(row)}\n`);
      completed += 1;
      console.log(`[crag-datafetch] [${completed}/${questions.length}] ${q.question_type} ${q.interaction_id} status=${row.answerStatus} pred=${truncate(row.predicted, 40)} gold=${truncate(row.gold, 40)} libUsed=${row.libFunctionsUsed} wall=${row.wallClockMs}ms`);
    } catch (err) {
      failed += 1;
      console.error(`[crag-datafetch] [FAIL] ${q.interaction_id}: ${err instanceof Error ? err.message : String(err)}`);
      const errorRow: ResultRow = {
        arm: args.arm,
        interaction_id: q.interaction_id,
        question_type: q.question_type,
        answer_type: q.answer_type,
        query: q.query,
        gold: q.answer,
        predicted: null,
        answerStatus: "harness_error",
        snippetExitCode: -1,
        agentExitCode: -1,
        libFunctionsAvailable: 0,
        libFunctionsUsed: 0,
        wallClockMs: 0,
        artifactPath: "",
      };
      await fsp.appendFile(resultsPath, `${JSON.stringify(errorRow)}\n`);
    }
  }

  getMountRuntimeRegistry().unregister(mountId);
  console.log(`[crag-datafetch] done. completed=${completed} failed=${failed}. results=${resultsPath}`);
}

function truncate(value: string | null, n: number): string {
  if (value === null) return "null";
  return value.length > n ? `${value.slice(0, n)}…` : value;
}

async function runLiveQuestion(input: {
  q: CragQuestion;
  idx: number;
  args: Args;
  mountId: string;
  datafetchHome: string;
  tenantId: string;
}): Promise<ResultRow> {
  const startedAt = performance.now();
  const { q, idx, args, mountId, datafetchHome, tenantId } = input;
  const learned = args.arm === "learned";

  const artifactDir = path.join(args.outDir, "questions", `${String(idx).padStart(3, "0")}-${q.question_type}-${q.interaction_id}`);
  const workspace = path.join(artifactDir, "workspace");
  await fsp.rm(workspace, { recursive: true, force: true });
  await fsp.mkdir(path.join(workspace, "scripts"), { recursive: true });

  // Count df.lib helpers visible to this question BEFORE it runs (learned
  // arm only; cold arm never hydrates any).
  const libDir = path.join(datafetchHome, "lib", tenantId);
  const learnedHelpers = learned ? await listLibHelpers(libDir) : [];

  // Workspace scaffolding. The agent prompt names NO specific helpers — it
  // only learns the workspace-discovery contract (read AGENTS.md + df.d.ts).
  await writeCragAgentsMd(workspace, q, mountId, learnedHelpers);
  await writeCragAnswerScaffold(workspace, q);
  await writeDfDts(workspace, learnedHelpers, libDir);
  const prompt = renderCragPrompt(q, mountId);

  const agentRun = await runClaudePAgent({
    workspaceDir: workspace,
    prompt,
    model: args.model,
    effort: args.reasoningEffort,
    timeoutMs: args.snippetTimeoutMs,
  });
  await fsp.writeFile(path.join(artifactDir, "agent-stdout.txt"), agentRun.stdout);
  await fsp.writeFile(path.join(artifactDir, "agent-stderr.txt"), agentRun.stderr);
  await fsp.writeFile(
    path.join(artifactDir, "events.jsonl"),
    agentRun.stdout.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("{")).join("\n") + "\n",
  );

  const answerPath = path.join(workspace, "scripts", "answer.ts");
  let snippetExitCode = -1;
  let answerStatus = "unsupported";
  let predicted: string | null = null;
  let libFunctionsUsed = 0;

  try {
    const rawSource = await fsp.readFile(answerPath, "utf8");
    let source = prepareAnswerSourceForRuntime(rawSource, workspace);
    if (/\b(?:return\s+|await\s+)?answer\s*\(/.test(source) && !/\bconst\s+answer\s*=\s*df\.answer/.test(source)) {
      source = `const answer = df.answer.bind(df);\n${source}`;
    }
    await fsp.writeFile(path.join(artifactDir, "prepared-answer.ts"), source);

    const { snippetRuntime } = await installSnippetRuntime({
      baseDir: datafetchHome,
      skipSeedMirror: true,
    });
    // Learned arm: attach the observer so the trajectory crystallises
    // df.lib helpers into <home>/lib/<tenant>/ for later questions.
    // Cold arm: no observer, no crystallisation, no warm reuse.
    const observerHandle = learned
      ? installObserver({ baseDir: datafetchHome, tenantId, snippetRuntime }).observer
      : { observerPromise: new Map<string, Promise<unknown>>() };

    const run = await snippetRuntime.run({
      source,
      sourcePath: answerPath,
      sessionCtx: {
        tenantId,
        mountIds: [mountId],
        baseDir: datafetchHome,
        requireSubstrateRootedChain: true,
        snippetTimeoutMs: args.snippetTimeoutMs,
        toolBridge: {
          datasetDir: path.dirname(args.dictPath),
          bundles: [TOOL_BUNDLE],
          runnerPath: args.toolRunnerPath,
          python: args.python,
          toolTimeoutMs: Number(process.env["DATAFETCH_TOOL_TIMEOUT_MS"] ?? 60_000),
        },
      },
    });
    snippetExitCode = run.exitCode;

    if (run.trajectoryId) {
      const observePromise = observerHandle.observerPromise.get(run.trajectoryId);
      if (observePromise) {
        const deadline = new Promise<void>((resolve) => setTimeout(resolve, 5_000));
        await Promise.race([observePromise.then(() => undefined), deadline]);
      }
    }

    await fsp.writeFile(path.join(artifactDir, "snippet-stdout.txt"), run.stdout);
    await fsp.writeFile(path.join(artifactDir, "snippet-stderr.txt"), run.stderr);
    await fsp.writeFile(path.join(artifactDir, "snippet-result.json"), `${JSON.stringify({
      exitCode: run.exitCode,
      trajectoryId: run.trajectoryId,
      answer: run.answer ?? null,
    }, null, 2)}\n`);

    if (run.trajectoryId) {
      libFunctionsUsed = await countLibCalls(run.trajectoryId, datafetchHome);
    }

    if (run.answer) {
      const a = run.answer as Record<string, unknown>;
      answerStatus = String(a["status"] ?? "unsupported");
      predicted = renderPredicted(a);
    }
  } catch (err) {
    await fsp.writeFile(path.join(artifactDir, "snippet-stderr.txt"), `runLiveQuestion: ${String(err)}`);
  }

  const wallClockMs = Math.round(performance.now() - startedAt);
  return {
    arm: args.arm,
    interaction_id: q.interaction_id,
    question_type: q.question_type,
    answer_type: q.answer_type,
    query: q.query,
    gold: q.answer,
    predicted,
    answerStatus,
    snippetExitCode,
    agentExitCode: agentRun.exitCode,
    libFunctionsAvailable: learnedHelpers.length,
    libFunctionsUsed,
    wallClockMs,
    artifactPath: path.relative(process.cwd(), artifactDir),
  };
}

// Render the agent's committed df.answer into a single predicted string the
// CRAG rule scorer normalises. Prefers `value`, else `reason` (for
// abstentions / false-premise answers). Numbers and objects are stringified.
function renderPredicted(answer: Record<string, unknown>): string | null {
  const value = answer["value"];
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  const reason = answer["reason"];
  if (typeof reason === "string" && reason.trim().length > 0) return reason;
  // An unsupported/abstain answer with no value is an abstention.
  const status = String(answer["status"] ?? "");
  if (status === "unsupported") return "i don't know";
  return value === null ? null : null;
}

async function listLibHelpers(libDir: string): Promise<string[]> {
  try {
    const entries = await fsp.readdir(libDir);
    return entries.filter((e) => e.endsWith(".ts")).map((e) => e.slice(0, -3));
  } catch {
    return [];
  }
}

async function countLibCalls(trajectoryId: string, datafetchHome: string): Promise<number> {
  try {
    const { readTrajectory } = await import("../sdk/index.js");
    const trajectory = await readTrajectory(trajectoryId, datafetchHome);
    return trajectory.calls.filter((c) => c.primitive.startsWith("lib.")).length;
  } catch {
    return 0;
  }
}

interface AgentRun {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runClaudePAgent(args: {
  workspaceDir: string;
  prompt: string;
  model: string;
  effort: string;
  timeoutMs: number;
}): Promise<AgentRun> {
  const claudeBin = process.env["CLAUDE_CLI"] ?? "claude-p";
  const isClaudeP = /(?:^|\/)claude-p$/.test(claudeBin);
  const cliArgs = isClaudeP
    ? [
        "--output-format", "stream-json",
        "--verbose",
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
  return {
    stdout: Buffer.concat(stdoutChunks).toString("utf8"),
    stderr: Buffer.concat(stderrChunks).toString("utf8"),
    exitCode,
  };
}

function renderCragPrompt(q: CragQuestion, mountId: string): string {
  return [
    `You are answering a finance question using a mounted company database and finance data tools.`,
    ``,
    `## Question`,
    q.query,
    ``,
    `(As of ${q.query_time}.)`,
    ``,
    `## Workspace contract`,
    `- Read your workspace orientation at /AGENTS.md.`,
    `- Read the typed surface at /df.d.ts to see exactly what data + tools are available.`,
    `- Read the scaffold at /scripts/answer.ts and replace its body to solve the question.`,
    `- A company database is mounted at \`df.db.records\` (mount id: ${mountId}) for resolving company names to tickers; \`df.tool.${TOOL_BUNDLE}.*\` exposes finance metrics; \`df.lib.*\` may hold learned helpers. See /df.d.ts for all three and use whatever best fits the question.`,
    `- You MUST reach data through the substrate: call \`df.db.records.search(...)\` or \`df.db.records.findExact(...)\` at least once before answering (the runtime enforces a substrate-rooted chain).`,
    `- Commit your answer by RETURNING df.answer: \`return df.answer({status: "answered", value: <answer>, evidence: []})\`. The runtime captures the snippet's return value.`,
    ``,
    `## Answering rules`,
    `- If the question rests on a false premise (it asks about something that is not true), answer with the exact phrase "invalid question".`,
    `- If you genuinely cannot determine the answer from the available data, answer "i don't know" (status "unsupported"). Do NOT guess.`,
    `- Otherwise give the concise factual answer as the \`value\`.`,
    ``,
    `Reply by editing scripts/answer.ts. The harness will execute it.`,
  ].join("\n");
}

async function writeCragAgentsMd(
  workspace: string,
  q: CragQuestion,
  mountId: string,
  learnedHelpers: string[],
): Promise<void> {
  const helperSection = learnedHelpers.length === 0
    ? []
    : [
        `## Library (df.lib)`,
        `- Helpers from prior questions are hydrated into \`df.lib\` and visible in /df.d.ts. When one fits your question's intent, call it instead of re-deriving.`,
        ...learnedHelpers.map((h) => `- \`df.lib.${h}(...)\` is available.`),
        ``,
      ];
  const body = [
    `# Workspace orientation (CRAG finance)`,
    ``,
    `You are answering one finance question. The full question is in your prompt.`,
    ``,
    `## Mounted data`,
    `- \`df.db.records\` (mount id: \`${mountId}\`) — the full company directory. Each record: id (the ticker symbol), label (company name), attributes.name, attributes.symbol.`,
    `- \`await df.db.records.search("Apple")\` fuzzy-matches a company name to its record(s); read \`.id\` or \`.attributes.symbol\` for the ticker.`,
    `- \`await df.db.records.findExact({ symbol: "AAPL" })\` looks a ticker up exactly.`,
    ``,
    `## Tools (df.tool.${TOOL_BUNDLE})`,
    `Each takes a single ticker (or company name for the name tools) and returns live finance data:`,
    `- \`get_ticker_by_name({ name })\` — resolve a company name to its ticker.`,
    `- \`get_company_name({ query })\` — fuzzy company-name matches.`,
    `- \`get_pe_ratio({ ticker })\` — price/earnings ratio.`,
    `- \`get_market_capitalization({ ticker })\` — market cap.`,
    `- \`get_eps({ ticker })\` — earnings per share.`,
    `- \`get_price_history({ ticker })\` — 1yr daily OHLCV (object keyed by date).`,
    `- \`get_dividends_history({ ticker })\` — dividend history (object keyed by date -> amount).`,
    `- \`get_info({ ticker })\` — full metadata object.`,
    `Example: \`const pe = await df.tool.${TOOL_BUNDLE}.get_pe_ratio({ ticker: "AAPL" });\``,
    ``,
    ...helperSection,
    `## Committing your answer`,
    "```ts",
    `return df.answer({`,
    `  status: "answered",          // or "unsupported" if you cannot determine the answer`,
    `  value: "...",                // the concise factual answer (string or number)`,
    `  evidence: [{ recordKey: "crag-finance:AAPL", reason: "..." }],`,
    `});`,
    "```",
    `If the question rests on a false premise, set \`value: "invalid question"\`.`,
    `If you cannot determine the answer, use \`status: "unsupported"\` (scored as an abstention, not a wrong answer).`,
  ].join("\n");
  await fsp.writeFile(path.join(workspace, "AGENTS.md"), body);
}

async function writeCragAnswerScaffold(workspace: string, q: CragQuestion): Promise<void> {
  const body = [
    `// CRAG finance — ${q.question_type} question ${q.interaction_id}`,
    `//`,
    `// Question (verbatim):`,
    `// ${q.query.split("\n").join("\n// ")}`,
    `//`,
    `// Replace the body below. Inspect /df.d.ts for every available surface`,
    `// (df.db data, df.tool adapters, and any df.lib learned helpers), pick`,
    `// whatever fits this question best, compute, then RETURN df.answer(...).`,
    ``,
    `async function main() {`,
    `  // Inspect /df.d.ts and lib/ first, then write your solution here.`,
    `  return df.answer({`,
    `    status: "unsupported",`,
    `    value: null,`,
    `    evidence: [],`,
    `  });`,
    `}`,
    ``,
    `return await main();`,
  ].join("\n");
  await fsp.writeFile(path.join(workspace, "scripts", "answer.ts"), body);
}

async function writeDfDts(
  workspace: string,
  learnedHelpers: string[],
  libDir: string,
): Promise<void> {
  // Render a DRIVABLE signature for each learned helper, not an opaque
  // `Record<string, unknown>`. The record-backed fan-out helpers are
  // intent-shaped: their public contract is `{intent}` plus record scope,
  // but the body reads an internal execution plan (toolBundle / toolNames /
  // paramName / entityField) that the AGENT must populate at the call site
  // (the agent is the planner). Exposing those slots in the type surface,
  // with the helper's own intent string as a doc comment, is what lets the
  // agent reuse the helper instead of re-deriving from df.db + df.tool.
  const libLines: string[] = [];
  for (const h of learnedHelpers) {
    let intent = "learned helper";
    try {
      const src = await fsp.readFile(path.join(libDir, `${h}.ts`), "utf8");
      const m = src.match(/intent:\s*"((?:[^"\\]|\\.)*)"/);
      if (m?.[1]) intent = m[1];
    } catch {
      // helper file unreadable; fall back to the generic doc comment
    }
    libLines.push(`    /** ${intent} */`);
    libLines.push(
      `    ${h}: (input: {` +
        ` intent?: string;` +
        ` recordFilter?: Record<string, unknown>;` +
        ` recordLimit?: number;` +
        ` toolBundle: string;` + // e.g. "${TOOL_BUNDLE}"
        ` toolNames: string[];` + // e.g. ["get_market_capitalization"]
        ` paramName: string;` + // e.g. "ticker"
        ` entityField?: string;` +
        ` paramByTool?: Record<string, string>;` +
        ` sharedInput?: Record<string, unknown>;` +
        ` }) => Promise<{ value: unknown }>;`,
    );
  }
  const body = [
    `// Auto-generated type surface for this CRAG finance question.`,
    `declare const df: {`,
    `  db: {`,
    `    records: {`,
    `      search(query: string, opts?: { limit?: number }): Promise<Array<{`,
    `        id: string;            // ticker symbol`,
    `        recordKey: string;`,
    `        family: string;`,
    `        label: string;         // company name`,
    `        attributes: { name: string; symbol: string };`,
    `      }>>;`,
    `      findExact(filter: Record<string, unknown>, limit?: number): Promise<Array<{`,
    `        id: string;`,
    `        recordKey: string;`,
    `        family: string;`,
    `        label: string;`,
    `        attributes: { name: string; symbol: string };`,
    `      }>>;`,
    `      findSimilar(query: string, limit?: number): Promise<unknown[]>;`,
    `    };`,
    `  };`,
    `  lib: {`,
    ...libLines,
    `    [name: string]: unknown;`,
    `  };`,
    `  tool: {`,
    `    ${TOOL_BUNDLE}: {`,
    `      get_ticker_by_name(input: { name: string }): Promise<string>;`,
    `      get_company_name(input: { query: string }): Promise<string[]>;`,
    `      get_pe_ratio(input: { ticker: string }): Promise<number>;`,
    `      get_market_capitalization(input: { ticker: string }): Promise<number>;`,
    `      get_eps(input: { ticker: string }): Promise<number>;`,
    `      get_price_history(input: { ticker: string }): Promise<Record<string, { Open: number; High: number; Low: number; Close: number; Volume: number }>>;`,
    `      get_dividends_history(input: { ticker: string }): Promise<Record<string, number>>;`,
    `      get_info(input: { ticker: string }): Promise<Record<string, unknown>>;`,
    `    };`,
    `  };`,
    `  answer(input: {`,
    `    status: "answered" | "partial" | "unsupported";`,
    `    value: unknown;`,
    `    evidence?: Array<{ recordKey?: string; reason?: string }>;`,
    `    reason?: string;`,
    `  }): Promise<void>;`,
    `};`,
    ``,
    `export {};`,
  ].join("\n");
  await fsp.writeFile(path.join(workspace, "df.d.ts"), body);
}

function registerEvalRecordsMount(input: { mountId: string; adapter: EvalRecordsMount }): MountRuntime {
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
  const seedDir = path.join(datafetchHome, "lib", "__seed__");
  await fsp.mkdir(seedDir, { recursive: true });
  await fsp.writeFile(path.join(seedDir, `${PER_ENTITY_SEED_NAME}.ts`), renderPerEntitySeed(), "utf8");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

export { parseArgs, loadQuestions, renderCragPrompt, writeDfDts };
export type { Args, CragQuestion, ResultRow, Arm };
