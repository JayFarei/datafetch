// Iter8 verification probe: run 3 sibling movie/simple questions
// sequentially through the substrate-on arm. With iter8's per-family
// tenant, the helper authored on Q1 should be warm-callable on Q2+Q3.
// R7 > 0 (any one of the 3 questions invokes a learned lib helper) is
// the success condition.
//
// Usage:  pnpm tsx eval/crag/scripts/run-iter8-sibling-probe.ts

import { createReadStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

import { parseCragRecord, type CragRecord } from "../../../src/eval/cragMount.js";
import { runOneCragQuestion } from "../../../src/eval/cragRunner.js";
import { installSnippetRuntime } from "../../../src/snippet/install.js";
import { installFlueDispatcher } from "../../../src/flue/install.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WT_ROOT = resolve(__dirname, "..", "..", "..");
const JSONL_PATH = resolve(WT_ROOT, "eval/crag/vendor/raw/crag_task_1_and_2_dev_v4.jsonl");

async function pickMovieSimple(count: number): Promise<CragRecord[]> {
  const out: CragRecord[] = [];
  const rl = createInterface({
    input: createReadStream(JSONL_PATH, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.length === 0) continue;
    const r = parseCragRecord(line);
    if (r.split !== 0) continue;
    if (r.domain !== "movie" || r.questionType !== "simple") continue;
    out.push(r);
    if (out.length >= count) {
      rl.close();
      break;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const records = await pickMovieSimple(3);
  process.stdout.write(`=== iter8 sibling probe ===\n`);
  process.stdout.write(`  picked ${records.length} movie/simple records\n`);
  for (const r of records) {
    process.stdout.write(`    ${r.interactionId.slice(0, 8)}: ${r.query.slice(0, 60)}\n`);
  }
  process.stdout.write("\n");

  const runId = `iter8-sibling-probe-${Date.now()}`;
  const runRoot = resolve(WT_ROOT, "eval/crag/results", runId);
  await mkdir(runRoot, { recursive: true });

  const snippetBaseDir = resolve("/tmp", `df-iter8-${process.pid}-${Date.now()}`);
  await mkdir(snippetBaseDir, { recursive: true });
  const { snippetRuntime } = await installSnippetRuntime({ baseDir: snippetBaseDir });
  await installFlueDispatcher({ baseDir: snippetBaseDir, skipSeedMirror: true });

  process.stdout.write(`baseDir: ${snippetBaseDir}\n`);
  process.stdout.write(`runDir:  ${runRoot}\n\n`);

  process.stdout.write("Running 3 sibling questions SEQUENTIALLY through substrate-on...\n");
  process.stdout.write("Expect: Q1 authors a helper; Q2+Q3 warm-call it (R7 > 0).\n\n");

  for (let i = 0; i < records.length; i++) {
    const r = records[i]!;
    process.stdout.write(`[Q${i + 1}/${records.length}] starting ${r.interactionId.slice(0, 8)}...\n`);
    const result = await runOneCragQuestion({
      record: r,
      arm: "substrate-on",
      runDir: resolve(runRoot, "substrate-on", r.interactionId),
      worktreeRoot: WT_ROOT,
      snippetRuntime: snippetRuntime as unknown as { run: (a: unknown) => Promise<unknown> },
      snippetBaseDir,
      timeoutMs: 180_000,
    });
    process.stdout.write(
      `  done (${(result.totalWallClockMs / 1000).toFixed(0)}s). ` +
        `score=${result.score} (${result.scoreReason}). ` +
        `trajCalls=${result.trajectoryCalls} (${result.trajectoryHelperCalls} lib.*).\n`,
    );
    if (result.trajectoryHelperCalls > 0) {
      process.stdout.write(`  *** R7 HELPER REUSE FIRED on Q${i + 1} ***\n`);
    }
  }

  // After all 3 questions, check what helpers landed in the shared
  // family tenant's lib directory.
  process.stdout.write("\n=== final lib directory state (shared family tenant) ===\n");
  process.stdout.write(`  Looking under: ${snippetBaseDir}/lib/crag-on-crag-movie-simple/\n`);

  try {
    const { readdir } = await import("node:fs/promises");
    const libDir = resolve(snippetBaseDir, "lib", "crag-on-crag-movie-simple");
    const files = await readdir(libDir);
    if (files.length === 0) {
      process.stdout.write("  (empty — no helpers crystallised across 3 questions)\n");
    } else {
      process.stdout.write(`  helpers (${files.length}):\n`);
      for (const f of files) process.stdout.write(`    - ${f}\n`);
    }
  } catch (err) {
    process.stdout.write(`  (dir missing or unreadable: ${err instanceof Error ? err.message : String(err)})\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`probe crashed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
