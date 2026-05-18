// Run ONE CRAG question end-to-end via claude-p. Iter5 smoke before
// scaling to small-N (50 questions × 2 arms).
//
// Usage:  pnpm tsx eval/crag/scripts/run-one-llm.ts [interactionId] [arm]
// Defaults: the Steve Nash question, substrate-on arm.

import { createReadStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

import { parseCragRecord, type CragRecord } from "../../../src/eval/cragMount.js";
import { runOneCragQuestion, type CragArm } from "../../../src/eval/cragRunner.js";
import { installSnippetRuntime } from "../../../src/snippet/install.js";
import { installFlueDispatcher } from "../../../src/flue/install.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WT_ROOT = resolve(__dirname, "..", "..", "..");
const JSONL_PATH = resolve(WT_ROOT, "eval/crag/vendor/raw/crag_task_1_and_2_dev_v4.jsonl");

const DEFAULT_ID = "7bb29eb4-12f9-45f9-bf8a-66832b3c8962"; // Steve Nash 3-pt attempts
const DEFAULT_ARM: CragArm = "substrate-on";

async function loadOne(interactionId: string): Promise<CragRecord | null> {
  const rl = createInterface({
    input: createReadStream(JSONL_PATH, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.length === 0) continue;
    const r = parseCragRecord(line);
    if (r.interactionId === interactionId) {
      rl.close();
      return r;
    }
  }
  return null;
}

async function main(): Promise<void> {
  const id = process.argv[2] ?? DEFAULT_ID;
  const arm = (process.argv[3] as CragArm) ?? DEFAULT_ARM;

  process.stdout.write(`=== iter5 single-question smoke ===\n`);
  process.stdout.write(`  interactionId: ${id}\n`);
  process.stdout.write(`  arm:           ${arm}\n\n`);

  process.stdout.write("Loading record...\n");
  const record = await loadOne(id);
  if (!record) {
    process.stderr.write(`record ${id} not found\n`);
    process.exit(1);
  }
  process.stdout.write(`  query:  ${record.query}\n`);
  process.stdout.write(`  gold:   ${record.answer}\n`);
  process.stdout.write(`  type:   ${record.domain}/${record.questionType}\n\n`);

  const runId = `iter5-${id.slice(0, 8)}-${arm}-${Date.now()}`;
  const runDir = resolve(WT_ROOT, "eval/crag/results", runId, id);
  await mkdir(runDir, { recursive: true });

  const snippetBaseDir = resolve("/tmp", `df-iter5-${process.pid}-${Date.now()}`);
  await mkdir(snippetBaseDir, { recursive: true });
  const { snippetRuntime } = await installSnippetRuntime({ baseDir: snippetBaseDir });
  await installFlueDispatcher({ baseDir: snippetBaseDir, skipSeedMirror: true });

  process.stdout.write("Spawning claude-p (may take 30-90s)...\n");
  const result = await runOneCragQuestion({
    record,
    arm,
    runDir,
    worktreeRoot: WT_ROOT,
    snippetRuntime: snippetRuntime as unknown as { run: (a: unknown) => Promise<unknown> },
    snippetBaseDir,
    timeoutMs: 120_000,
  });

  const symbol = result.score === 1 ? "✓" : result.score === 0 ? "○" : "✗";
  process.stdout.write(`\n${symbol} [${result.score >= 0 ? " " : ""}${result.score}] ${result.domain}/${result.questionType}\n`);
  process.stdout.write(`     Q: ${result.query}\n`);
  process.stdout.write(`     A (agent): ${result.agentAnswer}\n`);
  process.stdout.write(`     A (gold):  ${result.goldAnswer}\n`);
  process.stdout.write(`     reason: ${result.scoreReason}\n`);
  process.stdout.write(`\n  -- substrate --\n`);
  process.stdout.write(`     exit: ${result.exitCode}, traj: ${result.trajectoryId ?? "-"} (${result.trajectoryCalls} calls, ${result.trajectoryHelperCalls} lib.*)\n`);
  process.stdout.write(`     tier: ${result.costTier}, llmCalls: ${result.costLlmCalls}\n`);
  process.stdout.write(`\n  -- claude-p --\n`);
  process.stdout.write(`     duration: ${(result.agentDurationMs ?? 0).toFixed(0)}ms, turns: ${result.agentNumTurns}, cost: $${(result.agentTotalCostUsd ?? 0).toFixed(4)}\n`);
  process.stdout.write(`     tokens: in=${result.agentInputTokens}, cached=${result.agentCachedInputTokens}, out=${result.agentOutputTokens}\n`);
  if (result.agentError) {
    process.stdout.write(`     error: ${result.agentError}\n`);
  }
  process.stdout.write(`\n  totalWallClock: ${(result.totalWallClockMs / 1000).toFixed(1)}s\n`);
  process.stdout.write(`  runDir: ${runDir}\n`);
}

main().catch((err) => {
  process.stderr.write(`crashed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
