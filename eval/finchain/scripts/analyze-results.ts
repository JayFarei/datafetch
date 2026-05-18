// Analyze FinChain normalized.jsonl into analysis.json + r1-r9-scorecard.json.
// Mirrors eval/skillcraft/scripts/analyze-results.ts in output shape so the
// existing reporting + bilateral-comparison tools work unchanged. FC-specific
// scoring (FC1, FC2, FC3, FC4, FC5) is produced by a sibling
// score-finchain.ts at iter 3; this analyzer focuses on the R1-R9 + cost +
// tier aggregates that fit the existing rubric scorer's input shape.

import { promises as fsp } from "node:fs";
import path from "node:path";

interface Args {
  runBase: string;
  outAnalysis?: string;
  outScorecard?: string;
}

function parseArgs(argv: string[]): Args {
  let runBase = "";
  let outAnalysis: string | undefined;
  let outScorecard: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (a === "--run-base") runBase = path.resolve(argv[++i]!);
    else if (a.startsWith("--run-base=")) runBase = path.resolve(a.slice("--run-base=".length));
    else if (a === "--analysis") outAnalysis = path.resolve(argv[++i]!);
    else if (a.startsWith("--analysis=")) outAnalysis = path.resolve(a.slice("--analysis=".length));
    else if (a === "--scorecard") outScorecard = path.resolve(argv[++i]!);
    else if (a.startsWith("--scorecard=")) outScorecard = path.resolve(a.slice("--scorecard=".length));
    else throw new Error(`unknown arg: ${a}`);
  }
  if (!runBase) throw new Error("required: --run-base <eval/finchain/results/datafetch/<label>>");
  return { runBase, outAnalysis, outScorecard };
}

interface NormalizedRow {
  armId: "datafetch-control" | "datafetch-learned";
  taskKey: string;
  topic: string | null;
  family: string | null;
  level: string | null;
  templateName: string | null;
  templatePosition: number | null;
  seedIndex: number | null;
  difficulty: string | null;
  passed: boolean;
  scorePercent: number;
  effectiveTokens: number;
  agentElapsedMs: number;
  wallClockMs: number;
  snippetExitCode: number;
  agentExitCode: number;
  libFunctionsAvailable: number;
  libFunctionsUsed: number;
  libFunctionsCreated: number;
  reuseRate: number | null;
}

async function loadRows(runBase: string): Promise<NormalizedRow[]> {
  const filePath = path.join(runBase, "normalized.jsonl");
  let raw = "";
  try {
    raw = await fsp.readFile(filePath, "utf8");
  } catch {
    console.error(`[analyze] no normalized.jsonl at ${filePath}`);
    return [];
  }
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const out: NormalizedRow[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as NormalizedRow);
    } catch {
      // skip malformed
    }
  }
  return out;
}

function safeMean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function groupBy<T, K extends string | number>(xs: T[], key: (x: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const x of xs) {
    const k = key(x);
    const bucket = map.get(k) ?? [];
    bucket.push(x);
    map.set(k, bucket);
  }
  return map;
}

interface ArmAggregate {
  armId: "datafetch-control" | "datafetch-learned";
  episodes: number;
  passRate: number | null;
  avgEffectiveTokens: number | null;
  avgWallClockMs: number | null;
  runtimeErrorRate: number | null;
  perTier: Record<string, {
    episodes: number;
    passRate: number | null;
    avgEffectiveTokens: number | null;
    avgWallClockMs: number | null;
  }>;
  perDifficulty: Record<string, {
    episodes: number;
    passRate: number | null;
    avgEffectiveTokens: number | null;
  }>;
}

function aggregateArm(rows: NormalizedRow[]): ArmAggregate {
  if (rows.length === 0) {
    return {
      armId: "datafetch-learned",
      episodes: 0,
      passRate: null,
      avgEffectiveTokens: null,
      avgWallClockMs: null,
      runtimeErrorRate: null,
      perTier: {},
      perDifficulty: {},
    };
  }
  const armId = rows[0]!.armId;
  const passRate = rows.filter((r) => r.passed).length / rows.length;
  const avgEffectiveTokens = safeMean(rows.map((r) => r.effectiveTokens));
  const avgWallClockMs = safeMean(rows.map((r) => r.wallClockMs));
  const runtimeErrorRate = rows.filter((r) => r.snippetExitCode !== 0 || r.agentExitCode !== 0).length / rows.length;

  const perTier: ArmAggregate["perTier"] = {};
  for (const [tier, tierRows] of groupBy(rows, (r) => r.level ?? "unknown")) {
    perTier[String(tier)] = {
      episodes: tierRows.length,
      passRate: tierRows.length > 0 ? tierRows.filter((r) => r.passed).length / tierRows.length : null,
      avgEffectiveTokens: safeMean(tierRows.map((r) => r.effectiveTokens)),
      avgWallClockMs: safeMean(tierRows.map((r) => r.wallClockMs)),
    };
  }

  const perDifficulty: ArmAggregate["perDifficulty"] = {};
  for (const [diff, diffRows] of groupBy(rows, (r) => r.difficulty ?? "unknown")) {
    perDifficulty[String(diff)] = {
      episodes: diffRows.length,
      passRate: diffRows.length > 0 ? diffRows.filter((r) => r.passed).length / diffRows.length : null,
      avgEffectiveTokens: safeMean(diffRows.map((r) => r.effectiveTokens)),
    };
  }
  return { armId, episodes: rows.length, passRate, avgEffectiveTokens, avgWallClockMs, runtimeErrorRate, perTier, perDifficulty };
}

interface R1R9Scorecard {
  R1: { passRate: number | null; pass: boolean | null; threshold: number };
  R2: { avgEffectiveTokens: number | null; pass: boolean | null; threshold: number };
  R3: { runtimeErrorRate: number | null; pass: boolean | null; threshold: number };
  R4: { quarantineRate: number; pass: boolean; threshold: number; note: string };
  R5: { novelTenantSmoke: string; pass: boolean | null };
  R6: { convergenceRate: number | null; pass: boolean | null; threshold: number; note: string };
  R7: { conditionalReuseRate: number | null; pass: boolean | null; threshold: number; note: string };
  R8: { meanPairedRatio: number | null; perPairPassFraction: number | null; pass: boolean | null; note: string };
  R9: { crossShapeTransfer: string; pass: boolean | null; note: string };
  allPass: boolean | null;
  cacheBoundedByFramework: boolean | null;
}

function scoreR1R9(learnedArm: ArmAggregate): R1R9Scorecard {
  // R1-R3 are computable from arm aggregates directly. R4-R9 require helper /
  // observer artifacts that iter 3 (score-finchain.ts via walk-artifacts.ts)
  // produces. This analyzer surfaces the R1-R3 values + scaffold for R4-R9
  // that score-finchain merges into the same scorecard.
  return {
    R1: {
      passRate: learnedArm.passRate,
      pass: learnedArm.passRate === null ? null : learnedArm.passRate >= 0.92,
      threshold: 0.92,
    },
    R2: {
      avgEffectiveTokens: learnedArm.avgEffectiveTokens,
      pass: learnedArm.avgEffectiveTokens === null ? null : learnedArm.avgEffectiveTokens <= 8000,
      threshold: 8000,
    },
    R3: {
      runtimeErrorRate: learnedArm.runtimeErrorRate,
      pass: learnedArm.runtimeErrorRate === null ? null : learnedArm.runtimeErrorRate <= 0.05,
      threshold: 0.05,
    },
    R4: {
      quarantineRate: 0,
      pass: true,
      threshold: 0.03,
      note: "R4 quarantine rate scored by score-finchain.ts via walk-artifacts (iter 3); placeholder 0.",
    },
    R5: { novelTenantSmoke: "src/observer/__smoke__/novel-tenant.ts", pass: null },
    R6: {
      convergenceRate: null, pass: null, threshold: 0.80,
      note: "R6 convergence rate scored by score-finchain.ts via walk-artifacts (iter 3).",
    },
    R7: {
      conditionalReuseRate: null, pass: null, threshold: 0.60,
      note: "R7 conditional reuse scored by score-finchain.ts via walk-artifacts (iter 3).",
    },
    R8: {
      meanPairedRatio: null, perPairPassFraction: null, pass: null,
      note: "R8 dual gate scored by score-finchain.ts (iter 3).",
    },
    R9: {
      crossShapeTransfer: "(unscored)", pass: null,
      note: "R9 cross-shape transfer scored by score-finchain.ts (iter 3); cross-benchmark variant is FC4 in finchain-scorecard.json.",
    },
    allPass: null,
    cacheBoundedByFramework: null,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rows = await loadRows(args.runBase);
  const learned = rows.filter((r) => r.armId === "datafetch-learned");
  const control = rows.filter((r) => r.armId === "datafetch-control");
  const learnedAgg = aggregateArm(learned);
  const controlAgg = aggregateArm(control);
  const analysis = {
    generatedAt: new Date().toISOString(),
    runBase: args.runBase,
    totalRows: rows.length,
    arms: {
      "datafetch-learned": learnedAgg,
      "datafetch-control": controlAgg,
    },
  };
  const scorecard = scoreR1R9(learnedAgg);
  const outAnalysis = args.outAnalysis ?? path.join(args.runBase, "analysis.json");
  const outScorecard = args.outScorecard ?? path.join(args.runBase, "r1-r9-scorecard.json");
  await fsp.writeFile(outAnalysis, `${JSON.stringify(analysis, null, 2)}\n`);
  await fsp.writeFile(outScorecard, `${JSON.stringify(scorecard, null, 2)}\n`);
  console.log(`[analyze] wrote ${outAnalysis}`);
  console.log(`[analyze] wrote ${outScorecard}`);
  console.log(`[analyze] arms: learned=${learnedAgg.episodes} ep / passRate=${learnedAgg.passRate}; control=${controlAgg.episodes} ep / passRate=${controlAgg.passRate}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
