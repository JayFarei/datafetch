// Normalize FinChain raw episodes.jsonl into a flat normalized.jsonl that
// downstream scorers (analyze, score-finchain) consume. Mirrors
// eval/skillcraft/scripts/normalize-results.ts in shape, simpler in surface
// (no skillcraft-base parallel arm, no skill-mode comparison).
//
// Reads <runBase>/episodes.jsonl (the per-episode rows the runner appends as
// it goes) and emits <runBase>/normalized.jsonl, one JSON object per line
// with the unified columns the analyzers expect:
//   armId, taskKey, family, level, topic, templateName, templatePosition,
//   seedIndex, difficulty, passed (boolean from FAC match), score,
//   answerStatus, agentInputTokens, agentCachedInputTokens,
//   agentOutputTokens, effectiveTokens, agentElapsedMs, wallClockMs,
//   snippetExitCode, agentExitCode, libFunctionsAvailable, libFunctionsUsed,
//   libFunctionsCreated, reuseRate, agentFailureKind, predictedFinalValue,
//   goldFinalValue, derivationSteps

import { promises as fsp } from "node:fs";
import path from "node:path";

interface Args {
  runBase: string;
  outFile?: string;
}

function parseArgs(argv: string[]): Args {
  let runBase = "";
  let outFile: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (a === "--run-base") runBase = path.resolve(argv[++i]!);
    else if (a.startsWith("--run-base=")) runBase = path.resolve(a.slice("--run-base=".length));
    else if (a === "--out") outFile = path.resolve(argv[++i]!);
    else if (a.startsWith("--out=")) outFile = path.resolve(a.slice("--out=".length));
    else throw new Error(`unknown arg: ${a}`);
  }
  if (!runBase) throw new Error("required: --run-base <eval/finchain/results/datafetch/<label>>");
  return { runBase, outFile };
}

interface EpisodeRow {
  armId?: "datafetch-control" | "datafetch-learned";
  taskKey: string;
  topic?: string;
  family?: string;
  level?: string;
  templateName?: string;
  templatePosition?: number;
  seedIndex?: number;
  difficulty?: string;
  // Outcome
  answerStatus?: string | null;
  predictedFinalValue?: number | null;
  goldFinalValue?: number | null;
  goldIntermediateValues?: number[];
  passed?: boolean;
  facMatch?: boolean;
  scorePercent?: number;
  derivationSteps?: unknown[];
  // Cost
  agentInputTokens?: number;
  agentCachedInputTokens?: number;
  agentOutputTokens?: number;
  agentReasoningTokens?: number;
  effectiveTokens?: number | null;
  // Time
  agentElapsedMs?: number;
  wallClockMs?: number;
  // Errors / structure
  snippetExitCode?: number;
  agentExitCode?: number;
  agentFailureKind?: string;
  // Library / observer signals
  libFunctionsAvailable?: number;
  libFunctionsUsed?: number;
  libFunctionsCreated?: number;
  reuseRate?: number;
  // raw artifact path
  artifactPath?: string;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalize(row: EpisodeRow): Record<string, unknown> {
  // Effective tokens convention from skillcraft: input + output - cached
  const input = numberOr(row.agentInputTokens, 0);
  const output = numberOr(row.agentOutputTokens, 0);
  const cached = numberOr(row.agentCachedInputTokens, 0);
  const effective = row.effectiveTokens ?? Math.max(0, input + output - cached);
  return {
    armId: row.armId ?? "datafetch-learned",
    taskKey: row.taskKey,
    topic: row.topic ?? null,
    family: row.family ?? null,
    level: row.level ?? null,
    templateName: row.templateName ?? null,
    templatePosition: row.templatePosition ?? null,
    seedIndex: row.seedIndex ?? null,
    difficulty: row.difficulty ?? null,
    answerStatus: row.answerStatus ?? null,
    predictedFinalValue: row.predictedFinalValue ?? null,
    goldFinalValue: row.goldFinalValue ?? null,
    goldIntermediateValues: row.goldIntermediateValues ?? [],
    facMatch: row.facMatch ?? null,
    passed: row.passed ?? Boolean(row.facMatch),
    scorePercent: row.scorePercent ?? (row.facMatch ? 100 : 0),
    derivationSteps: row.derivationSteps ?? [],
    agentInputTokens: input,
    agentCachedInputTokens: cached,
    agentOutputTokens: output,
    agentReasoningTokens: numberOr(row.agentReasoningTokens, 0),
    effectiveTokens: effective,
    agentElapsedMs: numberOr(row.agentElapsedMs, 0),
    wallClockMs: numberOr(row.wallClockMs, numberOr(row.agentElapsedMs, 0)),
    snippetExitCode: numberOr(row.snippetExitCode, -1),
    agentExitCode: numberOr(row.agentExitCode, -1),
    agentFailureKind: row.agentFailureKind ?? null,
    libFunctionsAvailable: numberOr(row.libFunctionsAvailable, 0),
    libFunctionsUsed: numberOr(row.libFunctionsUsed, 0),
    libFunctionsCreated: numberOr(row.libFunctionsCreated, 0),
    reuseRate: row.reuseRate ?? null,
    artifactPath: row.artifactPath ?? null,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = path.join(args.runBase, "episodes.jsonl");
  const outPath = args.outFile ?? path.join(args.runBase, "normalized.jsonl");
  let raw = "";
  try {
    raw = await fsp.readFile(inputPath, "utf8");
  } catch {
    console.error(`[normalize] no episodes.jsonl at ${inputPath} — writing empty normalized.jsonl`);
    await fsp.writeFile(outPath, "");
    return;
  }
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const rows: Record<string, unknown>[] = [];
  for (const [idx, line] of lines.entries()) {
    try {
      const row = JSON.parse(line) as EpisodeRow;
      rows.push(normalize(row));
    } catch (err) {
      console.error(`[normalize] skipping malformed line ${idx + 1}: ${String(err)}`);
    }
  }
  await fsp.writeFile(outPath, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
  console.log(`[normalize] wrote ${rows.length} rows to ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
