// CRAG smoke test — proves the substrate composes against CRAG records
// end-to-end on 5 hand-authored questions, WITHOUT calling an LLM.
//
// For each question:
//   1. Load the record from the jsonl
//   2. Register a per-question CragWebMount under id `crag-<interactionId>`
//   3. Run a hand-authored snippet through the substrate's snippet runtime
//      that uses `df.db.cragWeb.search(query)` and emits `df.answer({...})`
//   4. Read the trajectory + stdout, parse the answer envelope
//   5. Score tri-state against the gold + alt_ans
//
// Iter5 swaps the hand-authored snippet for a claude-p invocation.
//
// Run with:  pnpm tsx eval/crag/scripts/run-smoke.ts

import { createReadStream } from "node:fs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

import {
  CragWebMount,
  parseCragRecord,
  scoreTriState,
  type CragRecord,
  type TriStateScore,
} from "../../../src/eval/cragMount.js";
import {
  getMountRuntimeRegistry,
  type MountRuntime,
} from "../../../src/adapter/runtime.js";
import { installSnippetRuntime } from "../../../src/snippet/install.js";
import { installFlueDispatcher } from "../../../src/flue/install.js";
import type { CollectionHandle, SourceCapabilities } from "../../../src/sdk/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WT_ROOT = resolve(__dirname, "..", "..", "..");
const JSONL_PATH = resolve(WT_ROOT, "eval/crag/vendor/raw/crag_task_1_and_2_dev_v4.jsonl");

// Five hand-picked smoke questions covering different shapes.
// Pulled from the small-n-50 manifest by question_type variety.
const SMOKE_IDS = [
  // simple — Steve Nash 3-pt attempts
  "7bb29eb4-12f9-45f9-bf8a-66832b3c8962",
  // We'll pick the others dynamically from the small-N manifest at runtime.
];

const QUESTION_TYPES_TO_COVER = [
  "simple",
  "comparison",
  "multi-hop",
  "false_premise",
  "aggregation",
];

// Build a snippet that emulates an agent's answer code for a given record.
// In iter5 this gets replaced by a claude-p invocation that drives the
// substrate's `pnpm datafetch:run` entry point. For the smoke, we hand-roll
// snippets that exercise df.db.cragWeb.search to prove the plumbing works.
//
// The snippet is INTENTIONALLY simple: it doesn't try to extract the
// answer from page HTML (that's the agent's job). It just searches, then
// for the smoke we use the gold answer as the value to test that
// df.answer() + trajectory + scoring fire end-to-end.
function buildSmokeSnippet(record: CragRecord): string {
  // Escape gold answer for embedding as a string literal.
  const goldEscaped = JSON.stringify(record.answer);
  const queryEscaped = JSON.stringify(record.query);
  const mountId = `crag-${record.interactionId}`;
  // Return the df.answer envelope so the runtime's returnValue carries
  // the answer back to the harness (runtime wraps the body as an async
  // IIFE; the last `return` becomes the resolved value).
  return `
const pages = await df.db.cragWeb.search(${queryEscaped}, { limit: 3 });
const evidence = pages.map((p) => ({
  pageUrl: (p as { pageUrl: string }).pageUrl,
  pageName: (p as { pageName: string }).pageName,
}));
console.log("SMOKE_DONE mount=${mountId}");
return df.answer({
  status: "answered",
  value: ${goldEscaped},
  evidence,
  derivation: "smoke: returned gold answer with retrieved page URLs as evidence",
});
`;
}

// Stream the jsonl and pull just the records we want.
async function loadRecords(ids: string[]): Promise<CragRecord[]> {
  const need = new Set(ids);
  const out: CragRecord[] = [];
  const rl = createInterface({
    input: createReadStream(JSONL_PATH, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.length === 0) continue;
    const r = parseCragRecord(line);
    if (need.has(r.interactionId)) {
      out.push(r);
      if (out.length === need.size) {
        rl.close();
        break;
      }
    }
  }
  return ids
    .map((id) => out.find((r) => r.interactionId === id))
    .filter((r): r is CragRecord => r !== undefined);
}

// Pull additional smoke IDs by question_type to diversify the smoke.
async function pickSmokeIdsByType(types: string[]): Promise<string[]> {
  const picked: Map<string, string> = new Map();
  const rl = createInterface({
    input: createReadStream(JSONL_PATH, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.length === 0) continue;
    const r = JSON.parse(line) as Record<string, unknown>;
    if (r["split"] !== 0) continue;
    const qt = r["question_type"] as string;
    if (types.includes(qt) && !picked.has(qt)) {
      picked.set(qt, r["interaction_id"] as string);
      if (picked.size === types.length) {
        rl.close();
        break;
      }
    }
  }
  return Array.from(picked.values());
}

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
      // no-op for in-memory adapter
    },
  };
  const registry = getMountRuntimeRegistry();
  registry.register(mountId, runtime);
  return { mountId, teardown: () => registry.unregister(mountId) };
}

type SmokeResult = {
  interactionId: string;
  query: string;
  questionType: string;
  domain: string;
  agentAnswer: string;
  score: TriStateScore;
  reason: string;
  exitCode: number | null;
  trajectoryId: string | null;
  trajectoryCalls: number;
  costTier: number | null;
  costLlmCalls: number | null;
};

async function runOne(
  record: CragRecord,
  snippetRuntime: { run: (a: unknown) => Promise<unknown> },
  baseDir: string,
): Promise<SmokeResult> {
  const { mountId, teardown } = registerCragMount(record);
  try {
    const source = buildSmokeSnippet(record);
    const result = (await snippetRuntime.run({
      source,
      sessionCtx: {
        tenantId: "crag-smoke",
        mountIds: [mountId],
        baseDir,
      },
    })) as {
      exitCode: number | null;
      stdout: string;
      stderr: string;
      trajectoryId?: string;
      cost?: { tier?: number; llmCalls?: number };
      answer?: { value?: unknown };
    };

    // The AnswerEnvelope is in result.answer (RunResult schema).
    let agentAnswer = "";
    const env = result.answer;
    if (env && typeof env === "object" && "value" in env) {
      const v = env.value;
      agentAnswer = typeof v === "string" ? v : JSON.stringify(v);
    }

    // Trajectory call count
    let trajectoryCalls = 0;
    if (result.trajectoryId) {
      const file = join(baseDir, "trajectories", `${result.trajectoryId}.json`);
      try {
        const raw = await readFile(file, "utf8");
        const t = JSON.parse(raw) as { calls?: unknown[] };
        trajectoryCalls = Array.isArray(t.calls) ? t.calls.length : 0;
      } catch {
        // ignore
      }
    }

    const scored = scoreTriState(agentAnswer, record);
    return {
      interactionId: record.interactionId,
      query: record.query,
      questionType: record.questionType,
      domain: record.domain,
      agentAnswer,
      score: scored.score,
      reason: scored.reason,
      exitCode: result.exitCode,
      trajectoryId: result.trajectoryId ?? null,
      trajectoryCalls,
      costTier: result.cost?.tier ?? null,
      costLlmCalls: result.cost?.llmCalls ?? null,
    };
  } finally {
    teardown();
  }
}

async function main(): Promise<void> {
  const baseDir = resolve("/tmp", `df-crag-smoke-${process.pid}-${Date.now()}`);
  await mkdir(baseDir, { recursive: true });

  const { snippetRuntime } = await installSnippetRuntime({ baseDir });
  await installFlueDispatcher({ baseDir, skipSeedMirror: true });

  // Diversify the smoke: keep the existing simple/post-processing ID, plus
  // pick one each from the other key question_types.
  const extraIds = await pickSmokeIdsByType(QUESTION_TYPES_TO_COVER);
  const allIds = Array.from(new Set([...SMOKE_IDS, ...extraIds]));

  process.stdout.write("=== CRAG SMOKE (iter4) — substrate end-to-end on CRAG records ===\n");
  process.stdout.write(`worktree:  ${WT_ROOT}\n`);
  process.stdout.write(`jsonl:     ${JSONL_PATH}\n`);
  process.stdout.write(`baseDir:   ${baseDir}\n`);
  process.stdout.write(`record n:  ${allIds.length}\n\n`);

  const records = await loadRecords(allIds);
  if (records.length === 0) {
    process.stderr.write("smoke: loaded 0 records\n");
    process.exit(1);
  }

  const results: SmokeResult[] = [];
  for (const r of records) {
    const out = await runOne(
      r,
      snippetRuntime as unknown as { run: (a: unknown) => Promise<unknown> },
      baseDir,
    );
    results.push(out);
    const symbol = out.score === 1 ? "✓" : out.score === 0 ? "○" : "✗";
    process.stdout.write(
      `${symbol} [${out.score >= 0 ? " " : ""}${out.score}] ${out.domain}/${out.questionType}\n`,
    );
    process.stdout.write(`     Q: ${out.query.slice(0, 80)}${out.query.length > 80 ? "…" : ""}\n`);
    process.stdout.write(
      `     A: ${out.agentAnswer.slice(0, 80)}${out.agentAnswer.length > 80 ? "…" : ""}\n`,
    );
    process.stdout.write(`     reason: ${out.reason}\n`);
    process.stdout.write(
      `     exit: ${out.exitCode}, traj: ${out.trajectoryId?.slice(0, 8) ?? "-"} (${out.trajectoryCalls} calls), tier: ${out.costTier}, llmCalls: ${out.costLlmCalls}\n\n`,
    );
  }

  // Roll-up.
  const summary = {
    n: results.length,
    triState: { plus1: 0, zero: 0, minus1: 0 },
    mean: 0,
    runtime: { exit0: 0, trajectoriesPresent: 0, totalCalls: 0 },
  };
  for (const r of results) {
    if (r.score === 1) summary.triState.plus1 += 1;
    else if (r.score === 0) summary.triState.zero += 1;
    else summary.triState.minus1 += 1;
    if (r.exitCode === 0) summary.runtime.exit0 += 1;
    if (r.trajectoryId) summary.runtime.trajectoriesPresent += 1;
    summary.runtime.totalCalls += r.trajectoryCalls;
  }
  summary.mean = results.reduce((s, r) => s + r.score, 0) / Math.max(1, results.length);

  process.stdout.write("--- summary ---\n");
  process.stdout.write(`  n: ${summary.n}\n`);
  process.stdout.write(
    `  +1: ${summary.triState.plus1}  0: ${summary.triState.zero}  -1: ${summary.triState.minus1}\n`,
  );
  process.stdout.write(`  mean tri-state: ${summary.mean.toFixed(3)}\n`);
  process.stdout.write(
    `  runtime: exit0 ${summary.runtime.exit0}/${summary.n}, trajectories ${summary.runtime.trajectoriesPresent}/${summary.n}, total calls ${summary.runtime.totalCalls}\n`,
  );

  const outDir = resolve(WT_ROOT, "eval/crag/results", "smoke-iter4");
  await mkdir(outDir, { recursive: true });
  const outPath = resolve(outDir, "smoke-report.json");
  await writeFile(
    outPath,
    JSON.stringify(
      {
        runId: "smoke-iter4",
        date: new Date().toISOString(),
        baseDir,
        n: results.length,
        summary,
        results,
      },
      null,
      2,
    ),
  );
  process.stdout.write(`\n✓ report: ${outPath}\n`);
}

main().catch((err) => {
  process.stderr.write(`smoke crashed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
