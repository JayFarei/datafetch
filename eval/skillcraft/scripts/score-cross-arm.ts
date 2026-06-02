// SaC-aligned PoC — cross-arm scorer.
//
// `score-r1-r9.ts` is intra-arm by construction (it filters to
// `arm === "datafetch-learned"` at :431 and scores one arm's loop-honesty
// rubric). It CANNOT express a cross-arm baseline comparison, so this is a
// new, separate script per CONTRACT.md §(e) and plan 009 Milestone 6.
//
// This script consumes the SaC-PoC episode schema (CONTRACT.md §(b)) via
// `normalized.jsonl` rows keyed on `sacArm`, and emits:
//
//   PRIMARY (R6)  — pre-registered lifecycle break-even
//                   M* = (build_cost + governance_cost)
//                        / (arm1_inline_cost_per_q - arm4_warm_call_cost_per_q)
//                   over eligible warm reuses, with a clustered (by-question)
//                   bootstrap 95% upper CI, compared to a pre-registered M0
//                   (read from --m0, no default, per PRE-REGISTRATION §1).
//
//   CO-PRIMARY (R7) — attribution ladder: arm4 must beat BOTH arm5a AND
//                   arm5b on effectiveModelContextTokens (clustered bootstrap
//                   CI of each pairwise difference excluding 0) at
//                   non-inferior correctness (the clustered NI rule below).
//
//   SECONDARY     — arm4 phase-2 warmCallCostPerQTokens vs arm1
//                   inlineCostPerQTokens, clustered by question
//                   (marginal-cost endpoint; proves persistence is real).
//
//   CORRECTNESS (R9) — clustered BY QUESTION: aggregate k>=5 seeds to a
//                   per-question majority-vote label BEFORE pairing, then
//                   McNemar 2x2 on the per-question labels (realised b, c,
//                   b+c reported). NI claimed ONLY if the pre-registered
//                   clustered CI lower bound > -5pp. BH-FDR across
//                   per-family / per-difficulty slices.
//
//   CACHE (R4)    — per-question cacheHitRate per arm; fail-run assertions:
//                   arm5a phase-2 cacheHitCount == 0 and decisiveCacheHit ==
//                   false on all phase-2 rows; arm0 toolCalls == 0.
//
//   LEDGER (R5)   — the full lifecycle cost ledger table per arm.
//
//   NOISE FLOOR   — within-arm seed-to-seed disagreement per question.
//
// All token quantities are model-context tokens = `effectiveModelContextTokens`
// (input + output, cached input counted at FULL weight; never subtracted).
// This script reads ONLY that field, NEVER the cache-subtracting
// `effectiveTokens` (CONTRACT.md §(b) NOTE).
//
// The heavy inferential stats (bootstrap M* CI, clustered NI CI) also live in
// the Python sibling `p1-paired-analysis.py` (sac-cross-arm mode); this TS
// scorer is self-contained so the harness can score without Python, and the
// two are kept consistent (same clustering, same bootstrap protocol). See the
// docstring in p1-paired-analysis.py for the TS/Python split rationale.
//
// Usage:
//   tsx eval/skillcraft/scripts/score-cross-arm.ts \
//     --normalized <combined-normalized.jsonl> \
//     --m0 8 \
//     [--out <scorecard.json>] \
//     [--bootstrap 10000] [--seed 1] [--ni-margin -0.05] [--alpha 0.05]
//
// The normalized file must contain rows from ALL arms run on the same family
// set and same seeds (CONTRACT.md §two-phase; PRE-REGISTRATION §4). Multiple
// --normalized flags are unioned. `--m0` is REQUIRED (no default — the
// pre-registered value is an explicit run argument, PRE-REGISTRATION §1).

import { promises as fsp } from "node:fs";
import path from "node:path";

// --- the SaC arm enum (CONTRACT.md §(a)) ----------------------------------

type SacArm = "arm0" | "arm1" | "arm2" | "arm3" | "arm4" | "arm5a" | "arm5b";
const SAC_ARMS: SacArm[] = ["arm0", "arm1", "arm2", "arm3", "arm4", "arm5a", "arm5b"];

type PhaseTag = "single" | "phase1-build" | "phase2-reuse";

// --- input row shape (subset of NormalizedRow actually consumed) ----------
//
// These names mirror normalize-results.ts (S1-owned) which maps the
// AdapterEpisode cost-ledger fields onto NormalizedRow. The cross-arm scorer
// keys EXCLUSIVELY on `sacArm` (never the legacy two-value `arm`,
// CONTRACT.md §(a) "armId widening"). Fields are optional so a normalized
// file that predates the SaC schema fails loudly (missing sacArm) rather
// than silently mis-scoring.

interface CrossArmRow {
  // identity / clustering keys
  taskKey: string;
  canonicalTaskKey?: string;
  family: string;
  level: string;
  phase: "train" | "warm" | "hard" | "unknown";
  arm: string; // legacy two-value union; NOT used for cross-arm keying
  sacArm?: SacArm | null;
  phaseTag?: PhaseTag | null;
  seed?: number | string | null;

  // correctness
  officialPassed: boolean;
  officialScorePercent?: number;

  // confirmatory model-context token metric (R5) — the ONLY token field used
  effectiveModelContextTokens?: number | null;

  // lifecycle cost ledger (CONTRACT.md §(b))
  rawInputTokens?: number | null;
  cachedInputTokens?: number | null;
  outputTokensLedger?: number | null;
  buildCostTokens?: number | null;
  governanceCostTokens?: number | null;
  inlineCostPerQTokens?: number | null;
  warmCallCostPerQTokens?: number | null;
  parityFloorTokens?: number | null;
  sandboxMs?: number | null;
  wallClockMs?: number | null;

  // cache accounting (R4)
  cacheHitCount?: number | null;
  cacheMissCount?: number | null;
  cacheHitRate?: number | null;
  decisiveCacheHit?: boolean | null;

  // recipe accounting (arm5b)
  recipeChars?: number | null;

  // governance decision (R1/R8)
  governanceGateApplied?: boolean | null;
  governanceGatePassed?: boolean | null;
  helperCallable?: boolean | null;

  // tool accounting (arm0 assertion)
  toolCalls?: number | null;

  // parity hashes (R2) — surfaced in the ledger / provenance block
  promptHash?: string | null;
  promptParityHash?: string | null;
  bindingLineHash?: string | null;
}

interface Args {
  normalized: string[];
  out: string | null;
  m0: number;
  bootstrap: number;
  bootstrapSeed: number;
  niMargin: number; // e.g. -0.05 (= -5pp), as a fraction
  alpha: number; // e.g. 0.05 -> 95% CI
}

function parseArgs(argv: string[]): Args {
  const normalized: string[] = [];
  let out: string | null = null;
  let m0: number | null = null;
  let bootstrap = 10_000;
  let bootstrapSeed = 1;
  let niMargin = -0.05;
  let alpha = 0.05;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const take = (): string => argv[++i]!;
    if (arg === "--normalized") normalized.push(path.resolve(take()));
    else if (arg.startsWith("--normalized=")) normalized.push(path.resolve(arg.slice("--normalized=".length)));
    else if (arg === "--out") out = path.resolve(take());
    else if (arg.startsWith("--out=")) out = path.resolve(arg.slice("--out=".length));
    else if (arg === "--m0") m0 = Number(take());
    else if (arg.startsWith("--m0=")) m0 = Number(arg.slice("--m0=".length));
    else if (arg === "--bootstrap") bootstrap = Number(take());
    else if (arg.startsWith("--bootstrap=")) bootstrap = Number(arg.slice("--bootstrap=".length));
    else if (arg === "--seed") bootstrapSeed = Number(take());
    else if (arg.startsWith("--seed=")) bootstrapSeed = Number(arg.slice("--seed=".length));
    else if (arg === "--ni-margin") niMargin = Number(take());
    else if (arg.startsWith("--ni-margin=")) niMargin = Number(arg.slice("--ni-margin=".length));
    else if (arg === "--alpha") alpha = Number(take());
    else if (arg.startsWith("--alpha=")) alpha = Number(arg.slice("--alpha=".length));
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (normalized.length === 0) {
    throw new Error("pass at least one --normalized <combined-normalized.jsonl>");
  }
  if (m0 === null || !Number.isFinite(m0)) {
    // PRE-REGISTRATION §1: M0 must be an explicit run argument, no default.
    throw new Error(
      "--m0 <int> is REQUIRED (pre-registered tenant reuse density; PRE-REGISTRATION.md §1 forbids a hardcoded default)",
    );
  }
  return { normalized, out, m0, bootstrap, bootstrapSeed, niMargin, alpha };
}

// --- I/O (mirrors score-r1-r9.ts conventions) ------------------------------

async function readJsonl<T>(file: string): Promise<T[]> {
  const text = await fsp.readFile(file, "utf8");
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

// --- numeric helpers -------------------------------------------------------

const round = (v: number, dp = 4): number => Number(v.toFixed(dp));

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function mean(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function sum(values: number[]): number {
  return values.reduce((s, v) => s + v, 0);
}

function stdev(values: number[]): number {
  if (values.length < 2) return Number.NaN;
  const m = mean(values);
  const v = values.reduce((s, x) => s + (x - m) * (x - m), 0) / (values.length - 1);
  return Math.sqrt(v);
}

// Mulberry32 — small deterministic PRNG so the bootstrap CI is reproducible
// given --seed (the same seed yields the same CI run-to-run).
function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return Number.NaN;
  if (sortedAsc.length === 1) return sortedAsc[0]!;
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo]!;
  const frac = pos - lo;
  return sortedAsc[lo]! * (1 - frac) + sortedAsc[hi]! * frac;
}

// Standard normal CDF (used for McNemar normal-approx fallback; mirrors the
// Python sibling's normal_cdf at p1-paired-analysis.py:84).
function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function erf(x: number): number {
  // Abramowitz & Stegun 7.1.26 — max abs error ~1.5e-7.
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

function logFactorial(n: number): number {
  let acc = 0;
  for (let i = 2; i <= n; i += 1) acc += Math.log(i);
  return acc;
}

function binomCoeffLog(n: number, k: number): number {
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

// McNemar exact two-sided p for discordant pair counts (b, c). Mirrors
// `mcnemar_two_sided` at p1-paired-analysis.py:88; switches to a normal
// approximation past n=1000 to avoid overflow in the exact binomial sum.
function mcnemarTwoSided(b: number, c: number): number | null {
  const n = b + c;
  if (n === 0) return null;
  if (n > 1000) {
    // continuity-corrected normal approx of the sign test
    const k = Math.min(b, c);
    const z = (Math.abs(k - n / 2) - 0.5) / (Math.sqrt(n) / 2);
    return Math.min(1, 2 * (1 - normalCdf(z)));
  }
  const k = Math.min(b, c);
  let pOne = 0;
  for (let i = 0; i <= k; i += 1) {
    pOne += Math.exp(binomCoeffLog(n, i) + n * Math.log(0.5));
  }
  return Math.min(1, 2 * pOne);
}

// Benjamini-Hochberg FDR. Returns the adjusted q-values aligned to the input
// order. Nulls (no test) are passed through as null and excluded from the
// rank denominator.
function benjaminiHochberg(pvalues: Array<number | null>): Array<number | null> {
  const indexed = pvalues
    .map((p, i) => ({ p, i }))
    .filter((e): e is { p: number; i: number } => e.p !== null && Number.isFinite(e.p));
  const m = indexed.length;
  if (m === 0) return pvalues.map(() => null);
  indexed.sort((a, b) => a.p - b.p);
  const adj = new Array<number | null>(pvalues.length).fill(null);
  let prev = 1;
  for (let rank = m; rank >= 1; rank -= 1) {
    const { p, i } = indexed[rank - 1]!;
    const q = Math.min(prev, (p * m) / rank);
    adj[i] = q;
    prev = q;
  }
  return adj;
}

// --- per-question majority-vote correctness label (R9) ---------------------
//
// PRE-REGISTRATION §3: aggregate k>=5 seeds to a per-question majority-vote
// correctness label BEFORE pairing. The question key is the canonical task
// key (`canonicalTaskKey`, else taskKey) — NEVER (family, level, seed), which
// would be pseudo-replication (Decision #6). We aggregate WITHIN an arm and
// WITHIN a phaseTag so phase-1 build rows never contaminate the phase-2
// held-out comparison.

function questionKey(row: CrossArmRow): string {
  return row.canonicalTaskKey ?? row.taskKey;
}

interface QuestionLabel {
  questionKey: string;
  family: string;
  level: string;
  phaseTag: PhaseTag;
  seeds: number; // number of seed rows aggregated
  passCount: number;
  majorityPass: boolean; // strict majority (ties -> false, conservative)
  seedDisagreement: number; // fraction of seeds disagreeing with the majority
  // token marginals aggregated per question (mean over seeds), for M* / ledger
  effectiveModelContextTokensMean: number | null;
  inlineCostPerQTokensMean: number | null;
  warmCallCostPerQTokensMean: number | null;
}

function majorityLabel(rows: CrossArmRow[]): QuestionLabel {
  const first = rows[0]!;
  const passCount = rows.filter((r) => r.officialPassed === true).length;
  const seeds = rows.length;
  // Strict majority: more than half. Ties resolve to NOT passed (conservative
  // — never credit a question to an arm on a coin flip).
  const majorityPass = passCount * 2 > seeds;
  const majorityVal = majorityPass ? 1 : 0;
  const disagree = rows.filter((r) => (r.officialPassed ? 1 : 0) !== majorityVal).length;
  const emc = rows.map((r) => r.effectiveModelContextTokens).filter(isNum);
  const inl = rows.map((r) => r.inlineCostPerQTokens).filter(isNum);
  const warm = rows.map((r) => r.warmCallCostPerQTokens).filter(isNum);
  return {
    questionKey: questionKey(first),
    family: first.family,
    level: first.level,
    phaseTag: (first.phaseTag ?? "single") as PhaseTag,
    seeds,
    passCount,
    majorityPass,
    seedDisagreement: seeds === 0 ? 0 : disagree / seeds,
    effectiveModelContextTokensMean: emc.length ? mean(emc) : null,
    inlineCostPerQTokensMean: inl.length ? mean(inl) : null,
    warmCallCostPerQTokensMean: warm.length ? mean(warm) : null,
  };
}

// Build per-arm, per-question majority labels. Keyed by
// (sacArm) -> (questionKey) -> QuestionLabel. Rows of differing phaseTag for
// the same (arm, question) are aggregated separately and the LAST one wins in
// the by-question map only if phaseTags collide (they should not: a question
// is either phase-1 or phase-2 for a two-phase arm). We surface the phaseTag
// on the label so downstream comparisons filter correctly.
function buildArmQuestionLabels(
  rows: CrossArmRow[],
): Map<SacArm, Map<string, QuestionLabel>> {
  const byArmQuestion = new Map<SacArm, Map<string, CrossArmRow[]>>();
  for (const row of rows) {
    const arm = row.sacArm;
    if (!arm) continue; // rows without sacArm are not part of the cross-arm set
    const qk = questionKey(row);
    let qmap = byArmQuestion.get(arm);
    if (!qmap) {
      qmap = new Map();
      byArmQuestion.set(arm, qmap);
    }
    const bucket = qmap.get(qk) ?? [];
    bucket.push(row);
    qmap.set(qk, bucket);
  }
  const out = new Map<SacArm, Map<string, QuestionLabel>>();
  for (const [arm, qmap] of byArmQuestion) {
    const labels = new Map<string, QuestionLabel>();
    for (const [qk, bucket] of qmap) {
      labels.set(qk, majorityLabel(bucket));
    }
    out.set(arm, labels);
  }
  return out;
}

// --- clustered bootstrap over questions ------------------------------------
//
// The cluster is the QUESTION (canonical task key). We resample questions
// with replacement and recompute the statistic each draw, then take the
// requested CI from the bootstrap distribution. This is the clustered/bootstrap
// CI the contract pins for M*, the attribution pairwise differences, and the
// clustered correctness NI delta (CONTRACT.md §(c); PRE-REGISTRATION §1/§3).

interface BootstrapCI {
  point: number | null; // statistic on the full sample
  lower: number | null; // alpha/2 quantile
  upper: number | null; // 1 - alpha/2 quantile
  upperOneSided: number | null; // 1 - alpha quantile (the 95% UPPER used for M*)
  lowerOneSided: number | null; // alpha quantile (the 95% LOWER used for NI)
  draws: number;
  nClusters: number;
}

function bootstrapCI<T>(
  clusters: T[],
  statistic: (resampled: T[]) => number | null,
  opts: { draws: number; rng: () => number; alpha: number },
): BootstrapCI {
  const n = clusters.length;
  const point = statistic(clusters);
  if (n === 0) {
    return {
      point,
      lower: null,
      upper: null,
      upperOneSided: null,
      lowerOneSided: null,
      draws: 0,
      nClusters: 0,
    };
  }
  const stats: number[] = [];
  for (let d = 0; d < opts.draws; d += 1) {
    const resample: T[] = new Array(n);
    for (let i = 0; i < n; i += 1) {
      resample[i] = clusters[Math.floor(opts.rng() * n)]!;
    }
    const s = statistic(resample);
    // +/-infinity is a meaningful M* value (a clean fail); keep it so the
    // upper CI honestly reflects denominator-near-zero draws. Only drop NaN.
    if (s !== null && !Number.isNaN(s)) stats.push(s);
  }
  if (stats.length === 0) {
    return {
      point,
      lower: null,
      upper: null,
      upperOneSided: null,
      lowerOneSided: null,
      draws: 0,
      nClusters: n,
    };
  }
  const sorted = [...stats].sort((a, b) => a - b);
  return {
    point,
    lower: quantile(sorted, opts.alpha / 2),
    upper: quantile(sorted, 1 - opts.alpha / 2),
    upperOneSided: quantile(sorted, 1 - opts.alpha),
    lowerOneSided: quantile(sorted, opts.alpha),
    draws: stats.length,
    nClusters: n,
  };
}

// --- PRIMARY: break-even M* (R6 / CONTRACT §(c)) ---------------------------
//
// M* = (build_cost + governance_cost)
//      / (arm1_inline_cost_per_q - arm4_warm_call_cost_per_q)
//
// over eligible warm reuses (arm4 phase-2 held-out siblings actually answered
// by calling the frozen helper). Components:
//   - build_cost      = sum over families of arm4 phase-1 buildCostTokens
//   - governance_cost = sum over families of arm4 phase-1 governanceCostTokens
//   - arm1_inline_cost_per_q = clustered mean of arm1 inlineCostPerQTokens
//     over the same held-out question set arm4 is scored on
//   - arm4_warm_call_cost_per_q = clustered mean of arm4 phase-2
//     warmCallCostPerQTokens over eligible warm reuses
//
// Denominator <= 0 -> M* = +infinity (a clean fail; SaC sits there).
// CI: clustered (by question) bootstrap; report the 95% UPPER CI.

interface MStarInputs {
  buildCost: number;
  governanceCost: number;
  // per-question marginal cost samples, keyed by question, on the matched
  // held-out set (the intersection of arm1 and eligible-arm4 questions).
  perQuestion: Array<{
    questionKey: string;
    arm1Inline: number;
    arm4Warm: number;
  }>;
}

function computeMStar(
  numeratorCost: number,
  perQuestion: MStarInputs["perQuestion"],
): number | null {
  if (perQuestion.length === 0) return null;
  const inlineMean = mean(perQuestion.map((q) => q.arm1Inline));
  const warmMean = mean(perQuestion.map((q) => q.arm4Warm));
  const denom = inlineMean - warmMean;
  if (!(denom > 0)) return Number.POSITIVE_INFINITY; // clean fail
  return numeratorCost / denom;
}

// --- main ------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rows: CrossArmRow[] = [];
  for (const file of args.normalized) {
    rows.push(...(await readJsonl<CrossArmRow>(file)));
  }

  const sacRows = rows.filter((r) => r.sacArm != null);
  if (sacRows.length === 0) {
    throw new Error(
      "no rows carry a `sacArm` field — this scorer keys on sacArm (CONTRACT §a); " +
        "is this a SaC-PoC normalized.jsonl? (legacy two-value `arm` is not used here)",
    );
  }

  const rng = mulberry32(args.bootstrapSeed);

  // --- fail-run invariants the SCORER owns (CONTRACT §"Pinned invariants") ---
  // We collect violations and fail at the end (so the report lists ALL of
  // them) rather than throwing on the first.
  const invariantViolations: string[] = [];

  // Invariant 5: arm0 toolCalls == 0 for all rows.
  for (const r of sacRows) {
    if (r.sacArm === "arm0" && isNum(r.toolCalls) && r.toolCalls !== 0) {
      invariantViolations.push(
        `arm0 toolCalls != 0 (${r.toolCalls}) at ${r.taskKey} (CONTRACT invariant 5)`,
      );
    }
  }

  // Invariant 4 (R4): arm5a phase-2 decisiveCacheHit == false (and
  // cacheHitCount == 0) for all rows — proving the memoization floor cannot
  // answer new-argument held-out work.
  for (const r of sacRows) {
    if (r.sacArm === "arm5a" && r.phaseTag === "phase2-reuse") {
      if (r.decisiveCacheHit === true) {
        invariantViolations.push(
          `arm5a phase-2 decisiveCacheHit==true at ${r.taskKey} (CONTRACT invariant 4 / R4)`,
        );
      }
      if (isNum(r.cacheHitCount) && r.cacheHitCount !== 0) {
        invariantViolations.push(
          `arm5a phase-2 cacheHitCount==${r.cacheHitCount} (expected 0) at ${r.taskKey} (CONTRACT §arm5a / R4)`,
        );
      }
    }
  }

  // R4 (all arms): phase-2 siblings are new-argument so NOTHING decisive is
  // answerable from cache — assert decisiveCacheHit==false on EVERY phase-2
  // row across arms (CONTRACT §(c) cache-hit-rate; PRE-REGISTRATION §4).
  for (const r of sacRows) {
    if (r.phaseTag === "phase2-reuse" && r.decisiveCacheHit === true) {
      invariantViolations.push(
        `phase-2 decisiveCacheHit==true at ${r.taskKey} arm=${r.sacArm} (R4 zero-decisive-hit across arms)`,
      );
    }
  }

  // Invariant 3 (R2): arm1.promptParityHash === arm4.promptParityHash for
  // every matched (family, level, seed). The RUNNER fails the run on
  // mismatch, but the scorer re-checks on the published rows as a
  // belt-and-braces audit (CONTRACT §(d)).
  const parityViolations = checkArm1Arm4Parity(sacRows);
  invariantViolations.push(...parityViolations);

  // --- per-arm, per-question majority labels (R9) --------------------------
  const armQuestionLabels = buildArmQuestionLabels(sacRows);

  // --- LEDGER (R5): per-arm lifecycle cost ledger --------------------------
  const ledger = buildLedger(sacRows);

  // --- PRIMARY: break-even M* with clustered bootstrap CI ------------------
  const mstar = scoreMStar(sacRows, armQuestionLabels, args, rng);

  // --- CO-PRIMARY: attribution ladder (arm4 vs arm5a AND arm5b) ------------
  const attribution = scoreAttribution(armQuestionLabels, args, rng);

  // --- SECONDARY: arm4-vs-arm1 marginal cost -------------------------------
  const secondary = scoreSecondary(armQuestionLabels, args, rng);

  // --- CORRECTNESS: clustered-by-question NI (R9) --------------------------
  const correctness = scoreCorrectness(armQuestionLabels, args, rng);

  // --- cache-hit rate per arm (R4) -----------------------------------------
  const cacheReport = buildCacheReport(sacRows);

  // --- within-arm noise floor (seed-to-seed disagreement) ------------------
  const noiseFloor = buildNoiseFloor(armQuestionLabels);

  // --- governance gate decision summary (audit; arm2 vs arm3) --------------
  const governanceSummary = buildGovernanceSummary(sacRows);

  const scorecard = {
    generatedAt: new Date().toISOString(),
    inputs: { normalized: args.normalized },
    preRegistered: {
      m0: args.m0,
      niMarginPp: round(args.niMargin * 100, 2),
      alpha: args.alpha,
      bootstrapDraws: args.bootstrap,
      bootstrapSeed: args.bootstrapSeed,
    },
    armsPresent: SAC_ARMS.filter((a) => armQuestionLabels.has(a)),
    rowCount: sacRows.length,
    primaryBreakEven: mstar,
    coPrimaryAttribution: attribution,
    secondaryMarginalCost: secondary,
    correctness,
    cacheReport,
    noiseFloor,
    lifecycleLedger: ledger,
    governanceSummary,
    invariantViolations,
    allInvariantsHeld: invariantViolations.length === 0,
  };

  const outPath = args.out ?? deriveOutPath(args.normalized[0]!);
  await fsp.mkdir(path.dirname(outPath), { recursive: true });
  await fsp.writeFile(outPath, JSON.stringify(scorecard, null, 2) + "\n", "utf8");

  // --- console summary -----------------------------------------------------
  printSummary(scorecard);

  if (invariantViolations.length > 0) {
    console.error(
      `[score-cross-arm] FAIL: ${invariantViolations.length} pinned-invariant violation(s) — see scorecard.invariantViolations`,
    );
    process.exit(2);
  }
}

// --- PRIMARY scorer --------------------------------------------------------

function scoreMStar(
  rows: CrossArmRow[],
  armQuestionLabels: Map<SacArm, Map<string, QuestionLabel>>,
  args: Args,
  rng: () => number,
): unknown {
  // numerator: build_cost + governance_cost = sum over FAMILIES of arm4
  // phase-1 buildCostTokens + governanceCostTokens. These are emitted on
  // phase1-build rows only and are PER-FAMILY (CONTRACT §(b)) — so we take one
  // value per (family) from the arm4 phase-1 rows, not per question.
  const arm4Phase1 = rows.filter(
    (r) => r.sacArm === "arm4" && r.phaseTag === "phase1-build",
  );
  const buildByFamily = new Map<string, number>();
  const govByFamily = new Map<string, number>();
  for (const r of arm4Phase1) {
    if (isNum(r.buildCostTokens) && !buildByFamily.has(r.family)) {
      buildByFamily.set(r.family, r.buildCostTokens);
    }
    if (isNum(r.governanceCostTokens) && !govByFamily.has(r.family)) {
      govByFamily.set(r.family, r.governanceCostTokens);
    }
  }
  const buildCost = sum([...buildByFamily.values()]);
  const governanceCost = sum([...govByFamily.values()]);
  const numeratorCost = buildCost + governanceCost;

  // eligible warm reuses: arm4 phase-2 questions actually answered by calling
  // the frozen helper (helperCallable true on a phase-2 row). We aggregate to
  // the per-question level (majority over seeds is the unit), and require the
  // question carry a finite warmCallCostPerQTokensMean. The matched
  // arm1_inline_cost_per_q must come from the SAME held-out question set.
  const arm4Labels = armQuestionLabels.get("arm4");
  const arm1Labels = armQuestionLabels.get("arm1");
  const perQuestion: MStarInputs["perQuestion"] = [];
  const droppedQuestions: Array<{ questionKey: string; reason: string }> = [];
  if (arm4Labels && arm1Labels) {
    for (const [qk, a4] of arm4Labels) {
      if (a4.phaseTag !== "phase2-reuse") continue;
      if (!isNum(a4.warmCallCostPerQTokensMean)) {
        droppedQuestions.push({ questionKey: qk, reason: "arm4 warmCall cost missing (not an eligible warm reuse)" });
        continue;
      }
      // matched arm1 inline cost on the SAME question (arm1 is single-phase,
      // so its phaseTag is "single" but the canonical question key matches)
      const a1 = arm1Labels.get(qk);
      if (!a1 || !isNum(a1.inlineCostPerQTokensMean)) {
        droppedQuestions.push({ questionKey: qk, reason: "no matched arm1 inline cost for this question" });
        continue;
      }
      perQuestion.push({
        questionKey: qk,
        arm1Inline: a1.inlineCostPerQTokensMean,
        arm4Warm: a4.warmCallCostPerQTokensMean,
      });
    }
  }

  const point = computeMStar(numeratorCost, perQuestion);
  // clustered bootstrap over questions: resample the per-question marginal
  // pairs, recompute M* each draw (numerator is fixed; only the denominator
  // means are resampled — that is the source of clustered variance).
  const ci = bootstrapCI(
    perQuestion,
    (resampled) => computeMStar(numeratorCost, resampled),
    { draws: args.bootstrap, rng, alpha: args.alpha },
  );

  const denomPositive =
    perQuestion.length > 0 &&
    mean(perQuestion.map((q) => q.arm1Inline)) - mean(perQuestion.map((q) => q.arm4Warm)) > 0;

  // Success = 95% UPPER CI of M* <= M0 (PRE-REGISTRATION §1).
  const upper = ci.upperOneSided;
  const success =
    point !== null && Number.isFinite(point) && denomPositive && isNum(upper)
      ? upper <= args.m0
      : false;

  return {
    formula:
      "M* = (build_cost + governance_cost) / (arm1_inline_cost_per_q - arm4_warm_call_cost_per_q)",
    buildCostTokens: round(buildCost, 1),
    governanceCostTokens: round(governanceCost, 1),
    numeratorTokens: round(numeratorCost, 1),
    familiesWithBuildCost: buildByFamily.size,
    familiesWithGovernanceCost: govByFamily.size,
    eligibleWarmReuseQuestions: perQuestion.length,
    arm1InlineCostPerQ:
      perQuestion.length > 0 ? round(mean(perQuestion.map((q) => q.arm1Inline)), 1) : null,
    arm4WarmCallCostPerQ:
      perQuestion.length > 0 ? round(mean(perQuestion.map((q) => q.arm4Warm)), 1) : null,
    denominatorTokens:
      perQuestion.length > 0
        ? round(mean(perQuestion.map((q) => q.arm1Inline)) - mean(perQuestion.map((q) => q.arm4Warm)), 1)
        : null,
    denominatorPositive: denomPositive,
    mStarPoint: point === null ? null : Number.isFinite(point) ? round(point, 3) : "Infinity",
    mStarCI95: {
      lowerOneSided: isNum(ci.lowerOneSided) ? round(ci.lowerOneSided, 3) : ci.lowerOneSided,
      upperOneSided: isNum(ci.upperOneSided) ? round(ci.upperOneSided, 3) : ci.upperOneSided,
      twoSidedLower: isNum(ci.lower) ? round(ci.lower, 3) : ci.lower,
      twoSidedUpper: isNum(ci.upper) ? round(ci.upper, 3) : ci.upper,
      bootstrapDraws: ci.draws,
      nQuestionClusters: ci.nClusters,
    },
    m0: args.m0,
    successRule: "95% upper CI of M* <= M0",
    success,
    cleanFail: !denomPositive,
    droppedQuestions,
  };
}

// --- CO-PRIMARY: attribution ladder ----------------------------------------

function scoreAttribution(
  armQuestionLabels: Map<SacArm, Map<string, QuestionLabel>>,
  args: Args,
  rng: () => number,
): unknown {
  const arm4 = armQuestionLabels.get("arm4");
  const arm5a = armQuestionLabels.get("arm5a");
  const arm5b = armQuestionLabels.get("arm5b");

  const vs5a = pairwiseTokenAttribution(arm4, arm5a, "arm5a", args, rng);
  const vs5b = pairwiseTokenAttribution(arm4, arm5b, "arm5b", args, rng);

  // correctness NI of arm4 vs each floor (the second half of the ladder)
  const niVs5a = pairwiseCorrectnessNI(arm4, arm5a, args, rng);
  const niVs5b = pairwiseCorrectnessNI(arm4, arm5b, args, rng);

  // "beats" = arm4 mean tokens strictly below the floor AND the CI of the
  // pairwise difference (arm4 - floor) excludes 0 (i.e. its UPPER < 0).
  const beats5a =
    vs5a.meanDiff !== null && vs5a.meanDiff < 0 && isNum(vs5a.ci.upper) && vs5a.ci.upper < 0;
  const beats5b =
    vs5b.meanDiff !== null && vs5b.meanDiff < 0 && isNum(vs5b.ci.upper) && vs5b.ci.upper < 0;

  const niHolds5a = niVs5a.niEstablished === true;
  const niHolds5b = niVs5b.niEstablished === true;

  // The callable-interface claim holds iff arm4 beats BOTH floors on tokens
  // AND is non-inferior in correctness to BOTH (PRE-REGISTRATION §2).
  const claimUpheld = beats5a && beats5b && niHolds5a && niHolds5b;

  return {
    rule:
      "callable-interface claim upheld iff arm4 beats BOTH arm5a AND arm5b on effectiveModelContextTokens (CI of diff excludes 0) AND is non-inferior in correctness to BOTH",
    arm4VsArm5a: { tokens: vs5a, correctnessNI: niVs5a, beatsOnTokens: beats5a, niHolds: niHolds5a },
    arm4VsArm5b: { tokens: vs5b, correctnessNI: niVs5b, beatsOnTokens: beats5b, niHolds: niHolds5b },
    beatsBothOnTokens: beats5a && beats5b,
    nonInferiorToBoth: niHolds5a && niHolds5b,
    claimUpheld,
  };
}

// Token-difference attribution between two arms over the matched phase-2
// held-out question set. Returns mean(arm4 - floor) and its clustered
// bootstrap CI; negative => arm4 cheaper.
function pairwiseTokenAttribution(
  armA: Map<string, QuestionLabel> | undefined,
  armB: Map<string, QuestionLabel> | undefined,
  floorName: string,
  args: Args,
  rng: () => number,
): { floor: string; nMatched: number; meanA: number | null; meanB: number | null; meanDiff: number | null; ci: BootstrapCI } {
  const diffs = matchedPhase2TokenDiffs(armA, armB);
  if (diffs.length === 0) {
    return {
      floor: floorName,
      nMatched: 0,
      meanA: null,
      meanB: null,
      meanDiff: null,
      ci: { point: null, lower: null, upper: null, upperOneSided: null, lowerOneSided: null, draws: 0, nClusters: 0 },
    };
  }
  const meanA = mean(diffs.map((d) => d.a));
  const meanB = mean(diffs.map((d) => d.b));
  const ci = bootstrapCI(
    diffs,
    (resampled) => mean(resampled.map((d) => d.a - d.b)),
    { draws: args.bootstrap, rng, alpha: args.alpha },
  );
  return {
    floor: floorName,
    nMatched: diffs.length,
    meanA: round(meanA, 1),
    meanB: round(meanB, 1),
    meanDiff: round(meanA - meanB, 1),
    ci: {
      point: isNum(ci.point) ? round(ci.point, 1) : ci.point,
      lower: isNum(ci.lower) ? round(ci.lower, 1) : ci.lower,
      upper: isNum(ci.upper) ? round(ci.upper, 1) : ci.upper,
      upperOneSided: isNum(ci.upperOneSided) ? round(ci.upperOneSided, 1) : ci.upperOneSided,
      lowerOneSided: isNum(ci.lowerOneSided) ? round(ci.lowerOneSided, 1) : ci.lowerOneSided,
      draws: ci.draws,
      nClusters: ci.nClusters,
    },
  };
}

function matchedPhase2TokenDiffs(
  armA: Map<string, QuestionLabel> | undefined,
  armB: Map<string, QuestionLabel> | undefined,
): Array<{ questionKey: string; a: number; b: number }> {
  const out: Array<{ questionKey: string; a: number; b: number }> = [];
  if (!armA || !armB) return out;
  for (const [qk, a] of armA) {
    if (a.phaseTag !== "phase2-reuse") continue;
    const b = armB.get(qk);
    if (!b || b.phaseTag !== "phase2-reuse") continue;
    if (!isNum(a.effectiveModelContextTokensMean) || !isNum(b.effectiveModelContextTokensMean)) continue;
    out.push({ questionKey: qk, a: a.effectiveModelContextTokensMean, b: b.effectiveModelContextTokensMean });
  }
  return out;
}

// --- SECONDARY: arm4 phase-2 warmCall vs arm1 inline (marginal cost) -------

function scoreSecondary(
  armQuestionLabels: Map<SacArm, Map<string, QuestionLabel>>,
  args: Args,
  rng: () => number,
): unknown {
  const arm4 = armQuestionLabels.get("arm4");
  const arm1 = armQuestionLabels.get("arm1");
  const pairs: Array<{ questionKey: string; warm: number; inline: number }> = [];
  if (arm4 && arm1) {
    for (const [qk, a4] of arm4) {
      if (a4.phaseTag !== "phase2-reuse") continue;
      if (!isNum(a4.warmCallCostPerQTokensMean)) continue;
      const a1 = arm1.get(qk);
      if (!a1 || !isNum(a1.inlineCostPerQTokensMean)) continue;
      pairs.push({ questionKey: qk, warm: a4.warmCallCostPerQTokensMean, inline: a1.inlineCostPerQTokensMean });
    }
  }
  if (pairs.length === 0) {
    return { note: "no matched arm4-phase2 / arm1 question pairs", nMatched: 0 };
  }
  const ci = bootstrapCI(
    pairs,
    (resampled) => mean(resampled.map((p) => p.warm - p.inline)),
    { draws: args.bootstrap, rng, alpha: args.alpha },
  );
  const meanWarm = mean(pairs.map((p) => p.warm));
  const meanInline = mean(pairs.map((p) => p.inline));
  return {
    endpoint: "arm4 phase-2 warmCallCostPerQTokens vs arm1 inlineCostPerQTokens (clustered by question)",
    nMatched: pairs.length,
    arm4WarmMean: round(meanWarm, 1),
    arm1InlineMean: round(meanInline, 1),
    meanDiff_warmMinusInline: round(meanWarm - meanInline, 1),
    ci95_warmMinusInline: {
      lower: isNum(ci.lower) ? round(ci.lower, 1) : ci.lower,
      upper: isNum(ci.upper) ? round(ci.upper, 1) : ci.upper,
      draws: ci.draws,
      nClusters: ci.nClusters,
    },
    arm4CheaperWithCIExcludingZero:
      meanWarm < meanInline && isNum(ci.upper) && ci.upper < 0,
    note: "SECONDARY endpoint (marginal cost; proves cross-session persistence). NOT the headline.",
  };
}

// --- CORRECTNESS: clustered-by-question NI + McNemar + BH-FDR (R9) ---------

function scoreCorrectness(
  armQuestionLabels: Map<SacArm, Map<string, QuestionLabel>>,
  args: Args,
  rng: () => number,
): unknown {
  // The headline correctness pairings the contract names:
  //   arm4 vs arm1 (single-session null, pre-registered ~0; SECONDARY pairing)
  //   arm4 vs arm5a, arm4 vs arm5b (the attribution NI half — also surfaced
  //     inside coPrimaryAttribution, repeated here for the correctness block)
  const pairings: Array<{ label: string; a: SacArm; b: SacArm }> = [
    { label: "arm4_vs_arm1", a: "arm4", b: "arm1" },
    { label: "arm4_vs_arm5a", a: "arm4", b: "arm5a" },
    { label: "arm4_vs_arm5b", a: "arm4", b: "arm5b" },
    { label: "arm2_vs_arm1", a: "arm2", b: "arm1" },
  ];
  const results = pairings.map((p) => {
    const ni = pairwiseCorrectnessNI(
      armQuestionLabels.get(p.a),
      armQuestionLabels.get(p.b),
      args,
      rng,
    );
    return { pairing: p.label, ...ni };
  });

  // BH-FDR across the McNemar p-values of all pairings (the "slices" the
  // contract names are family/difficulty; we also FDR-correct the pairings).
  const pvals = results.map((r) => r.mcnemarP);
  const adj = benjaminiHochberg(pvals);
  const resultsWithFdr = results.map((r, i) => ({ ...r, mcnemarP_bhAdjusted: adj[i] === null ? null : round(adj[i]!, 4) }));

  // per-family + per-difficulty slices for the primary arm4-vs-arm1 pairing,
  // each McNemar'd then BH-FDR corrected across the slice family.
  const familySlices = sliceCorrectness(armQuestionLabels.get("arm4"), armQuestionLabels.get("arm1"), "family");
  const difficultySlices = sliceCorrectness(armQuestionLabels.get("arm4"), armQuestionLabels.get("arm1"), "level");

  return {
    niMarginPp: round(args.niMargin * 100, 2),
    niRule:
      "non-inferiority claimed ONLY if pre-registered clustered CI lower bound > -5pp; else reported descriptively (PRE-REGISTRATION §3)",
    preRegisteredSingleSessionNull:
      "arm4 (and arm2) pre-registered to show ~0 single-session correctness lift over arm1 (PRE-REGISTRATION §3 / Decision #7) — reported as a finding, not a weakness",
    pairings: resultsWithFdr,
    slices: {
      byFamily_arm4_vs_arm1: familySlices,
      byDifficulty_arm4_vs_arm1: difficultySlices,
    },
  };
}

interface CorrectnessNI {
  nMatchedQuestions: number;
  arm4PassRate: number | null;
  otherPassRate: number | null;
  observedDeltaPp: number | null; // (arm4 - other) * 100
  mcnemarB: number; // arm4 pass, other fail
  mcnemarC: number; // arm4 fail, other pass
  mcnemarDiscordant: number; // b + c
  mcnemarP: number | null;
  deltaCI95Pp: { lower: number | null; upper: number | null; draws: number; nClusters: number };
  niEstablished: boolean | null; // true only if clustered CI lower bound > niMargin
  descriptive: string;
}

function pairwiseCorrectnessNI(
  armA: Map<string, QuestionLabel> | undefined,
  armB: Map<string, QuestionLabel> | undefined,
  args: Args,
  rng: () => number,
): CorrectnessNI {
  const empty: CorrectnessNI = {
    nMatchedQuestions: 0,
    arm4PassRate: null,
    otherPassRate: null,
    observedDeltaPp: null,
    mcnemarB: 0,
    mcnemarC: 0,
    mcnemarDiscordant: 0,
    mcnemarP: null,
    deltaCI95Pp: { lower: null, upper: null, draws: 0, nClusters: 0 },
    niEstablished: null,
    descriptive: "no matched questions",
  };
  if (!armA || !armB) return empty;
  // Match on the per-question majority label. For a two-phase arm vs a
  // single-phase arm we match purely on the canonical question key; the
  // held-out question is the same canonical task regardless of phaseTag.
  const matched: Array<{ questionKey: string; a: number; b: number }> = [];
  for (const [qk, a] of armA) {
    const b = armB.get(qk);
    if (!b) continue;
    matched.push({ questionKey: qk, a: a.majorityPass ? 1 : 0, b: b.majorityPass ? 1 : 0 });
  }
  if (matched.length === 0) return empty;

  const aPass = mean(matched.map((m) => m.a));
  const bPass = mean(matched.map((m) => m.b));
  const observedDelta = aPass - bPass; // arm4 - other, as a fraction

  // McNemar 2x2 on the per-question majority labels (b = A pass & B fail).
  const b = matched.filter((m) => m.a === 1 && m.b === 0).length;
  const c = matched.filter((m) => m.a === 0 && m.b === 1).length;
  const p = mcnemarTwoSided(b, c);

  // clustered bootstrap CI of the paired delta (arm4 - other), by question.
  const ci = bootstrapCI(
    matched,
    (resampled) => mean(resampled.map((m) => m.a - m.b)),
    { draws: args.bootstrap, rng, alpha: args.alpha },
  );

  // NI established iff the clustered CI LOWER bound > niMargin (e.g. -0.05).
  // We use the two-sided CI lower bound, which is the conservative reading of
  // "pre-registered clustered CI lower bound > -5pp".
  const lowerPp = isNum(ci.lower) ? ci.lower * 100 : null;
  const niEstablished = isNum(ci.lower) ? ci.lower > args.niMargin : null;
  const descriptive =
    niEstablished === true
      ? `non-inferior: observed delta ${round(observedDelta * 100, 1)}pp, clustered CI lower ${lowerPp === null ? "?" : round(lowerPp, 1)}pp > ${round(args.niMargin * 100, 1)}pp`
      : `observed delta ${round(observedDelta * 100, 1)}pp, formal non-inferiority NOT established (clustered CI lower ${lowerPp === null ? "?" : round(lowerPp, 1)}pp <= ${round(args.niMargin * 100, 1)}pp)`;

  return {
    nMatchedQuestions: matched.length,
    arm4PassRate: round(aPass, 4),
    otherPassRate: round(bPass, 4),
    observedDeltaPp: round(observedDelta * 100, 2),
    mcnemarB: b,
    mcnemarC: c,
    mcnemarDiscordant: b + c,
    mcnemarP: p === null ? null : round(p, 4),
    deltaCI95Pp: {
      lower: isNum(ci.lower) ? round(ci.lower * 100, 2) : null,
      upper: isNum(ci.upper) ? round(ci.upper * 100, 2) : null,
      draws: ci.draws,
      nClusters: ci.nClusters,
    },
    niEstablished,
    descriptive,
  };
}

function sliceCorrectness(
  armA: Map<string, QuestionLabel> | undefined,
  armB: Map<string, QuestionLabel> | undefined,
  by: "family" | "level",
): unknown {
  if (!armA || !armB) return { note: "missing arm(s)", slices: [] };
  // group matched questions by the slice key, McNemar each, BH-FDR across.
  const groups = new Map<string, Array<{ a: number; b: number }>>();
  for (const [qk, a] of armA) {
    const b = armB.get(qk);
    if (!b) continue;
    const key = by === "family" ? a.family : a.level;
    const list = groups.get(key) ?? [];
    list.push({ a: a.majorityPass ? 1 : 0, b: b.majorityPass ? 1 : 0 });
    groups.set(key, list);
  }
  const sliceList = [...groups.entries()].map(([key, ms]) => {
    const bb = ms.filter((m) => m.a === 1 && m.b === 0).length;
    const cc = ms.filter((m) => m.a === 0 && m.b === 1).length;
    return {
      slice: key,
      n: ms.length,
      arm4PassRate: round(mean(ms.map((m) => m.a)), 4),
      otherPassRate: round(mean(ms.map((m) => m.b)), 4),
      mcnemarB: bb,
      mcnemarC: cc,
      mcnemarP: mcnemarTwoSided(bb, cc),
    };
  });
  const adj = benjaminiHochberg(sliceList.map((s) => s.mcnemarP));
  return sliceList
    .map((s, i) => ({
      ...s,
      mcnemarP: s.mcnemarP === null ? null : round(s.mcnemarP, 4),
      mcnemarP_bhAdjusted: adj[i] === null ? null : round(adj[i]!, 4),
    }))
    .sort((a, b) => a.slice.localeCompare(b.slice));
}

// --- LEDGER (R5): per-arm lifecycle cost ledger ----------------------------

function buildLedger(rows: CrossArmRow[]): unknown {
  const out: Record<string, unknown> = {};
  for (const arm of SAC_ARMS) {
    const armRows = rows.filter((r) => r.sacArm === arm);
    if (armRows.length === 0) continue;
    const phase2 = armRows.filter((r) => r.phaseTag === "phase2-reuse");
    const phase1 = armRows.filter((r) => r.phaseTag === "phase1-build");
    // build / governance are per-family on phase-1 rows; sum one per family.
    const buildByFam = new Map<string, number>();
    const govByFam = new Map<string, number>();
    for (const r of phase1) {
      if (isNum(r.buildCostTokens) && !buildByFam.has(r.family)) buildByFam.set(r.family, r.buildCostTokens);
      if (isNum(r.governanceCostTokens) && !govByFam.has(r.family)) govByFam.set(r.family, r.governanceCostTokens);
    }
    const emc = armRows.map((r) => r.effectiveModelContextTokens).filter(isNum);
    const rawIn = armRows.map((r) => r.rawInputTokens).filter(isNum);
    const cachedIn = armRows.map((r) => r.cachedInputTokens).filter(isNum);
    const outTok = armRows.map((r) => r.outputTokensLedger).filter(isNum);
    const tool = armRows.map((r) => r.toolCalls).filter(isNum);
    const sandbox = armRows.map((r) => r.sandboxMs).filter(isNum);
    const wall = armRows.map((r) => r.wallClockMs).filter(isNum);
    const inlinePerQ = armRows.map((r) => r.inlineCostPerQTokens).filter(isNum);
    const warmPerQ = armRows.map((r) => r.warmCallCostPerQTokens).filter(isNum);
    const recipe = armRows.map((r) => r.recipeChars).filter(isNum);

    out[arm] = {
      n: armRows.length,
      nPhase1: phase1.length,
      nPhase2: phase2.length,
      buildCostTokens_sumPerFamily: buildByFam.size ? round(sum([...buildByFam.values()]), 1) : null,
      governanceCostTokens_sumPerFamily: govByFam.size ? round(sum([...govByFam.values()]), 1) : null,
      avgEffectiveModelContextTokens: emc.length ? round(mean(emc), 1) : null,
      avgRawInputTokens: rawIn.length ? round(mean(rawIn), 1) : null,
      avgCachedInputTokens: cachedIn.length ? round(mean(cachedIn), 1) : null,
      avgOutputTokens: outTok.length ? round(mean(outTok), 1) : null,
      avgInlineCostPerQTokens: inlinePerQ.length ? round(mean(inlinePerQ), 1) : null,
      avgWarmCallCostPerQTokens: warmPerQ.length ? round(mean(warmPerQ), 1) : null,
      avgRecipeChars: recipe.length ? round(mean(recipe), 1) : null,
      totalToolCalls: tool.length ? sum(tool) : null,
      avgSandboxMs: sandbox.length ? round(mean(sandbox), 1) : null,
      avgWallClockMs: wall.length ? round(mean(wall), 1) : null,
      note:
        "model-context token savings (NOT cost savings); dollars require the full ledger. Token field is effectiveModelContextTokens (cache at full weight).",
    };
  }
  return out;
}

// --- cache report (R4) -----------------------------------------------------

function buildCacheReport(rows: CrossArmRow[]): unknown {
  const out: Record<string, unknown> = {};
  for (const arm of SAC_ARMS) {
    const armRows = rows.filter((r) => r.sacArm === arm);
    if (armRows.length === 0) continue;
    const phase2 = armRows.filter((r) => r.phaseTag === "phase2-reuse");
    const rates = armRows.map((r) => r.cacheHitRate).filter(isNum);
    const hits = armRows.map((r) => r.cacheHitCount).filter(isNum);
    const phase2DecisiveHits = phase2.filter((r) => r.decisiveCacheHit === true).length;
    out[arm] = {
      n: armRows.length,
      perQuestionCacheHitRate_mean: rates.length ? round(mean(rates), 4) : null,
      totalCacheHits: hits.length ? sum(hits) : null,
      phase2Rows: phase2.length,
      phase2DecisiveCacheHits: phase2DecisiveHits,
      phase2ZeroDecisiveHits: phase2.length === 0 ? null : phase2DecisiveHits === 0,
    };
  }
  return out;
}

// --- within-arm noise floor ------------------------------------------------

function buildNoiseFloor(
  armQuestionLabels: Map<SacArm, Map<string, QuestionLabel>>,
): unknown {
  const out: Record<string, unknown> = {};
  for (const [arm, labels] of armQuestionLabels) {
    const disagreements = [...labels.values()].map((l) => l.seedDisagreement);
    const seeds = [...labels.values()].map((l) => l.seeds);
    out[arm] = {
      nQuestions: labels.size,
      meanSeedsPerQuestion: seeds.length ? round(mean(seeds), 2) : null,
      meanSeedDisagreement: disagreements.length ? round(mean(disagreements), 4) : null,
      maxSeedDisagreement: disagreements.length ? round(Math.max(...disagreements), 4) : null,
      note:
        "seed-to-seed disagreement = fraction of seeds whose pass label differs from the per-question majority. The within-arm noise floor every table must report (PRE-REGISTRATION §3).",
    };
  }
  return out;
}

// --- governance gate decision summary (arm2 vs arm3 audit) -----------------

function buildGovernanceSummary(rows: CrossArmRow[]): unknown {
  const summarize = (arm: SacArm) => {
    const armRows = rows.filter((r) => r.sacArm === arm);
    if (armRows.length === 0) return null;
    const applied = armRows.filter((r) => r.governanceGateApplied === true).length;
    const passed = armRows.filter((r) => r.governanceGatePassed === true).length;
    const callable = armRows.filter((r) => r.helperCallable === true).length;
    return {
      n: armRows.length,
      governanceGateApplied: applied,
      governanceGatePassed: passed,
      helperCallableRows: callable,
    };
  };
  return {
    note:
      "audit of the governance-as-callability axis (CONTRACT §f). arm2 makes a helper callable ONLY after a replay PASS; arm3 forces callable WITHOUT a gate. The deterministic-probe PASS/FAIL outcome lives in the S2 governance-probes.json, not here.",
    arm2: summarize("arm2"),
    arm3: summarize("arm3"),
  };
}

// --- Arm-1/Arm-4 parity audit (R2) -----------------------------------------

function checkArm1Arm4Parity(rows: CrossArmRow[]): string[] {
  // Match on (canonical question key). arm1 is single-phase; arm4 spans two
  // phases. The contract scopes the parity assertion to the matched
  // (family, level, seed); we key on canonical-question + seed where seed is
  // present, falling back to canonical-question alone.
  const violations: string[] = [];
  const arm1 = rows.filter((r) => r.sacArm === "arm1");
  const arm4 = rows.filter((r) => r.sacArm === "arm4");
  const keyOf = (r: CrossArmRow): string =>
    `${questionKey(r)}::${r.level}::${r.seed ?? "noseed"}`;
  const arm4ByKey = new Map<string, CrossArmRow>();
  for (const r of arm4) arm4ByKey.set(keyOf(r), r);
  for (const a1 of arm1) {
    const a4 = arm4ByKey.get(keyOf(a1));
    if (!a4) continue; // arm1 questions not in arm4 (phase-1 only) — skip
    if (a1.promptParityHash == null || a4.promptParityHash == null) continue;
    if (a1.promptParityHash !== a4.promptParityHash) {
      violations.push(
        `arm1.promptParityHash !== arm4.promptParityHash at ${keyOf(a1)} ` +
          `(arm1=${a1.promptParityHash.slice(0, 12)} arm4=${a4.promptParityHash.slice(0, 12)}) ` +
          `(CONTRACT invariant 3 / R2)`,
      );
    }
  }
  return violations;
}

// --- output path + console summary -----------------------------------------

function deriveOutPath(firstNormalized: string): string {
  return path.join(path.dirname(firstNormalized), "cross-arm-scorecard.json");
}

function printSummary(sc: any): void {
  console.log(`[score-cross-arm] arms present: ${sc.armsPresent.join(", ")} (${sc.rowCount} rows)`);
  const m = sc.primaryBreakEven;
  console.log(
    `[score-cross-arm] PRIMARY M*: point=${m.mStarPoint} 95%-upper=${m.mStarCI95.upperOneSided} M0=${m.m0} -> ${m.success ? "SUCCESS" : m.cleanFail ? "CLEAN FAIL (denom<=0)" : "FAIL"}`,
  );
  const a = sc.coPrimaryAttribution;
  console.log(
    `[score-cross-arm] CO-PRIMARY attribution: beatsBoth=${a.beatsBothOnTokens} niToBoth=${a.nonInferiorToBoth} -> claimUpheld=${a.claimUpheld}`,
  );
  for (const p of sc.correctness.pairings) {
    console.log(
      `[score-cross-arm] correctness ${p.pairing}: Δ=${p.observedDeltaPp}pp b=${p.mcnemarB} c=${p.mcnemarC} (b+c=${p.mcnemarDiscordant}) McNemar p=${p.mcnemarP} NI=${p.niEstablished}`,
    );
  }
  console.log(
    `[score-cross-arm] invariants: ${sc.allInvariantsHeld ? "ALL HELD" : `${sc.invariantViolations.length} VIOLATION(S)`}`,
  );
}

main().catch((err) => {
  console.error("[score-cross-arm] failed:", err);
  process.exit(1);
});
