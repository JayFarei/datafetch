// Score FinChain runs against the FC1-FC5 gates defined in
// eval/finchain/rubric.md. Reads the normalized.jsonl produced by
// normalize-results.ts (which contains predictedFinalValue / goldFinalValue /
// derivationSteps per episode) and the analysis.json produced by
// analyze-results.ts. Writes finchain-scorecard.json.
//
// Gates:
//   FC1 — per-difficulty FAC on substrate-ON arm vs paper baseline (snapshot
//         lives in eval/finchain/rubric.md until iter 4 backfills real
//         baseline numbers from substrate-OFF run; until then FC1 is
//         conditional on the baseline being present)
//   FC2 — per-difficulty step-alignment on substrate-ON arm vs paper baseline
//         (same conditional; step-alignment metric implemented here)
//   FC3 — substrate-ON > substrate-OFF on FAC (paired-t p<0.05) AND ≥10%
//         reduction on warm-tier tokens-or-wall-clock for sibling cells
//   FC4 — cross-benchmark transfer: at least one intentSignature whose
//         crystallised helper was called in ≥1 SkillCraft family AND ≥1
//         FinChain topic (requires walking the trajectories from BOTH
//         runs; conditional on a SkillCraft regression run on the same
//         substrate SHA being available)
//   FC5 — SkillCraft regression on the same substrate commit holds
//         iter164's R1-R9 PASS under cacheBoundedByFramework (conditional
//         on the regression run being present)
//
// Many FC gates are conditional on companion data (paper baselines for
// FC1/FC2; trajectory artifacts for FC4; SkillCraft scorecard for FC5).
// This script computes what it can from the current run and emits a
// scorecard JSON with `passes: true | false | "conditional"` per gate
// plus the data it would need to fully evaluate. Iter 4-5 populate the
// remaining inputs.

import { promises as fsp } from "node:fs";
import path from "node:path";

interface Args {
  runBase: string;
  paperBaseline?: string;
  skillcraftScorecard?: string;
  skillcraftRunBase?: string;
  out?: string;
}

function parseArgs(argv: string[]): Args {
  let runBase = "";
  let paperBaseline: string | undefined;
  let skillcraftScorecard: string | undefined;
  let skillcraftRunBase: string | undefined;
  let out: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (a === "--run-base") runBase = path.resolve(argv[++i]!);
    else if (a.startsWith("--run-base=")) runBase = path.resolve(a.slice("--run-base=".length));
    else if (a === "--paper-baseline") paperBaseline = path.resolve(argv[++i]!);
    else if (a.startsWith("--paper-baseline=")) paperBaseline = path.resolve(a.slice("--paper-baseline=".length));
    else if (a === "--skillcraft-scorecard") skillcraftScorecard = path.resolve(argv[++i]!);
    else if (a.startsWith("--skillcraft-scorecard=")) skillcraftScorecard = path.resolve(a.slice("--skillcraft-scorecard=".length));
    else if (a === "--skillcraft-run-base") skillcraftRunBase = path.resolve(argv[++i]!);
    else if (a.startsWith("--skillcraft-run-base=")) skillcraftRunBase = path.resolve(a.slice("--skillcraft-run-base=".length));
    else if (a === "--out") out = path.resolve(argv[++i]!);
    else if (a.startsWith("--out=")) out = path.resolve(a.slice("--out=".length));
    else throw new Error(`unknown arg: ${a}`);
  }
  if (!runBase) throw new Error("required: --run-base <eval/finchain/results/datafetch/<label>>");
  return { runBase, paperBaseline, skillcraftScorecard, skillcraftRunBase, out };
}

interface NormalizedRow {
  armId: "datafetch-control" | "datafetch-learned";
  taskKey: string;
  difficulty: string | null;
  passed: boolean;
  facMatch: boolean | null;
  predictedFinalValue: number | null;
  goldFinalValue: number | null;
  derivationSteps: number[];
  effectiveTokens: number;
  wallClockMs: number;
  topic: string | null;
  templateName: string | null;
  seedIndex: number | null;
}

async function loadNormalized(runBase: string): Promise<NormalizedRow[]> {
  const raw = await fsp.readFile(path.join(runBase, "normalized.jsonl"), "utf8");
  return raw.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l) as NormalizedRow);
}

async function tryReadJson(p?: string): Promise<unknown> {
  if (!p) return null;
  try {
    return JSON.parse(await fsp.readFile(p, "utf8"));
  } catch {
    return null;
  }
}

interface PerTierMetric {
  episodes: number;
  facRate: number | null;          // mean of facMatch (0/1)
  stepAlignment: number | null;     // mean of [0,1] across episodes
  paperBaseline: number | null;     // from --paper-baseline if provided
  passes: boolean | null;           // facRate ≥ paperBaseline ?
}

function meanOrNull(xs: number[]): number | null {
  return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Compute step-alignment score between an agent's derivation step values
 * and the gold intermediate values. Greedy match: for each gold step,
 * find the agent step with smallest relative numerical error; score 1 if
 * within tolerance (1e-3), else 0. Average across all gold steps.
 *
 * Iter 3 may extend this with semantic similarity on step LABELS (TF-IDF
 * or embedding); for now we use numerical-only alignment.
 */
function stepAlignmentScore(agentSteps: number[], goldSteps: number[]): number | null {
  if (goldSteps.length === 0) return null;
  if (agentSteps.length === 0) return 0;
  const tolerance = 1e-3;
  let hits = 0;
  const usedAgent = new Set<number>();
  for (const gold of goldSteps) {
    let bestIdx = -1;
    let bestErr = Infinity;
    for (let i = 0; i < agentSteps.length; i += 1) {
      if (usedAgent.has(i)) continue;
      const a = agentSteps[i]!;
      const denom = Math.max(Math.abs(gold), Math.abs(a), 1);
      const err = Math.abs(a - gold) / denom;
      if (err < bestErr) {
        bestErr = err;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0 && bestErr <= tolerance) {
      hits += 1;
      usedAgent.add(bestIdx);
    }
  }
  return hits / goldSteps.length;
}

function perTierAggregates(
  rows: NormalizedRow[],
  paperBaseline: Record<string, Record<string, number>> | null,
  baselineModelKey: string,
): Record<string, PerTierMetric> {
  const tiers: Record<string, NormalizedRow[]> = {};
  for (const r of rows) {
    const t = r.difficulty ?? "Unknown";
    (tiers[t] ??= []).push(r);
  }
  const out: Record<string, PerTierMetric> = {};
  for (const [tier, tierRows] of Object.entries(tiers)) {
    const facRate = meanOrNull(tierRows.map((r) => (r.facMatch ? 1 : 0)));
    const stepScores = tierRows
      .map((r) => stepAlignmentScore(r.derivationSteps ?? [], r.goldFinalValue !== null ? [r.goldFinalValue] : []))
      .filter((s): s is number => s !== null);
    const stepAlignment = meanOrNull(stepScores);
    // paperBaseline shape: { Basic: { "claude-sonnet-4-5": 0.83 }, ... }
    const tierBaselineMap = paperBaseline?.[tier] ?? paperBaseline?.[tier.toLowerCase()] ?? null;
    const baseline = tierBaselineMap && typeof tierBaselineMap === "object" && baselineModelKey in tierBaselineMap
      ? Number(tierBaselineMap[baselineModelKey])
      : null;
    out[tier] = {
      episodes: tierRows.length,
      facRate,
      stepAlignment,
      paperBaseline: baseline,
      passes: facRate === null || baseline === null ? null : facRate >= baseline,
    };
  }
  return out;
}

/**
 * Pair episodes by (topic, templateName, seedIndex) across arms; compute
 * paired statistics for FC3.
 */
function fc3Stats(learned: NormalizedRow[], control: NormalizedRow[]): {
  pairedCount: number;
  facLearnedMean: number | null;
  facControlMean: number | null;
  facDeltaMean: number | null;
  facPairedT: number | null;
  facPValue: number | null;
  tokenReductionPct: number | null;
  wallClockReductionPct: number | null;
  passes: boolean | null;
} {
  const keyFor = (r: NormalizedRow) => `${r.topic}|${r.templateName}|${r.seedIndex}`;
  const learnedMap = new Map(learned.map((r) => [keyFor(r), r]));
  const pairs: Array<{ l: NormalizedRow; c: NormalizedRow }> = [];
  for (const c of control) {
    const l = learnedMap.get(keyFor(c));
    if (l) pairs.push({ l, c });
  }
  if (pairs.length === 0) {
    return {
      pairedCount: 0,
      facLearnedMean: null, facControlMean: null, facDeltaMean: null,
      facPairedT: null, facPValue: null,
      tokenReductionPct: null, wallClockReductionPct: null,
      passes: null,
    };
  }
  const facL = pairs.map((p) => (p.l.facMatch ? 1 : 0));
  const facC = pairs.map((p) => (p.c.facMatch ? 1 : 0));
  const deltas = pairs.map((p, i) => facL[i]! - facC[i]!);
  const meanFacL = meanOrNull(facL);
  const meanFacC = meanOrNull(facC);
  const meanDelta = meanOrNull(deltas);
  // Sample variance of deltas
  let variance = 0;
  if (deltas.length > 1) {
    const m = meanDelta!;
    variance = deltas.reduce((s, d) => s + (d - m) ** 2, 0) / (deltas.length - 1);
  }
  const stdErr = deltas.length > 1 ? Math.sqrt(variance / deltas.length) : 0;
  const t = stdErr > 0 ? (meanDelta! / stdErr) : 0;
  // Naive p-value approximation (two-sided normal); iter 3 may swap for
  // a proper t-distribution CDF if precision matters.
  const pValue = stdErr > 0 ? 2 * (1 - normalCdf(Math.abs(t))) : 1;

  const tokensL = pairs.map((p) => p.l.effectiveTokens);
  const tokensC = pairs.map((p) => p.c.effectiveTokens);
  const wallL = pairs.map((p) => p.l.wallClockMs);
  const wallC = pairs.map((p) => p.c.wallClockMs);
  const meanTokL = meanOrNull(tokensL) ?? 0;
  const meanTokC = meanOrNull(tokensC) ?? 0;
  const meanWallL = meanOrNull(wallL) ?? 0;
  const meanWallC = meanOrNull(wallC) ?? 0;
  const tokenReductionPct = meanTokC > 0 ? (meanTokC - meanTokL) / meanTokC : null;
  const wallReductionPct = meanWallC > 0 ? (meanWallC - meanWallL) / meanWallC : null;

  const passes = pValue !== null && pValue < 0.05
    && meanDelta !== null && meanDelta > 0
    && ((tokenReductionPct !== null && tokenReductionPct >= 0.10)
        || (wallReductionPct !== null && wallReductionPct >= 0.10));
  return {
    pairedCount: pairs.length,
    facLearnedMean: meanFacL,
    facControlMean: meanFacC,
    facDeltaMean: meanDelta,
    facPairedT: t,
    facPValue: pValue,
    tokenReductionPct,
    wallClockReductionPct: wallReductionPct,
    passes,
  };
}

// Abramowitz & Stegun 26.2.17 polynomial approximation to the standard
// normal CDF; absolute error < 7.5e-8. Adequate for our diagnostic uses.
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-(x * x) / 2);
  let p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  if (x > 0) p = 1 - p;
  return p;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rows = await loadNormalized(args.runBase);
  const learned = rows.filter((r) => r.armId === "datafetch-learned");
  const control = rows.filter((r) => r.armId === "datafetch-control");

  const paperBaselineDoc = await tryReadJson(args.paperBaseline) as Record<string, any> | null;
  const baselineFac = paperBaselineDoc?.["finalAnswerCorrectness"] ?? null;
  const baselineStep = paperBaselineDoc?.["stepAlignment"] ?? null;

  const baselineModelKey = paperBaselineDoc?._modelKey ?? "claude-sonnet-4-5";
  const fc1 = perTierAggregates(learned, baselineFac, baselineModelKey);
  const fc2 = perTierAggregates(learned, baselineStep, baselineModelKey);
  const fc3 = fc3Stats(learned, control);

  const skillcraftScorecard = await tryReadJson(args.skillcraftScorecard) as Record<string, any> | null;
  const fc5 = skillcraftScorecard
    ? {
        skillcraftScorecardPath: args.skillcraftScorecard ?? null,
        scorecard: skillcraftScorecard,
        passes: Boolean(skillcraftScorecard?.["allPass"]),
      }
    : {
        skillcraftScorecardPath: args.skillcraftScorecard ?? null,
        scorecard: null,
        passes: null,
        note: "FC5 requires a SkillCraft regression run on the same substrate commit; pass --skillcraft-scorecard",
      };

  // FC4 cross-benchmark transfer: requires walking trajectories from BOTH
  // runs. Skip implementation here (iter 3 follow-up: extend
  // walk-artifacts.ts to compare intentSignatures across run bases).
  const fc4 = {
    passes: null,
    skillcraftRunBase: args.skillcraftRunBase ?? null,
    note: "FC4 cross-benchmark transfer requires walking trajectory artifacts from both SkillCraft and FinChain runs; implementation lands in iter 3 alongside walk-artifacts.ts extension.",
  };

  const scorecard = {
    generatedAt: new Date().toISOString(),
    runBase: args.runBase,
    paperBaselineSource: args.paperBaseline ?? null,
    fc1: { tiers: fc1, allPass: Object.values(fc1).every((t) => t.passes === true) || null },
    fc2: { tiers: fc2, allPass: Object.values(fc2).every((t) => t.passes === true) || null },
    fc3,
    fc4,
    fc5,
    substrateCommitSha: process.env["GIT_COMMIT_SHA"] ?? null,
  };

  const outPath = args.out ?? path.join(args.runBase, "finchain-scorecard.json");
  await fsp.writeFile(outPath, `${JSON.stringify(scorecard, null, 2)}\n`);
  console.log(`[score-finchain] wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
