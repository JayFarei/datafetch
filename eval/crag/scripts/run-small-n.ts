// Small-N matched-arm runner — 50 questions × 2 arms (substrate-on /
// substrate-off) via parallel claude-p workers.
//
// Reads:    eval/crag/manifests/small-n-50.json
// Writes:   eval/crag/results/<run-id>/{<arm>/<interactionId>/...,arm-scorecard.json}
// Total:    100 claude-p invocations (50 records × 2 arms). At ~60-90s
//           per call with k=3 parallel workers, expect ~30-50 minutes
//           wall-clock for the whole run.
//
// Usage:    pnpm tsx eval/crag/scripts/run-small-n.ts [--workers N] [--limit N]

import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

import {
  parseCragRecord,
  type CragRecord,
  type TriStateScore,
} from "../../../src/eval/cragMount.js";
import {
  runOneCragQuestion,
  type CragArm,
  type CragRunResult,
} from "../../../src/eval/cragRunner.js";
import { installSnippetRuntime } from "../../../src/snippet/install.js";
import { installFlueDispatcher } from "../../../src/flue/install.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WT_ROOT = resolve(__dirname, "..", "..", "..");
const JSONL_PATH = resolve(WT_ROOT, "eval/crag/vendor/raw/crag_task_1_and_2_dev_v4.jsonl");
const DEFAULT_MANIFEST = resolve(WT_ROOT, "eval/crag/manifests/small-n-50.json");
let MANIFEST_PATH = DEFAULT_MANIFEST;

// ----- args -----
interface CliArgs {
  workers: number;
  limit: number | null;
  arms: CragArm[];
  timeoutMs: number;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    workers: 3,
    limit: null,
    arms: ["substrate-on", "substrate-off"],
    timeoutMs: 180_000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--workers" && i + 1 < argv.length) {
      out.workers = Math.max(1, parseInt(argv[++i] ?? "3", 10));
    } else if (a === "--limit" && i + 1 < argv.length) {
      out.limit = Math.max(1, parseInt(argv[++i] ?? "50", 10));
    } else if (a === "--on-only") {
      out.arms = ["substrate-on"];
    } else if (a === "--off-only") {
      out.arms = ["substrate-off"];
    } else if (a === "--timeout-ms" && i + 1 < argv.length) {
      out.timeoutMs = Math.max(60_000, parseInt(argv[++i] ?? "180000", 10));
    } else if (a === "--manifest" && i + 1 < argv.length) {
      MANIFEST_PATH = resolve(WT_ROOT, argv[++i]!);
    }
  }
  return out;
}

// ----- helpers -----
async function loadManifest(): Promise<string[]> {
  const raw = await readFile(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(raw) as { interaction_ids: string[] };
  return manifest.interaction_ids;
}

async function loadRecords(ids: string[]): Promise<CragRecord[]> {
  const need = new Set(ids);
  const found = new Map<string, CragRecord>();
  const rl = createInterface({
    input: createReadStream(JSONL_PATH, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.length === 0) continue;
    const r = parseCragRecord(line);
    if (need.has(r.interactionId)) {
      found.set(r.interactionId, r);
      if (found.size === need.size) {
        rl.close();
        break;
      }
    }
  }
  return ids.map((id) => found.get(id)).filter((r): r is CragRecord => r !== undefined);
}

// ----- pool -----
async function runPool<T, U>(
  items: T[],
  workerCount: number,
  fn: (item: T, idx: number) => Promise<U>,
  onProgress?: (done: number, total: number, latest: U) => void,
): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let nextIdx = 0;
  let done = 0;
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const idx = nextIdx++;
      if (idx >= items.length) return;
      const item = items[idx]!;
      const out = await fn(item, idx);
      results[idx] = out;
      done++;
      if (onProgress) onProgress(done, items.length, out);
    }
  });
  await Promise.all(workers);
  return results;
}

// ----- main -----
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runId = `small-n-${Date.now()}`;
  const runRoot = resolve(WT_ROOT, "eval/crag/results", runId);
  await mkdir(runRoot, { recursive: true });

  process.stdout.write("=== iter6 small-N matched-arm ===\n");
  process.stdout.write(`  runId:    ${runId}\n`);
  process.stdout.write(`  runRoot:  ${runRoot}\n`);
  process.stdout.write(`  workers:  ${args.workers}\n`);
  process.stdout.write(`  arms:     ${args.arms.join(", ")}\n`);
  process.stdout.write(`  timeout:  ${args.timeoutMs}ms per question\n`);

  const ids = await loadManifest();
  const limit = args.limit ?? ids.length;
  const targetIds = ids.slice(0, limit);
  process.stdout.write(`  manifest: ${MANIFEST_PATH}\n`);
  process.stdout.write(`  records:  ${targetIds.length} (limit ${limit})\n`);
  process.stdout.write(`  total invocations: ${targetIds.length * args.arms.length}\n\n`);

  const records = await loadRecords(targetIds);
  if (records.length !== targetIds.length) {
    process.stderr.write(`loaded ${records.length}/${targetIds.length} records; aborting\n`);
    process.exit(1);
  }

  const snippetBaseDir = resolve("/tmp", `df-iter6-${process.pid}-${Date.now()}`);
  await mkdir(snippetBaseDir, { recursive: true });
  const { snippetRuntime } = await installSnippetRuntime({ baseDir: snippetBaseDir });
  await installFlueDispatcher({ baseDir: snippetBaseDir, skipSeedMirror: true });

  // Build the full job list (record × arm).
  type Job = { record: CragRecord; arm: CragArm };
  const jobs: Job[] = [];
  for (const arm of args.arms) {
    for (const record of records) {
      jobs.push({ record, arm });
    }
  }

  const wallStart = Date.now();
  process.stdout.write(`Starting ${jobs.length} invocations across ${args.workers} workers...\n\n`);
  const results = await runPool(
    jobs,
    args.workers,
    async (job): Promise<CragRunResult> => {
      const runDir = resolve(runRoot, job.arm, job.record.interactionId);
      return await runOneCragQuestion({
        record: job.record,
        arm: job.arm,
        runDir,
        worktreeRoot: WT_ROOT,
        snippetRuntime: snippetRuntime as unknown as {
          run: (a: unknown) => Promise<unknown>;
        },
        snippetBaseDir,
        timeoutMs: args.timeoutMs,
      });
    },
    (done, total, latest) => {
      const elapsed = (Date.now() - wallStart) / 1000;
      const eta = (elapsed / done) * (total - done);
      const sym = latest.score === 1 ? "✓" : latest.score === 0 ? "○" : "✗";
      process.stdout.write(
        `[${done.toString().padStart(3, " ")}/${total}] ${sym} ${latest.arm.padEnd(14)} ${latest.domain.padEnd(7)}/${latest.questionType.padEnd(20)} ${latest.scoreReason} (${(elapsed).toFixed(0)}s elapsed, ${eta.toFixed(0)}s eta)\n`,
      );
    },
  );

  const wallTotalMs = Date.now() - wallStart;

  // Per-arm scorecard + per-slice rollup.
  type Scorecard = {
    arm: CragArm;
    n: number;
    triState: { plus1: number; zero: number; minus1: number };
    meanScore: number;
    meanWallClockMs: number;
    meanEffectiveTokens: number;
    meanTrajectoryCalls: number;
    helperReuseRate: number;
    runtimeErrors: number;
    bySlice: Record<string, { n: number; meanScore: number }>;
  };

  function score(arm: CragArm): Scorecard {
    const arr = results.filter((r) => r.arm === arm);
    const n = arr.length;
    const plus1 = arr.filter((r) => r.score === 1).length;
    const zero = arr.filter((r) => r.score === 0).length;
    const minus1 = arr.filter((r) => r.score === -1).length;
    const mean = n > 0 ? arr.reduce((s, r) => s + r.score, 0) / n : 0;
    const wallMean = n > 0 ? arr.reduce((s, r) => s + r.totalWallClockMs, 0) / n : 0;
    const tokMean = n > 0
      ? arr.reduce(
          (s, r) =>
            s + (r.agentInputTokens ?? 0) + (r.agentOutputTokens ?? 0) -
            (r.agentCachedInputTokens ?? 0),
          0,
        ) / n
      : 0;
    const callsMean = n > 0
      ? arr.reduce((s, r) => s + r.trajectoryCalls, 0) / n
      : 0;
    const helperHits = arr.filter((r) => r.trajectoryHelperCalls > 0).length;
    const errors = arr.filter((r) => r.agentError !== null || r.exitCode !== 0).length;

    const bySlice: Record<string, { n: number; meanScore: number; scores: number[] }> = {};
    for (const r of arr) {
      const key = `${r.domain}/${r.questionType}`;
      if (!bySlice[key]) bySlice[key] = { n: 0, meanScore: 0, scores: [] };
      bySlice[key].n += 1;
      bySlice[key].scores.push(r.score);
    }
    for (const key of Object.keys(bySlice)) {
      const s = bySlice[key]!;
      s.meanScore = s.scores.reduce((a, b) => a + b, 0) / s.scores.length;
    }
    const bySliceOut: Record<string, { n: number; meanScore: number }> = {};
    for (const [k, v] of Object.entries(bySlice)) {
      bySliceOut[k] = { n: v.n, meanScore: v.meanScore };
    }
    return {
      arm,
      n,
      triState: { plus1, zero, minus1 },
      meanScore: mean,
      meanWallClockMs: wallMean,
      meanEffectiveTokens: tokMean,
      meanTrajectoryCalls: callsMean,
      helperReuseRate: n > 0 ? helperHits / n : 0,
      runtimeErrors: errors,
      bySlice: bySliceOut,
    };
  }

  const scorecards = args.arms.map(score);

  process.stdout.write("\n=== summary ===\n");
  process.stdout.write(`  total wall: ${(wallTotalMs / 1000).toFixed(0)}s (${(wallTotalMs / 60_000).toFixed(1)}min)\n`);
  for (const sc of scorecards) {
    process.stdout.write(`\n  [${sc.arm}]\n`);
    process.stdout.write(`    n: ${sc.n}\n`);
    process.stdout.write(`    +1: ${sc.triState.plus1}  0: ${sc.triState.zero}  -1: ${sc.triState.minus1}\n`);
    process.stdout.write(`    mean tri-state: ${sc.meanScore.toFixed(3)}\n`);
    process.stdout.write(`    mean wall-clock: ${sc.meanWallClockMs.toFixed(0)}ms\n`);
    process.stdout.write(`    mean effective tokens: ${sc.meanEffectiveTokens.toFixed(0)}\n`);
    process.stdout.write(`    mean trajectory calls: ${sc.meanTrajectoryCalls.toFixed(2)}\n`);
    process.stdout.write(`    helper reuse rate: ${(sc.helperReuseRate * 100).toFixed(1)}% (R7)\n`);
    process.stdout.write(`    runtime errors: ${sc.runtimeErrors}\n`);
  }

  // Save results + scorecards
  const outFile = join(runRoot, "results.json");
  await writeFile(
    outFile,
    JSON.stringify(
      {
        runId,
        date: new Date().toISOString(),
        worktree: WT_ROOT,
        wallTotalMs,
        config: {
          workers: args.workers,
          arms: args.arms,
          limit,
          timeoutMs: args.timeoutMs,
        },
        scorecards,
        results,
      },
      null,
      2,
    ),
  );
  process.stdout.write(`\n✓ results saved: ${outFile}\n`);
  process.stdout.write(`  generate report: pnpm tsx eval/crag/scripts/build-paired-comparison.ts ${runRoot}\n`);
}

main().catch((err) => {
  process.stderr.write(`crashed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
