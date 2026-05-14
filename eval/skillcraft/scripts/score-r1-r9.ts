// Goal 4 iter 7 — R1-R9 scorecard.
//
// `analyze-results.ts` computes the Goal-3-era aggregates (pass rate,
// tokens, runtime errors) but NOT the Goal 4 loop-honesty conditions
// R6-R9. Those need a join across three artifacts that no single
// pipeline step produces together:
//   - normalized.jsonl            (per-episode correctness + cost + phase)
//   - helper-instrumentation.jsonl (per-episode helper availability /
//                                   calls / origins / quarantine — from
//                                   walk-artifacts.ts)
//   - intent-clusters.json        (trajectoryId -> intentSignature
//                                   clustering — from
//                                   intent-cluster-analysis.ts)
//
// This script performs that join and emits the R1-R9 scorecard. It is
// strictly read-only — no substrate behaviour, no eval re-run.
//
// The rubric (PLAN.md § "What proves Goal 4"):
//   R1 passRate            >= 0.92
//   R2 avgEffectiveTokens  <= 8000
//   R3 runtimeErrorRate    <= 0.05
//   R4 quarantineRate      <= 0.03   (quarantined / crystallised helpers)
//   R5 novel-tenant smoke  — EXTERNAL: verified by `pnpm test`, not here.
//   R6 convergence rate    — of intent clusters with >=2 qualifying
//                            (successful) trajectories, >=80% crystallise
//                            exactly one callable helper.
//   R7 conditional reuse   — of warm episodes where a same-intent
//                            crystallised helper is available, >=60% call
//                            it (per_entity seed excluded).
//   R8 conditional cost    — episodes that reused a crystallised helper
//                            cost <=70% of the nearest earlier same-intent
//                            non-reuse episode (paired same-intent delta).
//   R9 cross-shape xfer    — the same intentSignature crystallises a
//                            helper reused (called) across >=2 families.
//
// Usage:
//   tsx eval/skillcraft/scripts/score-r1-r9.ts --run <baseDir> [--out <file>]
//   tsx eval/skillcraft/scripts/score-r1-r9.ts \
//     --normalized <f> --instrumentation <f> --clusters <f> --out <f>
//
// With --run, the three inputs default to <baseDir>/normalized.jsonl,
// <baseDir>/helper-instrumentation.jsonl, <baseDir>/intent-clusters.json
// and --out defaults to <baseDir>/r1-r9-scorecard.json.

import { promises as fsp } from "node:fs";
import path from "node:path";

interface Args {
  normalized: string;
  instrumentation: string;
  clusters: string;
  out: string;
}

// --- input row shapes (subset of fields actually consumed) ----------------

interface NormalizedRow {
  taskKey: string;
  canonicalTaskKey?: string;
  family: string;
  level: string;
  phase: "train" | "warm" | "hard" | "unknown";
  arm: string;
  officialPassed: boolean;
  passedGe70?: boolean;
  officialScorePercent: number;
  runtimeStatus: string | null;
  effectiveTokens: number | null;
}

interface HelperOrigin {
  name: string;
  shapeHash: string | null;
  originTrajectory: string | null;
  intentSignature: string | null;
  isSeed: boolean;
}

interface InstrumentationRow {
  taskKey: string;
  family: string;
  level: string;
  phase: "train" | "warm" | "hard" | "unknown";
  trajectoryId: string | null;
  helpersAvailable: string[];
  helpersAfterAgent: string[];
  helpersCreatedThisEpisode: string[];
  helpersCalled: string[];
  seedCalled: boolean;
  quarantinedHelpers: string[];
  helperOrigins: HelperOrigin[];
}

interface ClusterMember {
  family: string;
  level: string;
  trajectoryId: string;
}

interface Cluster {
  intentSignature: string;
  count: number;
  families: string[];
  familyCount: number;
  members: ClusterMember[];
}

interface ClusterReport {
  clusters: Cluster[];
}

function parseArgs(argv: string[]): Args {
  let run: string | null = null;
  let normalized: string | null = null;
  let instrumentation: string | null = null;
  let clusters: string | null = null;
  let out: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const take = (): string => path.resolve(argv[++i]!);
    if (arg === "--run") run = take();
    else if (arg.startsWith("--run=")) run = path.resolve(arg.slice("--run=".length));
    else if (arg === "--normalized") normalized = take();
    else if (arg.startsWith("--normalized=")) normalized = path.resolve(arg.slice("--normalized=".length));
    else if (arg === "--instrumentation") instrumentation = take();
    else if (arg.startsWith("--instrumentation=")) instrumentation = path.resolve(arg.slice("--instrumentation=".length));
    else if (arg === "--clusters") clusters = take();
    else if (arg.startsWith("--clusters=")) clusters = path.resolve(arg.slice("--clusters=".length));
    else if (arg === "--out") out = take();
    else if (arg.startsWith("--out=")) out = path.resolve(arg.slice("--out=".length));
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (run) {
    normalized = normalized ?? path.join(run, "normalized.jsonl");
    instrumentation = instrumentation ?? path.join(run, "helper-instrumentation.jsonl");
    clusters = clusters ?? path.join(run, "intent-clusters.json");
    out = out ?? path.join(run, "r1-r9-scorecard.json");
  }
  if (!normalized || !instrumentation || !clusters || !out) {
    throw new Error(
      "pass --run <baseDir>, or all of --normalized --instrumentation --clusters --out",
    );
  }
  return { normalized, instrumentation, clusters, out };
}

async function readJsonl<T>(file: string): Promise<T[]> {
  const text = await fsp.readFile(file, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fsp.readFile(file, "utf8")) as T;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

const round = (v: number, dp = 4): number => Number(v.toFixed(dp));

// trajectoryId looks like `traj_20260513103403_e1l9iu` — the 14-digit
// block is a sortable timestamp. Used by R8 to find the "nearest earlier"
// same-intent episode. Falls back to the canonical level order.
const LEVEL_ORDER: Record<string, number> = {
  e1: 0,
  e2: 1,
  e3: 2,
  m1: 3,
  m2: 4,
  h1: 5,
};

function trajectoryTimestamp(trajectoryId: string | null, level: string): string {
  const m = trajectoryId?.match(/^traj_(\d{14})_/);
  if (m) return m[1]!;
  // Fallback: a level-ordinal padded so it sorts; not cross-family
  // comparable, but R8 only ever compares within one intentSignature and
  // same-intent episodes from one family run in level order.
  return `00000000000000`.slice(0, 13) + String(LEVEL_ORDER[level] ?? 9);
}

interface ConditionResult {
  name: string;
  description: string;
  value: number | string | null;
  threshold: string;
  met: boolean | null;
  detail?: unknown;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const normalizedRows = await readJsonl<NormalizedRow>(args.normalized);
  const instrumentationRows = await readJsonl<InstrumentationRow>(args.instrumentation);
  const clusterReport = await readJson<ClusterReport>(args.clusters);

  // Goal 4 is scored on the learning arm only. A goal2-full.sh run emits
  // only `datafetch-learned`, but filter anyway so a mixed file is safe.
  const learned = normalizedRows.filter((r) => r.arm === "datafetch-learned");

  // --- joins --------------------------------------------------------------

  const keyOf = (family: string, level: string): string => `${family}/${level}`;

  const normByKey = new Map<string, NormalizedRow>();
  for (const row of learned) normByKey.set(keyOf(row.family, row.level), row);

  const instByKey = new Map<string, InstrumentationRow>();
  for (const row of instrumentationRows) {
    instByKey.set(keyOf(row.family, row.level), row);
  }

  // trajectoryId -> intentSignature, via the offline cluster report.
  const sigByTrajectory = new Map<string, string>();
  for (const cluster of clusterReport.clusters) {
    for (const member of cluster.members) {
      sigByTrajectory.set(member.trajectoryId, cluster.intentSignature);
    }
  }

  // Episode -> its own intentSignature (the intent the agent enacted).
  const sigByKey = new Map<string, string>();
  for (const row of instrumentationRows) {
    if (!row.trajectoryId) continue;
    const sig = sigByTrajectory.get(row.trajectoryId);
    if (sig) sigByKey.set(keyOf(row.family, row.level), sig);
  }

  // Every crystallised (observer-authored, non-seed) helper seen anywhere
  // in the run, keyed by name. shapeHash !== null is the observer-authored
  // marker (agent-hand-authored helpers and the seed have no @shape-hash).
  // Carries the intentSignature stamped in the `.ts` header by iter 3.
  const crystallisedByName = new Map<string, HelperOrigin>();
  for (const row of instrumentationRows) {
    for (const origin of row.helperOrigins) {
      if (origin.isSeed) continue;
      if (origin.shapeHash === null) continue; // not observer-authored
      const existing = crystallisedByName.get(origin.name);
      // Prefer an entry that carries an intentSignature.
      if (!existing || (existing.intentSignature === null && origin.intentSignature !== null)) {
        crystallisedByName.set(origin.name, origin);
      }
    }
  }

  // intentSignature -> set of distinct callable crystallised helper names.
  const quarantinedNames = new Set<string>();
  for (const row of instrumentationRows) {
    for (const name of row.quarantinedHelpers) quarantinedNames.add(name);
  }
  const callableHelpersBySig = new Map<string, Set<string>>();
  for (const [name, origin] of crystallisedByName) {
    if (origin.intentSignature === null) continue;
    if (quarantinedNames.has(name)) continue;
    const set = callableHelpersBySig.get(origin.intentSignature) ?? new Set<string>();
    set.add(name);
    callableHelpersBySig.set(origin.intentSignature, set);
  }

  // --- R1-R4: correctness / cost / trust gates ----------------------------

  const passRate = mean(learned.map((r) => (r.officialPassed ? 1 : 0)));
  const effTokens = learned
    .map((r) => r.effectiveTokens)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const avgEffectiveTokens = mean(effTokens);
  const runtimeErrorRate = mean(
    learned.map((r) => (r.runtimeStatus === "runtime_error" ? 1 : 0)),
  );

  const crystallisedNames = new Set(crystallisedByName.keys());
  const quarantinedCrystallised = [...quarantinedNames].filter((n) =>
    crystallisedNames.has(n),
  );
  const quarantineRate =
    crystallisedNames.size === 0
      ? 0
      : quarantinedCrystallised.length / crystallisedNames.size;

  // --- normalizer false-negative cross-check ------------------------------
  // The handoff (PLAN.md): a timed-out agent that still wrote a valid
  // answer must NOT be demoted to infrastructure_error. Surface any row
  // that scored >= 70 yet is not counted as passed, split by why.
  const ge70NotPassed = learned.filter(
    (r) => r.officialScorePercent >= 70 && !r.officialPassed,
  );
  const normalizerCrossCheck = {
    ge70ButNotPassed: ge70NotPassed.length,
    byRuntimeStatus: ge70NotPassed.reduce<Record<string, number>>((acc, r) => {
      const k = r.runtimeStatus ?? "null";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {}),
    rows: ge70NotPassed.map((r) => ({
      taskKey: r.taskKey,
      score: r.officialScorePercent,
      runtimeStatus: r.runtimeStatus,
    })),
  };

  // --- R6: convergence rate ----------------------------------------------
  // A cluster "qualifies" when it has >= 2 successful trajectories
  // (PLAN.md: "intent clusters observed with >= 2 qualifying successful
  // trajectories"). It "converges" when exactly one callable crystallised
  // helper carries its intentSignature.
  const r6Detail: Array<{
    intentSignature: string;
    trajectories: number;
    successfulTrajectories: number;
    familyCount: number;
    callableHelpers: string[];
    converged: boolean;
  }> = [];
  for (const cluster of clusterReport.clusters) {
    let successful = 0;
    for (const member of cluster.members) {
      const norm = normByKey.get(keyOf(member.family, member.level));
      if (norm?.officialPassed) successful += 1;
    }
    const callable = [...(callableHelpersBySig.get(cluster.intentSignature) ?? [])].sort();
    r6Detail.push({
      intentSignature: cluster.intentSignature,
      trajectories: cluster.count,
      successfulTrajectories: successful,
      familyCount: cluster.familyCount,
      callableHelpers: callable,
      converged: callable.length === 1,
    });
  }
  const qualifyingClusters = r6Detail.filter((c) => c.successfulTrajectories >= 2);
  const convergedQualifying = qualifyingClusters.filter((c) => c.converged);
  const convergenceRate =
    qualifyingClusters.length === 0
      ? null
      : convergedQualifying.length / qualifyingClusters.length;

  // --- R7: conditional reuse ---------------------------------------------
  // Warm episode is "in the denominator" when a same-intent, non-seed
  // crystallised helper is in helpersAvailable. It's "in the numerator"
  // when helpersCalled contains a same-intent non-seed helper.
  const r7Detail: Array<{
    taskKey: string;
    intentSignature: string;
    availableSameIntent: string[];
    calledSameIntent: string[];
    reused: boolean;
  }> = [];
  for (const row of instrumentationRows) {
    if (row.phase !== "warm") continue;
    const sig = sigByKey.get(keyOf(row.family, row.level));
    if (!sig) continue;
    const originByName = new Map(row.helperOrigins.map((o) => [o.name, o]));
    const sameIntentLearned = (names: string[]): string[] =>
      names.filter((n) => {
        const o = originByName.get(n);
        return o !== undefined && !o.isSeed && o.intentSignature === sig;
      });
    const availableSameIntent = sameIntentLearned(row.helpersAvailable);
    if (availableSameIntent.length === 0) continue; // not in denominator
    const calledSameIntent = sameIntentLearned(row.helpersCalled);
    r7Detail.push({
      taskKey: row.taskKey,
      intentSignature: sig,
      availableSameIntent,
      calledSameIntent,
      reused: calledSameIntent.length > 0,
    });
  }
  const conditionalReuseRate =
    r7Detail.length === 0
      ? null
      : r7Detail.filter((d) => d.reused).length / r7Detail.length;

  // --- R8: conditional cost-drop -----------------------------------------
  // For each "reuse episode" (called a same-intent non-seed helper), find
  // the nearest earlier same-intent NON-reuse episode and compare cost
  // (effectiveTokens). A reuse episode counts as "called a same-intent
  // crystallised helper"; a non-reuse episode called no learned helper at
  // all (helpersCalled empty).
  interface EpisodeCost {
    taskKey: string;
    family: string;
    level: string;
    intentSignature: string;
    timestamp: string;
    reused: boolean;
    cost: number | null;
  }
  const episodeCosts: EpisodeCost[] = [];
  for (const row of instrumentationRows) {
    const sig = sigByKey.get(keyOf(row.family, row.level));
    if (!sig) continue;
    const originByName = new Map(row.helperOrigins.map((o) => [o.name, o]));
    const calledSameIntentLearned = row.helpersCalled.filter((n) => {
      const o = originByName.get(n);
      return o !== undefined && !o.isSeed && o.intentSignature === sig;
    });
    const norm = normByKey.get(keyOf(row.family, row.level));
    episodeCosts.push({
      taskKey: row.taskKey,
      family: row.family,
      level: row.level,
      intentSignature: sig,
      timestamp: trajectoryTimestamp(row.trajectoryId, row.level),
      reused: calledSameIntentLearned.length > 0,
      cost: norm?.effectiveTokens ?? null,
    });
  }
  // index non-reuse episodes (called no learned helper) per intentSignature
  const nonReuseBySig = new Map<string, EpisodeCost[]>();
  for (const row of instrumentationRows) {
    const sig = sigByKey.get(keyOf(row.family, row.level));
    if (!sig) continue;
    if (row.helpersCalled.length > 0) continue; // called a learned helper -> not a clean baseline
    const ec = episodeCosts.find((e) => e.taskKey === row.taskKey && e.family === row.family && e.level === row.level);
    if (!ec || ec.cost === null) continue;
    const list = nonReuseBySig.get(sig) ?? [];
    list.push(ec);
    nonReuseBySig.set(sig, list);
  }
  const r8Detail: Array<{
    reuseEpisode: string;
    baselineEpisode: string;
    intentSignature: string;
    reuseCost: number;
    baselineCost: number;
    ratio: number;
  }> = [];
  for (const ec of episodeCosts) {
    if (!ec.reused || ec.cost === null) continue;
    const candidates = (nonReuseBySig.get(ec.intentSignature) ?? [])
      .filter((b) => b.timestamp < ec.timestamp)
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    const baseline = candidates[0];
    if (!baseline || baseline.cost === null || baseline.cost <= 0) continue;
    r8Detail.push({
      reuseEpisode: `${ec.family}/${ec.level}`,
      baselineEpisode: `${baseline.family}/${baseline.level}`,
      intentSignature: ec.intentSignature,
      reuseCost: ec.cost,
      baselineCost: baseline.cost,
      ratio: round(ec.cost / baseline.cost),
    });
  }
  const r8Ratios = r8Detail.map((d) => d.ratio);
  const r8MeanRatio = r8Ratios.length ? round(mean(r8Ratios)) : null;
  const r8MedianRatio = r8Ratios.length ? round(median(r8Ratios)) : null;
  const r8AggregateRatio = r8Detail.length
    ? round(
        r8Detail.reduce((s, d) => s + d.reuseCost, 0) /
          r8Detail.reduce((s, d) => s + d.baselineCost, 0),
      )
    : null;
  const r8PassFraction = r8Ratios.length
    ? round(r8Ratios.filter((r) => r <= 0.7).length / r8Ratios.length)
    : null;

  // --- R9: cross-shape transfer ------------------------------------------
  // Group every CALLED non-seed crystallised helper by the intentSignature
  // stamped in its `.ts` header; record the families it was called in. An
  // intentSignature called across >= 2 families is the data-shape-agnostic
  // transfer proof (different families = different db collections / tool
  // bundles = different data shapes).
  const transferBySig = new Map<
    string,
    { helpers: Set<string>; families: Set<string>; episodes: string[] }
  >();
  for (const row of instrumentationRows) {
    const originByName = new Map(row.helperOrigins.map((o) => [o.name, o]));
    for (const name of row.helpersCalled) {
      const o = originByName.get(name);
      if (!o || o.isSeed || o.intentSignature === null) continue;
      const entry =
        transferBySig.get(o.intentSignature) ?? {
          helpers: new Set<string>(),
          families: new Set<string>(),
          episodes: [] as string[],
        };
      entry.helpers.add(name);
      entry.families.add(row.family);
      entry.episodes.push(`${row.family}/${row.level}`);
      transferBySig.set(o.intentSignature, entry);
    }
  }
  const transferEvidence = [...transferBySig.entries()]
    .map(([intentSignature, e]) => ({
      intentSignature,
      helpers: [...e.helpers].sort(),
      families: [...e.families].sort(),
      familyCount: e.families.size,
      episodes: e.episodes.sort(),
    }))
    .sort((a, b) => b.familyCount - a.familyCount);
  const crossShape = transferEvidence.filter((t) => t.familyCount >= 2);

  // --- per-tier breakdown -------------------------------------------------
  const perTier: Record<string, unknown> = {};
  for (const phase of ["train", "warm", "hard", "unknown"]) {
    const group = learned.filter((r) => (r.phase ?? "unknown") === phase);
    if (group.length === 0) continue;
    const tokens = group
      .map((r) => r.effectiveTokens)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    perTier[phase] = {
      count: group.length,
      passRate: round(mean(group.map((r) => (r.officialPassed ? 1 : 0)))),
      passed: group.filter((r) => r.officialPassed).length,
      avgEffectiveTokens: tokens.length ? round(mean(tokens), 1) : null,
      runtimeErrors: group.filter((r) => r.runtimeStatus === "runtime_error").length,
    };
  }

  // --- assemble scorecard -------------------------------------------------
  const rubric: Record<string, ConditionResult> = {
    R1: {
      name: "passRate",
      description: "fraction of episodes officially passed",
      value: round(passRate),
      threshold: ">= 0.92",
      met: passRate >= 0.92,
    },
    R2: {
      name: "avgEffectiveTokens",
      description: "mean effective tokens per episode",
      value: round(avgEffectiveTokens, 1),
      threshold: "<= 8000",
      met: avgEffectiveTokens <= 8000,
    },
    R3: {
      name: "runtimeErrorRate",
      description: "fraction of episodes with a snippet runtime error",
      value: round(runtimeErrorRate),
      threshold: "<= 0.05",
      met: runtimeErrorRate <= 0.05,
    },
    R4: {
      name: "quarantineRate",
      description:
        "distinct quarantined crystallised helpers / distinct crystallised helpers",
      value: round(quarantineRate),
      threshold: "<= 0.03",
      met: quarantineRate <= 0.03,
      detail: {
        crystallisedHelpers: crystallisedNames.size,
        quarantinedCrystallised,
      },
    },
    R5: {
      name: "novelTenantSmoke",
      description:
        "novel-tenant smoke passes with zero substrate edits — EXTERNAL, run `pnpm test`",
      value: null,
      threshold: "smoke green",
      met: null,
    },
    R6: {
      name: "convergenceRate",
      description:
        "of intent clusters with >= 2 successful trajectories, fraction that crystallise exactly one callable helper",
      value: convergenceRate === null ? null : round(convergenceRate),
      threshold: ">= 0.80",
      met: convergenceRate === null ? null : convergenceRate >= 0.8,
      detail: {
        qualifyingClusters: qualifyingClusters.length,
        convergedQualifying: convergedQualifying.length,
        clusters: r6Detail
          .slice()
          .sort((a, b) => b.successfulTrajectories - a.successfulTrajectories),
      },
    },
    R7: {
      name: "conditionalReuse",
      description:
        "of warm episodes where a same-intent crystallised helper is available, fraction that call it (seed excluded)",
      value: conditionalReuseRate === null ? null : round(conditionalReuseRate),
      threshold: ">= 0.60",
      met: conditionalReuseRate === null ? null : conditionalReuseRate >= 0.6,
      detail: {
        warmEpisodesWithSameIntentHelperAvailable: r7Detail.length,
        reused: r7Detail.filter((d) => d.reused).length,
        episodes: r7Detail,
      },
    },
    R8: {
      name: "conditionalCostDrop",
      description:
        "reuse episode cost vs nearest earlier same-intent non-reuse episode (paired same-intent delta)",
      value: r8MeanRatio,
      threshold: "mean paired ratio <= 0.70",
      met: r8MeanRatio === null ? null : r8MeanRatio <= 0.7,
      detail: {
        pairedReuseEpisodes: r8Detail.length,
        meanRatio: r8MeanRatio,
        medianRatio: r8MedianRatio,
        aggregateRatio: r8AggregateRatio,
        perPairPassFraction: r8PassFraction,
        pairs: r8Detail,
      },
    },
    R9: {
      name: "crossShapeTransfer",
      description:
        "an intentSignature whose crystallised helper is called across >= 2 families with different data shapes",
      value: crossShape.length > 0 ? crossShape[0]!.intentSignature : null,
      threshold: ">= 1 intentSignature reused across >= 2 families",
      met: crossShape.length > 0,
      detail: {
        crossShapeSignatures: crossShape,
        allCalledHelperSignatures: transferEvidence,
      },
    },
  };

  // R5 is external; treat null as "not yet confirmed" — allMet stays false
  // until the smoke is verified and stitched in by the gap-analysis step.
  const scoredConditions = Object.values(rubric);
  const allMetExceptR5 = scoredConditions
    .filter((c) => c.name !== "novelTenantSmoke")
    .every((c) => c.met === true);

  // --- signature-join diagnostic -----------------------------------------
  // R6/R9 join the offline cluster intentSignatures (computed over whole
  // trajectories) against the @intent-signature stamped in crystallised
  // `.ts` headers (computed over a template's call slice — which for a
  // NESTED template is a sub-signature). If these two signature spaces
  // barely intersect, R6/R9 are unscoreable for a structural reason, not
  // a learning failure — surface it so gap analysis is one glance.
  const clusterSigs = new Set(clusterReport.clusters.map((c) => c.intentSignature));
  const headerSigs = new Set<string>();
  for (const o of crystallisedByName.values()) {
    if (o.intentSignature !== null) headerSigs.add(o.intentSignature);
  }
  const sigIntersection = [...headerSigs].filter((s) => clusterSigs.has(s));
  const signatureJoinDiagnostic = {
    clusterSignatures: clusterSigs.size,
    crystallisedHelperSignatures: headerSigs.size,
    intersection: sigIntersection.length,
    crystallisedHelpersWithNoSignature: [...crystallisedByName.values()].filter(
      (o) => o.intentSignature === null,
    ).length,
    headerSignaturesNotInAnyCluster: [...headerSigs].filter(
      (s) => !clusterSigs.has(s),
    ),
  };

  const scorecard = {
    generatedAt: new Date().toISOString(),
    inputs: {
      normalized: args.normalized,
      instrumentation: args.instrumentation,
      clusters: args.clusters,
    },
    episodeCount: learned.length,
    instrumentationRowCount: instrumentationRows.length,
    clusterCount: clusterReport.clusters.length,
    allMet: allMetExceptR5 && rubric.R5!.met === true,
    allMetExceptR5,
    rubric,
    perTier,
    normalizerCrossCheck,
    signatureJoinDiagnostic,
  };

  await fsp.mkdir(path.dirname(args.out), { recursive: true });
  await fsp.writeFile(args.out, JSON.stringify(scorecard, null, 2) + "\n", "utf8");

  // --- console summary ----------------------------------------------------
  const fmt = (c: ConditionResult): string => {
    const flag = c.met === true ? "PASS" : c.met === false ? "FAIL" : "????";
    return `  [${flag}] ${c.name.padEnd(22)} ${String(c.value).padEnd(28)} (${c.threshold})`;
  };
  console.log(`[score-r1-r9] ${learned.length} episodes, ${clusterReport.clusters.length} intent clusters`);
  for (const key of ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9"]) {
    console.log(`${key}${fmt(rubric[key]!)}`);
  }
  console.log(
    `[score-r1-r9] all R1-R9 except R5(external): ${allMetExceptR5 ? "MET" : "NOT MET"}`,
  );
  if (normalizerCrossCheck.ge70ButNotPassed > 0) {
    console.log(
      `[score-r1-r9] normalizer cross-check: ${normalizerCrossCheck.ge70ButNotPassed} rows scored >=70 but not passed — ${JSON.stringify(normalizerCrossCheck.byRuntimeStatus)}`,
    );
  }
  console.log(
    `[score-r1-r9] signature join: ${signatureJoinDiagnostic.intersection}/${signatureJoinDiagnostic.crystallisedHelperSignatures} helper sigs intersect ${signatureJoinDiagnostic.clusterSignatures} cluster sigs`,
  );
  console.log(`[score-r1-r9] scorecard → ${args.out}`);
}

main().catch((err) => {
  console.error("[score-r1-r9] failed:", err);
  process.exit(1);
});
