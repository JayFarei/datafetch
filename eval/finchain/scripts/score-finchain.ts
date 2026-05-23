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
  goldIntermediateValues: number[];
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

async function tryReadJsonl<T>(p: string): Promise<T[] | null> {
  try {
    const raw = await fsp.readFile(p, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
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
  metric: "fac" | "stepAlignment",
): Record<string, PerTierMetric> {
  const tiers: Record<string, NormalizedRow[]> = {};
  for (const r of rows) {
    const t = r.difficulty ?? "Unknown";
    (tiers[t] ??= []).push(r);
  }
  const out: Record<string, PerTierMetric> = {};
  for (const [tier, tierRows] of Object.entries(tiers)) {
    const facRate = meanOrNull(tierRows.map((r) => (r.facMatch ? 1 : 0)));
    // Use the full goldIntermediateValues list when present (iter 2e
    // plumbing); fall back to single-element [goldFinalValue] for older runs.
    const stepScores = tierRows
      .map((r) => {
        const gold = (r.goldIntermediateValues && r.goldIntermediateValues.length > 0)
          ? r.goldIntermediateValues
          : (r.goldFinalValue !== null ? [r.goldFinalValue] : []);
        return stepAlignmentScore(r.derivationSteps ?? [], gold);
      })
      .filter((s): s is number => s !== null);
    const stepAlignment = meanOrNull(stepScores);
    // paperBaseline shape: { Basic: { "claude-sonnet-4-5": 0.83 }, ... }
    const tierBaselineMap = paperBaseline?.[tier] ?? paperBaseline?.[tier.toLowerCase()] ?? null;
    const baseline = tierBaselineMap && typeof tierBaselineMap === "object" && baselineModelKey in tierBaselineMap
      ? Number(tierBaselineMap[baselineModelKey])
      : null;
    // FC1 gates on FAC (final-answer correctness); FC2 gates on stepAlignment.
    // Use the right metric for the pass decision.
    const gateValue = metric === "fac" ? facRate : stepAlignment;
    out[tier] = {
      episodes: tierRows.length,
      facRate,
      stepAlignment,
      paperBaseline: baseline,
      passes: gateValue === null || baseline === null ? null : gateValue >= baseline,
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

interface SkillCraftInstrumentationRow {
  taskKey: string;
  family: string;
  helpersCalled?: string[];
  helperOrigins?: Array<{
    name: string;
    intentSignature: string | null;
    isSeed?: boolean;
  }>;
}

interface FinChainArtifactWalk {
  helpers?: Array<Record<string, unknown>>;
  discoveryEvidence?: {
    status?: string | null;
    inspectedSurfaces?: string[];
    helperCallSeen?: boolean;
    inspectedBeforeHelper?: boolean;
    events?: Array<Record<string, unknown>>;
    note?: string;
  };
  trajectories?: Array<{
    trajectoryId: string;
    family: string;
    libCalls?: string[];
    intentSignature: string | null;
  }>;
  R4R9?: {
    R4?: {
      pass?: boolean | null;
      quarantineRate?: number | null;
      quarantinedHelpers?: number | null;
      totalHelpers?: number | null;
    };
    R6?: { pass?: boolean | null; convergenceRate?: number | null };
    R7?: {
      pass?: boolean | null;
      conditionalReuseRate?: number | null;
      warmEpisodesWithHelper?: number | null;
      warmEpisodesReused?: number | null;
    };
    R9?: {
      pass?: boolean | null;
      crossShapeTransfer?: string | null;
      familiesReached?: string[];
    };
  };
}

interface IntentUse {
  signature: string;
  families: Set<string>;
  episodes: Set<string>;
}

function addIntentUse(
  bySignature: Map<string, IntentUse>,
  signature: string | null | undefined,
  family: string | null | undefined,
  episode: string | null | undefined,
): void {
  if (!signature || !family) return;
  const entry = bySignature.get(signature) ?? {
    signature,
    families: new Set<string>(),
    episodes: new Set<string>(),
  };
  entry.families.add(family);
  if (episode) entry.episodes.add(episode);
  bySignature.set(signature, entry);
}

function serialiseIntentUse(use: IntentUse): {
  intentSignature: string;
  families: string[];
  episodes: string[];
} {
  return {
    intentSignature: use.signature,
    families: [...use.families].sort(),
    episodes: [...use.episodes].sort(),
  };
}

async function fc4CrossBenchmarkTransfer(args: Args): Promise<Record<string, unknown>> {
  const finchainArtifactPath = path.join(args.runBase, "artifact-walk.json");
  const skillcraftInstrumentationPath = args.skillcraftRunBase
    ? path.join(args.skillcraftRunBase, "helper-instrumentation.jsonl")
    : null;
  if (!args.skillcraftRunBase || !skillcraftInstrumentationPath) {
    return {
      passes: null,
      skillcraftRunBase: args.skillcraftRunBase ?? null,
      finchainArtifactWalkPath: finchainArtifactPath,
      note: "FC4 requires --skillcraft-run-base with helper-instrumentation.jsonl",
    };
  }

  const [finchainWalk, skillcraftRows] = await Promise.all([
    tryReadJson(finchainArtifactPath) as Promise<FinChainArtifactWalk | null>,
    tryReadJsonl<SkillCraftInstrumentationRow>(skillcraftInstrumentationPath),
  ]);
  if (!finchainWalk) {
    return {
      passes: null,
      skillcraftRunBase: args.skillcraftRunBase,
      finchainArtifactWalkPath: finchainArtifactPath,
      skillcraftInstrumentationPath,
      note: "FC4 requires a FinChain artifact-walk.json; run eval/finchain/scripts/walk-artifacts.ts for the learned run and place/copy it at the scorecard run base.",
    };
  }
  if (!skillcraftRows) {
    return {
      passes: null,
      skillcraftRunBase: args.skillcraftRunBase,
      finchainArtifactWalkPath: finchainArtifactPath,
      skillcraftInstrumentationPath,
      note: "FC4 requires SkillCraft helper-instrumentation.jsonl from eval/skillcraft/scripts/walk-artifacts.ts",
    };
  }

  const skillcraftUses = new Map<string, IntentUse>();
  for (const row of skillcraftRows) {
    const called = new Set(row.helpersCalled ?? []);
    if (called.size === 0) continue;
    for (const origin of row.helperOrigins ?? []) {
      if (origin.isSeed || !called.has(origin.name)) continue;
      addIntentUse(skillcraftUses, origin.intentSignature, row.family, row.taskKey);
    }
  }

  const finchainUses = new Map<string, IntentUse>();
  for (const trajectory of finchainWalk.trajectories ?? []) {
    if ((trajectory.libCalls ?? []).length === 0) continue;
    addIntentUse(
      finchainUses,
      trajectory.intentSignature,
      trajectory.family,
      trajectory.trajectoryId,
    );
  }

  const shared: Array<{
    intentSignature: string;
    skillcraftFamilies: string[];
    finchainTopics: string[];
    skillcraftEpisodes: string[];
    finchainTrajectories: string[];
  }> = [];
  for (const [signature, skillcraftUse] of skillcraftUses) {
    const finchainUse = finchainUses.get(signature);
    if (!finchainUse) continue;
    shared.push({
      intentSignature: signature,
      skillcraftFamilies: [...skillcraftUse.families].sort(),
      finchainTopics: [...finchainUse.families].sort(),
      skillcraftEpisodes: [...skillcraftUse.episodes].sort(),
      finchainTrajectories: [...finchainUse.episodes].sort(),
    });
  }

  return {
    passes: shared.length > 0,
    skillcraftRunBase: args.skillcraftRunBase,
    finchainArtifactWalkPath: finchainArtifactPath,
    skillcraftInstrumentationPath,
    sharedIntentSignatures: shared,
    skillcraftCalledIntentSignatures: [...skillcraftUses.values()]
      .map(serialiseIntentUse)
      .sort((a, b) => a.intentSignature.localeCompare(b.intentSignature)),
    finchainCalledIntentSignatures: [...finchainUses.values()]
      .map(serialiseIntentUse)
      .sort((a, b) => a.intentSignature.localeCompare(b.intentSignature)),
  };
}

type HarnessStatus = "proven" | "weak" | "blocked";

const CODE_MODE_MIN_PAIRED_EPISODES = 3;
const CODE_MODE_MIN_WARM_REUSE_OPPORTUNITIES = 3;
const CODE_MODE_MIN_COMPRESSION_REDUCTION = 0.10;

function passFailConditional(
  value: boolean | null | undefined,
): HarnessStatus {
  if (value === true) return "proven";
  if (value === false) return "weak";
  return "blocked";
}

function rate(rows: NormalizedRow[], pick: (row: NormalizedRow) => boolean | null): number | null {
  const values = rows
    .map(pick)
    .filter((value): value is boolean => value !== null);
  return meanOrNull(values.map((value) => (value ? 1 : 0)));
}

function codeModeHarnessAssessment(input: {
  learned: NormalizedRow[];
  control: NormalizedRow[];
  fc3: ReturnType<typeof fc3Stats>;
  fc4: Record<string, unknown>;
  finchainWalk: FinChainArtifactWalk | null;
}): Record<string, unknown> {
  const learnedFacRate = rate(input.learned, (row) => row.facMatch);
  const controlFacRate = rate(input.control, (row) => row.facMatch);
  const learnedPassRate = rate(input.learned, (row) => row.passed);
  const noAccuracyRegression = input.fc3.pairedCount > 0
    && input.fc3.facLearnedMean !== null
    && input.fc3.facControlMean !== null
    && input.fc3.facLearnedMean >= input.fc3.facControlMean;
  const anyCompression = (input.fc3.tokenReductionPct !== null && input.fc3.tokenReductionPct > 0)
    || (input.fc3.wallClockReductionPct !== null && input.fc3.wallClockReductionPct > 0);
  const trajectories = input.finchainWalk?.trajectories ?? [];
  const libCallTrajectories = trajectories.filter((trajectory) =>
    (trajectory.libCalls ?? []).length > 0,
  );
  const calledIntentSignatures = [...new Set(
    libCallTrajectories
      .map((trajectory) => trajectory.intentSignature)
      .filter((signature): signature is string => Boolean(signature)),
  )].sort();
  const r4 = input.finchainWalk?.R4R9?.R4;
  const r6 = input.finchainWalk?.R4R9?.R6;
  const r7 = input.finchainWalk?.R4R9?.R7;
  const r9 = input.finchainWalk?.R4R9?.R9;
  const warmOpportunities = r7?.warmEpisodesWithHelper ?? 0;
  const maxCostReduction = Math.max(
    input.fc3.tokenReductionPct ?? Number.NEGATIVE_INFINITY,
    input.fc3.wallClockReductionPct ?? Number.NEGATIVE_INFINITY,
  );
  const helpers = input.finchainWalk?.helpers ?? [];
  const helpersWithContracts = helpers.filter((helper) =>
    typeof helper["replayContract"] === "string" &&
    typeof helper["changeContract"] === "string" &&
    typeof helper["verifier"] === "string" &&
    typeof helper["rollback"] === "string",
  ).length;
  const benchmarkSafetyStatus: HarnessStatus = input.fc3.pairedCount === 0
    ? "blocked"
    : input.fc3.pairedCount >= CODE_MODE_MIN_PAIRED_EPISODES
      && noAccuracyRegression
      && (learnedPassRate ?? 0) >= 0.92
      ? "proven"
      : "weak";
  const compressionStatus: HarnessStatus = input.fc3.pairedCount === 0
    ? "blocked"
    : input.fc3.pairedCount >= CODE_MODE_MIN_PAIRED_EPISODES
      && noAccuracyRegression
      && warmOpportunities >= CODE_MODE_MIN_WARM_REUSE_OPPORTUNITIES
      && libCallTrajectories.length >= CODE_MODE_MIN_WARM_REUSE_OPPORTUNITIES
      && maxCostReduction >= CODE_MODE_MIN_COMPRESSION_REDUCTION
      ? "proven"
      : "weak";
  const learningLoopStatus: HarnessStatus = input.finchainWalk === null
    ? "blocked"
    : r6?.pass === true
      && r7?.pass === true
      && warmOpportunities >= CODE_MODE_MIN_WARM_REUSE_OPPORTUNITIES
      && libCallTrajectories.length >= CODE_MODE_MIN_WARM_REUSE_OPPORTUNITIES
      ? "proven"
      : "weak";
  const libraryMaturityStatus: HarnessStatus = input.finchainWalk === null
    ? "blocked"
    : r4?.pass === true && helpers.length > 0 && helpersWithContracts === helpers.length
      ? "proven"
      : "weak";
  const crossBenchmarkStatus = passFailConditional(input.fc4["passes"] as boolean | null | undefined);
  const withinBenchmarkStatus = passFailConditional(r9?.pass);
  const discoveryEvidence = input.finchainWalk?.discoveryEvidence ?? null;
  const filesystemDiscoveredStatus: HarnessStatus =
    discoveryEvidence?.status === "proven" && libCallTrajectories.length > 0
      ? "proven"
      : "blocked";
  const generalityStatus: HarnessStatus =
    crossBenchmarkStatus === "proven" || withinBenchmarkStatus === "proven"
      ? "proven"
      : crossBenchmarkStatus === "blocked" && withinBenchmarkStatus === "blocked"
        ? "blocked"
        : "weak";
  const reuseEvidenceStatus: HarnessStatus = libCallTrajectories.length === 0
    ? "blocked"
    : filesystemDiscoveredStatus === "proven"
      && warmOpportunities >= CODE_MODE_MIN_WARM_REUSE_OPPORTUNITIES
      && r7?.pass === true
      ? "proven"
      : "weak";
  const layerStatuses = [
    benchmarkSafetyStatus,
    "weak" as HarnessStatus, // codeModeContract is external to this scorecard.
    learningLoopStatus,
    compressionStatus,
    libraryMaturityStatus,
    reuseEvidenceStatus,
    generalityStatus,
  ];
  const overallStatus: HarnessStatus = layerStatuses.every((status) => status === "proven")
    ? "proven"
    : layerStatuses.includes("blocked")
      ? "blocked"
      : "weak";

  return {
    statusVocabulary: {
      proven: "current scorecard evidence meets the minimum anti-gaming threshold for this layer",
      weak: "some useful evidence exists, but sample size, threshold strength, or provenance is insufficient for a product conclusion",
      blocked: "required evidence is missing from this scorecard",
    },
    overallStatus,
    thresholds: {
      minPairedEpisodes: CODE_MODE_MIN_PAIRED_EPISODES,
      minWarmReuseOpportunities: CODE_MODE_MIN_WARM_REUSE_OPPORTUNITIES,
      minCompressionReductionPct: CODE_MODE_MIN_COMPRESSION_REDUCTION,
    },
    note: [
      "Diagnostic product-alignment rubric for code-mode learning quality.",
      "It does not change FC1-FC5 pass/fail semantics; FC gates remain benchmark-success evidence.",
      "FC3 still requires FAC uplift for benchmark success, while this layer treats saturated correctness as useful only when accuracy is preserved and cost compression clears a diagnostic threshold.",
      "FC4 same-signature transfer remains reported separately from broader harness generality.",
      "Diagnostic pass-like claims are intentionally harder than a single warm reuse or a tiny positive token delta.",
    ].join(" "),
    layers: {
      benchmarkSafety: {
        status: benchmarkSafetyStatus,
        learnedFacRate,
        controlFacRate,
        learnedPassRate,
        pairedCount: input.fc3.pairedCount,
        minPairedEpisodes: CODE_MODE_MIN_PAIRED_EPISODES,
        requirement: "preserve correctness before treating reuse or compression as useful",
      },
      codeModeContract: {
        status: "weak" as HarnessStatus,
        requirement: "prove the VFS/TypeScript surface matches runtime behavior",
        evidenceOutsideScorecard: [
          "tests/finchain-workspace-surface.test.ts",
          "workspace AGENTS.md / df.d.ts / prepared-answer.ts artifacts",
        ],
        note: "This scorecard reads eval outputs only, so it cannot independently prove prompt/type/runtime alignment.",
      },
      learningLoop: {
        status: learningLoopStatus,
        convergence: r6 ?? null,
        conditionalReuse: r7 ?? null,
        libCallTrajectories: libCallTrajectories.length,
        minWarmReuseOpportunities: CODE_MODE_MIN_WARM_REUSE_OPPORTUNITIES,
        calledIntentSignatures,
        requirement: "repeated intents crystallise tenant helpers and warm episodes call them through df.lib",
      },
      reuseEvidence: {
        status: reuseEvidenceStatus,
        promptDirected: {
          status: libCallTrajectories.length > 0 ? "proven" : "blocked",
          libCallTrajectories: libCallTrajectories.length,
          note: "A helper call in a run whose prompt may mandate helpers proves directed reuse, not natural discovery.",
        },
        filesystemDiscovered: {
          status: filesystemDiscoveredStatus,
          inspectedSurfaces: discoveryEvidence?.inspectedSurfaces ?? [],
          helperCallSeen: Boolean(discoveryEvidence?.helperCallSeen),
          inspectedBeforeHelper: Boolean(discoveryEvidence?.inspectedBeforeHelper),
          eventCount: discoveryEvidence?.events?.length ?? 0,
          note: discoveryEvidence?.note ?? "Requires ordered agent evidence that the agent inspected AGENTS.md, df.d.ts, lib/, man, or apropos before selecting the helper.",
        },
        heldOutDiscovered: {
          status: warmOpportunities >= CODE_MODE_MIN_WARM_REUSE_OPPORTUNITIES && r7?.pass === true
            ? "weak"
            : warmOpportunities > 0
              ? "weak"
              : "blocked",
          warmOpportunities,
          minWarmReuseOpportunities: CODE_MODE_MIN_WARM_REUSE_OPPORTUNITIES,
          note: "Current artifacts do not distinguish held-out discovered reuse from prompt-directed reuse.",
        },
        requirement: "separate prompt-directed reuse from filesystem-discovered and held-out reuse",
      },
      compression: {
        status: compressionStatus,
        tokenReductionPct: input.fc3.tokenReductionPct,
        wallClockReductionPct: input.fc3.wallClockReductionPct,
        maxCostReductionPct: Number.isFinite(maxCostReduction) ? maxCostReduction : null,
        minReductionPct: CODE_MODE_MIN_COMPRESSION_REDUCTION,
        noAccuracyRegression,
        anyPositiveReduction: anyCompression,
        requirement: "learned path preserves accuracy and clears a minimum cost-reduction threshold",
      },
      libraryMaturity: {
        status: libraryMaturityStatus,
        quarantine: r4 ?? null,
        helpers: helpers.length,
        helpersWithContracts,
        requiredContractFields: ["replayContract", "changeContract", "verifier", "rollback"],
        requirement: "learned helpers stay inside hook/quarantine governance and expose replay/change/verifier/rollback contracts",
      },
      generality: {
        status: generalityStatus,
        withinBenchmarkTransfer: {
          status: withinBenchmarkStatus,
          crossShapeTransfer: r9?.crossShapeTransfer ?? null,
          familiesReached: r9?.familiesReached ?? [],
        },
        crossBenchmarkSameSignature: {
          status: crossBenchmarkStatus,
          fc4: input.fc4,
        },
        requirement: "separate within-domain reusable harness behavior from strict cross-benchmark same-signature transfer",
      },
    },
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
  const fc1 = perTierAggregates(learned, baselineFac, baselineModelKey, "fac");
  const fc2 = perTierAggregates(learned, baselineStep, baselineModelKey, "stepAlignment");
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

  const fc4 = await fc4CrossBenchmarkTransfer(args);
  const finchainWalk = await tryReadJson(path.join(args.runBase, "artifact-walk.json")) as FinChainArtifactWalk | null;
  const codeModeHarness = codeModeHarnessAssessment({
    learned,
    control,
    fc3,
    fc4,
    finchainWalk,
  });

  const scorecard = {
    generatedAt: new Date().toISOString(),
    runBase: args.runBase,
    paperBaselineSource: args.paperBaseline ?? null,
    fc1: { tiers: fc1, allPass: Object.values(fc1).every((t) => t.passes === true) || null },
    fc2: { tiers: fc2, allPass: Object.values(fc2).every((t) => t.passes === true) || null },
    fc3,
    fc4,
    fc5,
    codeModeHarness,
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
