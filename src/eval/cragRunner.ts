// CRAG matched-arm runner.
//
// For each CRAG question:
//   1. Set up a per-question workspace at `<runDir>/<interaction-id>/workspace/`
//      with `.datafetch-ctx.json`, `df.d.ts`, `AGENTS.md`, `scripts/`.
//   2. Spawn `claude-p` in that workspace with a CRAG-shaped prompt.
//      The agent reads AGENTS.md + df.d.ts, can probe with
//      `pnpm datafetch:run scripts/probe.ts`, and writes the final
//      `scripts/answer.ts` returning `df.answer({...})`.
//   3. After claude-p exits, run the agent's `scripts/answer.ts` through
//      the substrate's snippet runtime, capture the AnswerEnvelope +
//      trajectory.
//   4. Score tri-state against the gold + alt_ans.
//
// Two arms: `substrate-on` (defaults; observer + lib-cache live) and
// `substrate-off` (DATAFETCH_DISABLE_LEARNING=1 in env). Both share the
// identical prompt + workspace + question; only the env var differs.
//
// Generic-substrate guard: this file has NO `if (benchmark === 'crag')`
// special-cases in substrate code. All CRAG-specific knowledge lives in
// the AGENTS.md prompt + the df.d.ts typed surface, both of which the
// substrate treats as opaque per-tenant content.

import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

// Snippet runtime overlays globalThis.df during run. Parallel runOneCragQuestion
// calls would race; serialise the substrate-side replay (registerMount → run →
// teardown) across all workers via a process-wide mutex. claude-p calls
// outside the mutex remain parallel.
let replayMutex: Promise<void> = Promise.resolve();
async function withReplayLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = replayMutex;
  let release: () => void = () => undefined;
  replayMutex = new Promise<void>((res) => {
    release = res;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

import {
  CragWebMount,
  scoreTriState,
  type CragRecord,
  type TriStateScore,
} from "./cragMount.js";
import {
  getMountRuntimeRegistry,
  type MountRuntime,
} from "../adapter/runtime.js";
import { installObserver } from "../observer/install.js";
import type { CollectionHandle, SourceCapabilities } from "../sdk/index.js";

export type CragArm = "substrate-on" | "substrate-off";

export interface CragRunOpts {
  record: CragRecord;
  arm: CragArm;
  runDir: string; // <runId>/<interactionId>/
  worktreeRoot: string;
  snippetRuntime: { run: (a: unknown) => Promise<unknown> };
  snippetBaseDir: string;
  claudeBin?: string;
  claudeModel?: string;
  claudeEffort?: string;
  timeoutMs?: number;
}

export interface CragRunResult {
  interactionId: string;
  arm: CragArm;
  domain: string;
  questionType: string;
  staticOrDynamic: string;
  query: string;
  goldAnswer: string;
  agentAnswer: string;
  score: TriStateScore;
  scoreReason: string;
  // Substrate metrics:
  exitCode: number | null;
  trajectoryId: string | null;
  trajectoryCalls: number;
  trajectoryHelperCalls: number; // df.lib.* call count from trajectory
  costTier: number | null;
  costLlmCalls: number | null;
  // Agent metrics (from claude-p result):
  agentDurationMs: number | null;
  agentInputTokens: number | null;
  agentCachedInputTokens: number | null;
  agentOutputTokens: number | null;
  agentTotalCostUsd: number | null;
  agentNumTurns: number | null;
  agentTimedOut: boolean;
  agentError: string | null;
  // Wall-clock totals:
  totalWallClockMs: number;
}

// ---------- workspace setup ----------------------------------------------

const DF_D_TS = `// Auto-generated typed surface for this CRAG question.
// You can search the cached web pages via df.db.cragWeb.search(query, {limit}).
// Each page has: pageName, pageUrl, pageSnippet, pageResult (HTML), pageLastModified.

export interface CragPage {
  pageName: string;
  pageUrl: string;
  pageSnippet: string;
  pageResult: string;
  pageLastModified: string;
}

declare global {
  const df: {
    db: {
      cragWeb: {
        search(query: string, opts?: { limit?: number }): Promise<CragPage[]>;
        findExact(filter: Partial<CragPage>, limit?: number): Promise<CragPage[]>;
        findSimilar(query: string, limit?: number): Promise<CragPage[]>;
        hybrid(query: string, opts?: { limit?: number }): Promise<CragPage[]>;
      };
    };
    lib: Record<string, (input: unknown) => Promise<{ value: unknown }>>;
    answer(envelope: {
      status: "answered" | "partial" | "unsupported";
      value?: unknown;
      evidence?: unknown;
      derivation?: unknown;
      reason?: string;
    }): {
      status: string;
      value?: unknown;
      evidence?: unknown;
    };
  };
}

export {};
`;

const AGENTS_MD = (record: CragRecord) => `# CRAG Question Workspace

You are answering one factual question from the CRAG benchmark. Your job is
to write \`scripts/answer.ts\` that:

1. Searches the cached web pages (\`df.db.cragWeb.search\`) to find
   supporting evidence for the question below.
2. Extracts the answer from the page text (HTML inline in
   \`pageResult\`).
3. Returns \`df.answer({...})\` with:
   - \`status: "answered"\` when you find a supported answer
   - \`status: "unsupported"\` when the question is unanswerable or the
     premise is false ("I don't know" / "invalid question")
   - \`value\`: a short string answer
   - \`evidence\`: array of \`{pageUrl, pageName}\` you used

## The question

> ${record.query}

(Domain: ${record.domain}; question_type: ${record.questionType};
static_or_dynamic: ${record.staticOrDynamic})

## How to write your answer

Write **scripts/answer.ts** with the SHAPE. **Make multiple targeted
searches**, one per distinct entity or key concept in the question. The
substrate learns from repeated patterns; multiple focused searches give
better retrieval than one broad search AND let the substrate amortise
your search work across sibling questions.

\`\`\`ts
// Decompose the question into 2-4 specific search queries (entities,
// dates, key terms). Run them as separate calls — DO NOT collapse to
// one big search.
const hits = await Promise.all([
  df.db.cragWeb.search("specific entity or term 1", { limit: 3 }),
  df.db.cragWeb.search("specific entity or term 2", { limit: 3 }),
  // df.db.cragWeb.search("specific entity or term 3", { limit: 3 }),
]);

// Inspect pageSnippet and pageResult across all hits to extract the
// answer. Cross-reference if the question requires it.
const pages = hits.flat();

return df.answer({
  status: "answered",
  value: "the short answer string",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "1-sentence note on how you derived the answer",
});
\`\`\`

The \`return\` is REQUIRED — the answer envelope must be the resolved
value of the snippet's top-level async IIFE. **Multiple search calls is
required, not optional** — even if one search would suffice, decompose
the question into 2-4 calls so the substrate can crystallise the
retrieval pattern.

## Calibration rules

- If the question's premise is false (e.g. asks for an event that never
  happened), return \`status: "unsupported"\` and \`value: "invalid question"\`
  rather than fabricating an answer. CRAG's grader penalises hallucination
  more than abstention.
- Short answers beat long answers. Aim for the minimal substring that
  matches the gold (a number + unit, a name, a date).

## What you have

- \`df.db.cragWeb.search(query, {limit})\` — BM25-lite over the 5
  pre-retrieved pages for this question.
- \`pnpm datafetch:run scripts/probe.ts\` — sandboxed eval of a snippet
  against the substrate (results in tmp/runs/...). Use this to test
  extraction logic before committing the final answer.

## What to do

1. Read this AGENTS.md and the inline question.
2. Write \`scripts/answer.ts\` with your final answer.
3. Stop. The harness will run the script after you exit.
`;

const SCRIPTS_PROBE_TEMPLATE = `// Probe sandbox — \`pnpm datafetch:run scripts/probe.ts\`. Edit freely.
const pages = await df.db.cragWeb.search("EDIT ME", { limit: 3 });
console.log(pages.map((p) => p.pageName));
return df.answer({ status: "answered", value: "probe", evidence: [], derivation: "probe" });
`;

async function setupWorkspace(opts: CragRunOpts): Promise<{
  workspaceDir: string;
  ctxFile: string;
}> {
  const wsDir = resolve(opts.runDir, "workspace");
  await mkdir(join(wsDir, "scripts"), { recursive: true });
  const mountId = `crag-${opts.record.interactionId}`;

  await writeFile(join(wsDir, "df.d.ts"), DF_D_TS);
  await writeFile(join(wsDir, "AGENTS.md"), AGENTS_MD(opts.record));
  await writeFile(join(wsDir, "scripts", "probe.ts"), SCRIPTS_PROBE_TEMPLATE);

  // .datafetch-ctx.json so `pnpm datafetch:run` in the workspace knows
  // which tenant/mount/baseDir to use.
  //
  // Iter8 (Goal-5 e8): tenant id is per-(arm × domain × questionType), NOT
  // per-question. This lets the dbFanout helper authored on the FIRST
  // sibling question be warm-callable on subsequent sibling questions in
  // the same cell. Iter7 verified the substrate authors the helper
  // correctly; iter8 lets it actually be reused.
  const family = `crag-${opts.record.domain}-${opts.record.questionType}`;
  const tenantId = opts.arm === "substrate-on" ? `crag-on-${family}` : `crag-off-${family}`;
  const ctx = {
    tenantId,
    datasetDir: opts.runDir,
    datafetchHome: opts.snippetBaseDir,
    bundles: [] as string[],
    toolRunnerPath: "",
    snippetTimeoutMs: opts.timeoutMs ?? 90_000,
    mountId,
    family,
  };
  const ctxFile = join(wsDir, ".datafetch-ctx.json");
  await writeFile(ctxFile, JSON.stringify(ctx, null, 2));

  return { workspaceDir: wsDir, ctxFile };
}

// ---------- mount registration -------------------------------------------

function registerCragMount(record: CragRecord): { mountId: string; teardown: () => void } {
  const mountId = `crag-${record.interactionId}`;
  const adapter = new CragWebMount(mountId, record);
  const runtime: MountRuntime = {
    mountId,
    adapter,
    identMap: [{ ident: "cragWeb", name: "cragWeb" }],
    collection<T>(name: string): CollectionHandle<T> {
      const h = adapter.typedCollections.get(name);
      if (!h) throw new Error(`CragWebMount: unknown collection ${name}`);
      return h as unknown as CollectionHandle<T>;
    },
    async close(): Promise<void> {
      // no-op
    },
  };
  const registry = getMountRuntimeRegistry();
  registry.register(mountId, runtime);
  return { mountId, teardown: () => registry.unregister(mountId) };
}

// ---------- claude-p driver ----------------------------------------------

interface ClaudePResult {
  durationMs: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  numTurns: number;
  timedOut: boolean;
  error: string | null;
  rawStdout: string;
  rawStderr: string;
}

async function runClaudeP(args: {
  workspaceDir: string;
  prompt: string;
  arm: CragArm;
  claudeBin: string;
  claudeModel: string;
  claudeEffort: string;
  timeoutMs: number;
}): Promise<ClaudePResult> {
  const started = performance.now();
  const cliArgs = [
    "--output-format",
    "json",
    "--model",
    args.claudeModel,
    "--dangerously-skip-permissions",
    "--timeout",
    String(Math.max(60, Math.ceil(args.timeoutMs / 1000))),
    "--effort",
    args.claudeEffort,
    args.prompt,
  ];

  const env: NodeJS.ProcessEnv = { ...process.env };
  if (args.arm === "substrate-off") {
    env["DATAFETCH_DISABLE_LEARNING"] = "1";
  } else {
    delete env["DATAFETCH_DISABLE_LEARNING"];
  }

  return await new Promise((res) => {
    const child = spawn(args.claudeBin, cliArgs, {
      cwd: args.workspaceDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutBuf: Buffer[] = [];
    const stderrBuf: Buffer[] = [];
    child.stdout.on("data", (b: Buffer) => stdoutBuf.push(b));
    child.stderr.on("data", (b: Buffer) => stderrBuf.push(b));
    const killTimer = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, 5_000);
    }, args.timeoutMs);

    child.on("close", () => {
      clearTimeout(killTimer);
      const stdout = Buffer.concat(stdoutBuf).toString("utf8");
      const stderr = Buffer.concat(stderrBuf).toString("utf8");
      const durationMs = performance.now() - started;
      try {
        const parsed = JSON.parse(stdout) as Record<string, unknown>;
        const usage = (parsed["usage"] ?? {}) as Record<string, number>;
        res({
          durationMs,
          inputTokens: usage["input_tokens"] ?? 0,
          cachedInputTokens: usage["cache_read_input_tokens"] ?? 0,
          outputTokens: usage["output_tokens"] ?? 0,
          totalCostUsd: (parsed["total_cost_usd"] as number) ?? 0,
          numTurns: (parsed["num_turns"] as number) ?? 0,
          timedOut: false,
          error: parsed["is_error"] === true ? String(parsed["result"] ?? "is_error=true") : null,
          rawStdout: stdout,
          rawStderr: stderr,
        });
      } catch (err) {
        res({
          durationMs,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          totalCostUsd: 0,
          numTurns: 0,
          timedOut: durationMs >= args.timeoutMs,
          error: `parse error: ${err instanceof Error ? err.message : String(err)}`,
          rawStdout: stdout,
          rawStderr: stderr,
        });
      }
    });

    child.on("error", (err) => {
      clearTimeout(killTimer);
      const durationMs = performance.now() - started;
      res({
        durationMs,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        totalCostUsd: 0,
        numTurns: 0,
        timedOut: false,
        error: err.message,
        rawStdout: Buffer.concat(stdoutBuf).toString("utf8"),
        rawStderr: Buffer.concat(stderrBuf).toString("utf8"),
      });
    });
  });
}

// ---------- post-claude snippet replay ------------------------------------

async function readAndReplay(
  workspaceDir: string,
  snippetRuntime: CragRunOpts["snippetRuntime"],
  mountId: string,
  snippetBaseDir: string,
  arm: CragArm,
  interactionId: string,
  family: string,
): Promise<{
  agentAnswer: string;
  exitCode: number | null;
  trajectoryId: string | null;
  trajectoryCalls: number;
  trajectoryHelperCalls: number;
  costTier: number | null;
  costLlmCalls: number | null;
}> {
  const answerPath = join(workspaceDir, "scripts", "answer.ts");
  let source = "";
  try {
    await stat(answerPath);
    source = await readFile(answerPath, "utf8");
  } catch {
    return {
      agentAnswer: "",
      exitCode: null,
      trajectoryId: null,
      trajectoryCalls: 0,
      trajectoryHelperCalls: 0,
      costTier: null,
      costLlmCalls: null,
    };
  }

  // Run the agent's snippet through the substrate. Iter8 (Goal-5 e8):
  // tenant id is per-family (arm × domain × questionType) so the dbFanout
  // helper authored on the first sibling is warm-callable on subsequent
  // siblings. interactionId param kept for per-question artefact paths.
  void interactionId;
  const tenantId = arm === "substrate-on" ? `crag-on-${family}` : `crag-off-${family}`;
  // Iter9c (Goal-5 e9c): install the observer ONLY for substrate-on. The
  // observer's onTrajectorySaved hook is what fires the gate + crystallises
  // helpers. Skipping this in substrate-off honours the matched-arm
  // control. Cast required: installObserver expects a SnippetRuntime;
  // the harness passes a structural surrogate so we cast for the call.
  if (arm === "substrate-on") {
    // installObserver expects a concrete DiskSnippetRuntime; we receive a
    // structural surrogate, so do the same cast skillcraftFullDatafetch.ts
    // does and rely on the duck-typed `onTrajectorySaved` assignment.
    installObserver({
      baseDir: snippetBaseDir,
      tenantId,
      snippetRuntime: snippetRuntime as unknown as Parameters<typeof installObserver>[0] extends infer T
        ? T extends { snippetRuntime?: infer S }
          ? S
          : never
        : never,
    });
  }
  const result = (await snippetRuntime.run({
    source,
    sessionCtx: {
      tenantId,
      mountIds: [mountId],
      baseDir: snippetBaseDir,
    },
  })) as {
    exitCode: number | null;
    trajectoryId?: string;
    cost?: { tier?: number; llmCalls?: number };
    answer?: { value?: unknown };
  };

  let agentAnswer = "";
  const env = result.answer;
  if (env && typeof env === "object" && "value" in env) {
    const v = env.value;
    agentAnswer = typeof v === "string" ? v : JSON.stringify(v);
  }

  // Count library calls from the trajectory.
  let totalCalls = 0;
  let helperCalls = 0;
  if (result.trajectoryId) {
    const file = join(snippetBaseDir, "trajectories", `${result.trajectoryId}.json`);
    try {
      const raw = await readFile(file, "utf8");
      const t = JSON.parse(raw) as { calls?: Array<{ primitive?: string }> };
      if (Array.isArray(t.calls)) {
        totalCalls = t.calls.length;
        helperCalls = t.calls.filter((c) => (c.primitive ?? "").startsWith("lib.")).length;
      }
    } catch {
      // ignore
    }
  }

  return {
    agentAnswer,
    exitCode: result.exitCode,
    trajectoryId: result.trajectoryId ?? null,
    trajectoryCalls: totalCalls,
    trajectoryHelperCalls: helperCalls,
    costTier: result.cost?.tier ?? null,
    costLlmCalls: result.cost?.llmCalls ?? null,
  };
}

// ---------- public: runOne -----------------------------------------------

const CLAUDE_PROMPT_TEMPLATE = (record: CragRecord) =>
  `You are answering one CRAG benchmark question. Read AGENTS.md in this workspace for the question and protocol. Write your final answer to scripts/answer.ts and exit.

Question: ${record.query}`;

export async function runOneCragQuestion(opts: CragRunOpts): Promise<CragRunResult> {
  const wallStart = performance.now();
  await mkdir(opts.runDir, { recursive: true });
  const { workspaceDir } = await setupWorkspace(opts);
  // Note: mount registration is per-replay, not per-question — the mutex
  // owns mount lifecycle so a second worker's mount-register doesn't
  // overlap with another worker's globalThis.df overlay during snippet run.
  try {
    // Claude-p runs OUTSIDE the mutex (independent subprocess; safe to
    // parallelise across workers).
    const claudeResult = await runClaudeP({
      workspaceDir,
      prompt: CLAUDE_PROMPT_TEMPLATE(opts.record),
      arm: opts.arm,
      claudeBin: opts.claudeBin ?? process.env["CLAUDE_CLI"] ?? "claude-p",
      claudeModel: opts.claudeModel ?? "claude-sonnet-4-6",
      claudeEffort: opts.claudeEffort ?? "low",
      timeoutMs: opts.timeoutMs ?? 90_000,
    });

    // Snippet replay runs INSIDE the mutex (globalThis.df overlay is
    // process-wide; parallel replays race).
    const { replay, mountId } = await withReplayLock(async () => {
      const { mountId, teardown } = registerCragMount(opts.record);
      try {
        const r = await readAndReplay(
          workspaceDir,
          opts.snippetRuntime,
          mountId,
          opts.snippetBaseDir,
          opts.arm,
          opts.record.interactionId,
          `crag-${opts.record.domain}-${opts.record.questionType}`,
        );
        return { replay: r, mountId };
      } finally {
        teardown();
      }
    });
    void mountId; // suppress unused warning; useful for debugging
    const scored = scoreTriState(replay.agentAnswer, opts.record);

    // Write per-question artefacts.
    const answerJson = {
      interactionId: opts.record.interactionId,
      arm: opts.arm,
      query: opts.record.query,
      agentAnswer: replay.agentAnswer,
      goldAnswer: opts.record.answer,
      altAns: opts.record.altAns,
      score: scored.score,
      scoreReason: scored.reason,
    };
    await writeFile(join(opts.runDir, "answer.json"), JSON.stringify(answerJson, null, 2));
    await writeFile(join(opts.runDir, "claude-result.json"), claudeResult.rawStdout || "{}");
    if (claudeResult.rawStderr) {
      await writeFile(join(opts.runDir, "claude-stderr.log"), claudeResult.rawStderr);
    }

    return {
      interactionId: opts.record.interactionId,
      arm: opts.arm,
      domain: opts.record.domain,
      questionType: opts.record.questionType,
      staticOrDynamic: opts.record.staticOrDynamic,
      query: opts.record.query,
      goldAnswer: opts.record.answer,
      agentAnswer: replay.agentAnswer,
      score: scored.score,
      scoreReason: scored.reason,
      exitCode: replay.exitCode,
      trajectoryId: replay.trajectoryId,
      trajectoryCalls: replay.trajectoryCalls,
      trajectoryHelperCalls: replay.trajectoryHelperCalls,
      costTier: replay.costTier,
      costLlmCalls: replay.costLlmCalls,
      agentDurationMs: claudeResult.durationMs,
      agentInputTokens: claudeResult.inputTokens,
      agentCachedInputTokens: claudeResult.cachedInputTokens,
      agentOutputTokens: claudeResult.outputTokens,
      agentTotalCostUsd: claudeResult.totalCostUsd,
      agentNumTurns: claudeResult.numTurns,
      agentTimedOut: claudeResult.timedOut,
      agentError: claudeResult.error,
      totalWallClockMs: performance.now() - wallStart,
    };
  } catch (err) {
    // Catch-all so a single question failure doesn't crash the pool.
    return {
      interactionId: opts.record.interactionId,
      arm: opts.arm,
      domain: opts.record.domain,
      questionType: opts.record.questionType,
      staticOrDynamic: opts.record.staticOrDynamic,
      query: opts.record.query,
      goldAnswer: opts.record.answer,
      agentAnswer: "",
      score: -1 as TriStateScore,
      scoreReason: `runner error: ${err instanceof Error ? err.message : String(err)}`,
      exitCode: null,
      trajectoryId: null,
      trajectoryCalls: 0,
      trajectoryHelperCalls: 0,
      costTier: null,
      costLlmCalls: null,
      agentDurationMs: null,
      agentInputTokens: null,
      agentCachedInputTokens: null,
      agentOutputTokens: null,
      agentTotalCostUsd: null,
      agentNumTurns: null,
      agentTimedOut: false,
      agentError: err instanceof Error ? err.message : String(err),
      totalWallClockMs: performance.now() - wallStart,
    };
  }
}
