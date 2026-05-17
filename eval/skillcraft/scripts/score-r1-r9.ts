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
  agentCachedInputTokens?: number | null;
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

function intentParts(intentSignature: string): string[] {
  return intentSignature
    .split("→")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function containsContiguousSubIntent(
  containerSignature: string,
  candidateSignature: string,
): boolean {
  const container = intentParts(containerSignature);
  const candidate = intentParts(candidateSignature);
  if (candidate.length === 0 || candidate.length > container.length) return false;
  for (let start = 0; start <= container.length - candidate.length; start += 1) {
    if (candidate.every((part, i) => container[start + i] === part)) return true;
  }
  return false;
}

function isEligibleCompositionalHelper(intentSignature: string): boolean {
  // Single-token helpers like `db` or `lib` are too broad to count as honest
  // sub-intent reuse. FANOUT templates are the current learned abstraction
  // shape; multi-step signatures are also specific enough to diagnose.
  return intentSignature.includes("FANOUT(") || intentParts(intentSignature).length >= 2;
}

function helperIntentRelation(
  helperIntentSignature: string | null,
  episodeIntentSignature: string,
): "exact" | "subintent" | null {
  if (helperIntentSignature === null) return null;
  if (helperIntentSignature === episodeIntentSignature) return "exact";
  if (!isEligibleCompositionalHelper(helperIntentSignature)) return null;
  return containsContiguousSubIntent(episodeIntentSignature, helperIntentSignature)
    ? "subintent"
    : null;
}

interface ConditionResult {
  name: string;
  description: string;
  value: number | string | null;
  threshold: string;
  met: boolean | null;
  detail?: unknown;
}

// --- PSN helper maturity (paper §3) ----------------------------------------
// Behind env var PSN_MATURITY_GATE=1 we also require an R6/R7/R8-relevant
// helper to be in `verified` or `preferred` state before it counts. The
// state machine is computed by walking every helper's life-history in
// trajectory-timestamp order, interleaving attempts/passes with paired
// cost-drop wins/losses (R8 ratio <= 0.70 = win).
type HelperMaturityState =
  | "candidate"
  | "verified"
  | "preferred"
  | "suspect"
  | "quarantined";

interface HelperMaturity {
  helperName: string;
  intentSignature: string;
  attempts: number;           // episodes where helper was available
  passes: number;             // episodes that officially passed AND called this helper
  costDropWins: number;       // pair entries where ratio <= 0.70
  costDropLosses: number;     // pair entries where ratio > 0.70
  consecutiveLosses: number;  // running count of recent losses
  state: HelperMaturityState;
}

// Per-helper R8-style pair, computed in parallel to the official r8Detail
// so we can attribute wins/losses to the specific helper that was called.
interface HelperPair {
  helperName: string;
  intentSignature: string;
  reuseTimestamp: string;
  ratio: number;
}

interface HelperAttempt {
  helperName: string;
  intentSignature: string;
  timestamp: string;
  called: boolean;
  passed: boolean;
}

function computeHelperMaturity(
  attempts: HelperAttempt[],
  pairs: HelperPair[],
): Map<string, HelperMaturity> {
  // Bucket events per helper, then merge in timestamp order so the state
  // machine sees attempts and pair results interleaved as they actually
  // happened. Pairs use the reuse-episode timestamp.
  const byHelper = new Map<
    string,
    {
      intentSignature: string;
      events: Array<
        | { kind: "attempt"; ts: string; called: boolean; passed: boolean }
        | { kind: "pair"; ts: string; win: boolean }
      >;
    }
  >();
  for (const a of attempts) {
    const entry =
      byHelper.get(a.helperName) ?? { intentSignature: a.intentSignature, events: [] };
    entry.events.push({
      kind: "attempt",
      ts: a.timestamp,
      called: a.called,
      passed: a.passed,
    });
    byHelper.set(a.helperName, entry);
  }
  for (const p of pairs) {
    const entry =
      byHelper.get(p.helperName) ??
      { intentSignature: p.intentSignature, events: [] };
    entry.events.push({ kind: "pair", ts: p.reuseTimestamp, win: p.ratio <= 0.7 });
    byHelper.set(p.helperName, entry);
  }

  const out = new Map<string, HelperMaturity>();
  for (const [name, entry] of byHelper) {
    // Stable order: timestamp, then attempts before pairs at the same ts
    // (the episode logically "happens" before its cost-drop pair is
    // computed against the prior baseline).
    entry.events.sort((a, b) => {
      if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
      if (a.kind === b.kind) return 0;
      return a.kind === "attempt" ? -1 : 1;
    });

    const m: HelperMaturity = {
      helperName: name,
      intentSignature: entry.intentSignature,
      attempts: 0,
      passes: 0,
      costDropWins: 0,
      costDropLosses: 0,
      consecutiveLosses: 0,
      state: "candidate",
    };
    // Track win/loss tail since entering suspect, for the recovery rule.
    let suspectAttemptsSeen = 0;
    let suspectWinsSeen = 0;
    let suspectLossesSeen = 0;

    for (const ev of entry.events) {
      if (ev.kind === "attempt") {
        m.attempts += 1;
        if (ev.called && ev.passed) m.passes += 1;
        if (m.state === "suspect") suspectAttemptsSeen += 1;
      } else {
        if (ev.win) {
          m.costDropWins += 1;
          m.consecutiveLosses = 0;
          if (m.state === "suspect") suspectWinsSeen += 1;
        } else {
          m.costDropLosses += 1;
          m.consecutiveLosses += 1;
          if (m.state === "suspect") suspectLossesSeen += 1;
        }
      }

      // --- transitions (terminal first) ---
      if (m.state === "quarantined") continue;

      // suspect → quarantined: total losses >= 3
      if (m.state === "suspect" && m.costDropLosses >= 3) {
        m.state = "quarantined";
        continue;
      }
      // suspect → verified: recovery (winRate >= 0.60 over next 4 attempts
      // post-demotion). Use suspectWinsSeen / suspectLossesSeen.
      if (m.state === "suspect" && suspectAttemptsSeen >= 4) {
        const denom = suspectWinsSeen + suspectLossesSeen;
        const winRate = denom === 0 ? 0 : suspectWinsSeen / denom;
        if (winRate >= 0.6) {
          m.state = "verified";
          suspectAttemptsSeen = 0;
          suspectWinsSeen = 0;
          suspectLossesSeen = 0;
        }
      }
      // preferred → suspect: 2 consecutive losses
      if (m.state === "preferred" && m.consecutiveLosses >= 2) {
        m.state = "suspect";
        suspectAttemptsSeen = 0;
        suspectWinsSeen = 0;
        suspectLossesSeen = 0;
        continue;
      }
      // verified → preferred: passes >= 4 AND winRate >= 0.70
      if (m.state === "verified" && m.passes >= 4) {
        const denom = m.costDropWins + m.costDropLosses;
        const winRate = denom === 0 ? 0 : m.costDropWins / denom;
        if (winRate >= 0.7) {
          m.state = "preferred";
          continue;
        }
      }
      // candidate → verified: passes >= 2
      if (m.state === "candidate" && m.passes >= 2) {
        m.state = "verified";
        // chain into verified→preferred check on the same event
        if (m.passes >= 4) {
          const denom = m.costDropWins + m.costDropLosses;
          const winRate = denom === 0 ? 0 : m.costDropWins / denom;
          if (winRate >= 0.7) m.state = "preferred";
        }
      }
    }
    out.set(name, m);
  }
  return out;
}

function isMatureForGating(m: HelperMaturity | undefined): boolean {
  if (!m) return false;
  return m.state === "verified" || m.state === "preferred";
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
  const callableCrystallised = [...crystallisedByName.entries()]
    .filter(([, origin]) => origin.intentSignature !== null)
    .filter(([name]) => !quarantinedNames.has(name))
    .map(([name, origin]) => ({
      name,
      origin,
      intentSignature: origin.intentSignature!,
    }));

  // --- PSN helper maturity (gated by PSN_MATURITY_GATE=1) ----------------
  // Compute attempts/pairs per helper so the state machine can run BEFORE
  // R6/R7/R8 (which optionally consult maturity for gating). This is a
  // parallel walk; it does not affect the official r8Detail computation
  // below — that stays intentSignature-keyed for backward compatibility.
  const psnGateEnabled = (process.env["PSN_MATURITY_GATE"] ?? "") === "1";
  const helperAttempts: HelperAttempt[] = [];
  for (const row of instrumentationRows) {
    const norm = normByKey.get(keyOf(row.family, row.level));
    const passed = norm?.officialPassed === true;
    const ts = trajectoryTimestamp(row.trajectoryId, row.level);
    const availableNames = new Set(row.helpersAvailable);
    const calledNames = new Set(row.helpersCalled);
    for (const name of availableNames) {
      const origin = crystallisedByName.get(name);
      if (!origin || origin.intentSignature === null) continue;
      helperAttempts.push({
        helperName: name,
        intentSignature: origin.intentSignature,
        timestamp: ts,
        called: calledNames.has(name),
        passed,
      });
    }
  }
  // Per-helper pair computation (mirrors the official r8Detail but tracks
  // the called helper). A pair is a reuse-episode where the agent called
  // a particular crystallised helper, matched to the nearest earlier
  // same-intent non-reuse episode. We track each (helper, called) hit.
  interface EpisodeForHelperR8 {
    family: string;
    level: string;
    intentSignature: string;
    timestamp: string;
    cost: number | null;
    helpersCalledLearned: Array<{ name: string; intentSignature: string }>;
    cleanBaseline: boolean;
  }
  const helperR8Episodes: EpisodeForHelperR8[] = [];
  for (const row of instrumentationRows) {
    const sig = sigByKey.get(keyOf(row.family, row.level));
    if (!sig) continue;
    const originByName = new Map(row.helperOrigins.map((o) => [o.name, o]));
    const helpersCalledLearned: Array<{ name: string; intentSignature: string }> = [];
    for (const name of row.helpersCalled) {
      const o = originByName.get(name);
      if (!o || o.isSeed || o.intentSignature === null) continue;
      if (o.intentSignature !== sig) continue;
      helpersCalledLearned.push({ name, intentSignature: o.intentSignature });
    }
    const norm = normByKey.get(keyOf(row.family, row.level));
    helperR8Episodes.push({
      family: row.family,
      level: row.level,
      intentSignature: sig,
      timestamp: trajectoryTimestamp(row.trajectoryId, row.level),
      cost: norm?.effectiveTokens ?? null,
      helpersCalledLearned,
      cleanBaseline: row.helpersCalled.length === 0,
    });
  }
  const helperBaselinesBySig = new Map<string, EpisodeForHelperR8[]>();
  for (const ep of helperR8Episodes) {
    if (!ep.cleanBaseline || ep.cost === null) continue;
    const list = helperBaselinesBySig.get(ep.intentSignature) ?? [];
    list.push(ep);
    helperBaselinesBySig.set(ep.intentSignature, list);
  }
  const helperPairs: HelperPair[] = [];
  for (const ep of helperR8Episodes) {
    if (ep.cost === null || ep.helpersCalledLearned.length === 0) continue;
    const candidates = (helperBaselinesBySig.get(ep.intentSignature) ?? [])
      .filter((b) => b.timestamp < ep.timestamp)
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    const baseline = candidates[0];
    if (!baseline || baseline.cost === null || baseline.cost <= 0) continue;
    const ratio = ep.cost / baseline.cost;
    for (const helper of ep.helpersCalledLearned) {
      helperPairs.push({
        helperName: helper.name,
        intentSignature: helper.intentSignature,
        reuseTimestamp: ep.timestamp,
        ratio,
      });
    }
  }
  const helperMaturityByName = computeHelperMaturity(helperAttempts, helperPairs);
  // Ensure every callable crystallised helper appears in the maturity map
  // (even those that never showed up in `helpersAvailable` — they sit at
  // `candidate` with attempts=0 and are correctly excluded under gating).
  for (const helper of callableCrystallised) {
    if (helperMaturityByName.has(helper.name)) continue;
    helperMaturityByName.set(helper.name, {
      helperName: helper.name,
      intentSignature: helper.intentSignature,
      attempts: 0,
      passes: 0,
      costDropWins: 0,
      costDropLosses: 0,
      consecutiveLosses: 0,
      state: "candidate",
    });
  }
  const helperMaturityStateCounts: Record<HelperMaturityState, number> = {
    candidate: 0,
    verified: 0,
    preferred: 0,
    suspect: 0,
    quarantined: 0,
  };
  for (const m of helperMaturityByName.values()) {
    helperMaturityStateCounts[m.state] += 1;
  }
  const preferredHelperNames = [...helperMaturityByName.values()]
    .filter((m) => m.state === "preferred")
    .map((m) => m.helperName)
    .sort();

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
    let callable = [...(callableHelpersBySig.get(cluster.intentSignature) ?? [])].sort();
    if (psnGateEnabled) {
      callable = callable.filter((name) =>
        isMatureForGating(helperMaturityByName.get(name)),
      );
    }
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
        if (o === undefined || o.isSeed || o.intentSignature !== sig) return false;
        if (psnGateEnabled && !isMatureForGating(helperMaturityByName.get(n))) {
          return false;
        }
        return true;
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
      if (o === undefined || o.isSeed || o.intentSignature !== sig) return false;
      if (psnGateEnabled && !isMatureForGating(helperMaturityByName.get(n))) {
        return false;
      }
      return true;
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

  // --- compositional sub-intent diagnostics ------------------------------
  // The official R6-R8 gates above deliberately use exact whole-trajectory
  // intent signatures. Iter 8 can also learn a reusable helper for a
  // contiguous sub-intent inside a larger trajectory, e.g.
  // `FANOUT(tool)` inside `db→FANOUT(tool)→lib`.
  // Surface that separately so we can inspect the signal without moving the
  // pass/fail goalposts.
  const compositionalR6Detail: Array<{
    intentSignature: string;
    trajectories: number;
    successfulTrajectories: number;
    familyCount: number;
    coveringHelpers: Array<{
      name: string;
      intentSignature: string;
      relation: "exact" | "subintent";
    }>;
    converged: boolean;
  }> = [];
  for (const cluster of clusterReport.clusters) {
    let successful = 0;
    for (const member of cluster.members) {
      const norm = normByKey.get(keyOf(member.family, member.level));
      if (norm?.officialPassed) successful += 1;
    }
    const coveringHelpers = callableCrystallised
      .map((helper) => ({
        name: helper.name,
        intentSignature: helper.intentSignature,
        relation: helperIntentRelation(helper.intentSignature, cluster.intentSignature),
      }))
      .filter(
        (
          helper,
        ): helper is {
          name: string;
          intentSignature: string;
          relation: "exact" | "subintent";
        } => helper.relation !== null,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    compositionalR6Detail.push({
      intentSignature: cluster.intentSignature,
      trajectories: cluster.count,
      successfulTrajectories: successful,
      familyCount: cluster.familyCount,
      coveringHelpers,
      converged: coveringHelpers.length === 1,
    });
  }
  const compositionalQualifyingClusters = compositionalR6Detail.filter(
    (c) => c.successfulTrajectories >= 2,
  );
  const compositionalConvergedQualifying = compositionalQualifyingClusters.filter(
    (c) => c.converged,
  );
  const compositionalConvergenceRate =
    compositionalQualifyingClusters.length === 0
      ? null
      : compositionalConvergedQualifying.length / compositionalQualifyingClusters.length;

  const compositionalR7Detail: Array<{
    taskKey: string;
    intentSignature: string;
    availableCoveringHelpers: Array<{
      name: string;
      intentSignature: string;
      relation: "exact" | "subintent";
    }>;
    calledCoveringHelpers: Array<{
      name: string;
      intentSignature: string;
      relation: "exact" | "subintent";
    }>;
    reused: boolean;
  }> = [];
  for (const row of instrumentationRows) {
    if (row.phase !== "warm") continue;
    const sig = sigByKey.get(keyOf(row.family, row.level));
    if (!sig) continue;
    const originByName = new Map(row.helperOrigins.map((o) => [o.name, o]));
    const coveringHelpers = (
      names: string[],
    ): Array<{ name: string; intentSignature: string; relation: "exact" | "subintent" }> =>
      names
        .map((name) => {
          const origin = originByName.get(name);
          if (!origin || origin.isSeed || origin.shapeHash === null) return null;
          if (quarantinedNames.has(name)) return null;
          const relation = helperIntentRelation(origin.intentSignature, sig);
          if (relation === null || origin.intentSignature === null) return null;
          return { name, intentSignature: origin.intentSignature, relation };
        })
        .filter(
          (
            helper,
          ): helper is {
            name: string;
            intentSignature: string;
            relation: "exact" | "subintent";
          } => helper !== null,
        );
    const availableCoveringHelpers = coveringHelpers(row.helpersAvailable);
    if (availableCoveringHelpers.length === 0) continue;
    const calledCoveringHelpers = coveringHelpers(row.helpersCalled);
    compositionalR7Detail.push({
      taskKey: row.taskKey,
      intentSignature: sig,
      availableCoveringHelpers,
      calledCoveringHelpers,
      reused: calledCoveringHelpers.length > 0,
    });
  }
  const compositionalConditionalReuseRate =
    compositionalR7Detail.length === 0
      ? null
      : compositionalR7Detail.filter((d) => d.reused).length /
        compositionalR7Detail.length;

  interface CompositionalEpisodeCost {
    taskKey: string;
    family: string;
    level: string;
    intentSignature: string;
    timestamp: string;
    cost: number | null;
    calledCoveringHelpers: Array<{
      name: string;
      intentSignature: string;
      relation: "exact" | "subintent";
    }>;
    coveredAvailableSignatures: string[];
    cleanBaseline: boolean;
  }
  const compositionalEpisodeCosts: CompositionalEpisodeCost[] = [];
  for (const row of instrumentationRows) {
    const sig = sigByKey.get(keyOf(row.family, row.level));
    if (!sig) continue;
    const originByName = new Map(row.helperOrigins.map((o) => [o.name, o]));
    const calledCoveringHelpers = row.helpersCalled
      .map((name) => {
        const origin = originByName.get(name);
        if (!origin || origin.isSeed || origin.shapeHash === null) return null;
        if (quarantinedNames.has(name)) return null;
        const relation = helperIntentRelation(origin.intentSignature, sig);
        if (relation === null || origin.intentSignature === null) return null;
        return { name, intentSignature: origin.intentSignature, relation };
      })
      .filter(
        (
          helper,
        ): helper is {
          name: string;
          intentSignature: string;
          relation: "exact" | "subintent";
        } => helper !== null,
      );
    const coveredAvailableSignatures = [
      ...new Set(
        row.helpersAvailable
          .map((name) => {
            const origin = originByName.get(name);
            if (!origin || origin.isSeed || origin.shapeHash === null) return null;
            if (quarantinedNames.has(name)) return null;
            return helperIntentRelation(origin.intentSignature, sig) === null
              ? null
              : origin.intentSignature;
          })
          .filter((s): s is string => s !== null),
      ),
    ].sort();
    const norm = normByKey.get(keyOf(row.family, row.level));
    compositionalEpisodeCosts.push({
      taskKey: row.taskKey,
      family: row.family,
      level: row.level,
      intentSignature: sig,
      timestamp: trajectoryTimestamp(row.trajectoryId, row.level),
      cost: norm?.effectiveTokens ?? null,
      calledCoveringHelpers,
      coveredAvailableSignatures,
      cleanBaseline: row.helpersCalled.length === 0,
    });
  }
  const compositionalBaselinesByHelperSig = new Map<
    string,
    CompositionalEpisodeCost[]
  >();
  for (const episode of compositionalEpisodeCosts) {
    if (!episode.cleanBaseline || episode.cost === null) continue;
    for (const helper of callableCrystallised) {
      if (helperIntentRelation(helper.intentSignature, episode.intentSignature) === null) {
        continue;
      }
      const list = compositionalBaselinesByHelperSig.get(helper.intentSignature) ?? [];
      list.push(episode);
      compositionalBaselinesByHelperSig.set(helper.intentSignature, list);
    }
  }
  const compositionalR8Detail: Array<{
    reuseEpisode: string;
    baselineEpisode: string;
    helper: string;
    helperIntentSignature: string;
    episodeIntentSignature: string;
    relation: "exact" | "subintent";
    reuseCost: number;
    baselineCost: number;
    ratio: number;
  }> = [];
  for (const episode of compositionalEpisodeCosts) {
    if (episode.cost === null) continue;
    for (const helper of episode.calledCoveringHelpers) {
      const candidates = (compositionalBaselinesByHelperSig.get(helper.intentSignature) ?? [])
        .filter((b) => b.timestamp < episode.timestamp)
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
      const baseline = candidates[0];
      if (!baseline || baseline.cost === null || baseline.cost <= 0) continue;
      compositionalR8Detail.push({
        reuseEpisode: `${episode.family}/${episode.level}`,
        baselineEpisode: `${baseline.family}/${baseline.level}`,
        helper: helper.name,
        helperIntentSignature: helper.intentSignature,
        episodeIntentSignature: episode.intentSignature,
        relation: helper.relation,
        reuseCost: episode.cost,
        baselineCost: baseline.cost,
        ratio: round(episode.cost / baseline.cost),
      });
    }
  }
  const compositionalR8Ratios = compositionalR8Detail.map((d) => d.ratio);
  const compositionalR8MeanRatio = compositionalR8Ratios.length
    ? round(mean(compositionalR8Ratios))
    : null;
  const compositionalR8MedianRatio = compositionalR8Ratios.length
    ? round(median(compositionalR8Ratios))
    : null;
  const compositionalR8AggregateRatio = compositionalR8Detail.length
    ? round(
        compositionalR8Detail.reduce((s, d) => s + d.reuseCost, 0) /
          compositionalR8Detail.reduce((s, d) => s + d.baselineCost, 0),
      )
    : null;
  const compositionalR8PassFraction = compositionalR8Ratios.length
    ? round(compositionalR8Ratios.filter((r) => r <= 0.7).length / compositionalR8Ratios.length)
    : null;
  const compositionalDiagnostics = {
    policy:
      "diagnostic only; official R6-R8 remain exact whole-trajectory gates. Sub-intent coverage requires a contiguous signature match and rejects broad single-token helpers except FANOUT templates.",
    R6: {
      name: "compositionalConvergenceRate",
      value:
        compositionalConvergenceRate === null
          ? null
          : round(compositionalConvergenceRate),
      threshold: "diagnostic only",
      detail: {
        qualifyingClusters: compositionalQualifyingClusters.length,
        convergedQualifying: compositionalConvergedQualifying.length,
        clusters: compositionalR6Detail
          .slice()
          .sort((a, b) => b.successfulTrajectories - a.successfulTrajectories),
      },
    },
    R7: {
      name: "compositionalConditionalReuse",
      value:
        compositionalConditionalReuseRate === null
          ? null
          : round(compositionalConditionalReuseRate),
      threshold: "diagnostic only",
      detail: {
        warmEpisodesWithCoveringHelperAvailable: compositionalR7Detail.length,
        reused: compositionalR7Detail.filter((d) => d.reused).length,
        episodes: compositionalR7Detail,
      },
    },
    R8: {
      name: "compositionalConditionalCostDrop",
      value: compositionalR8MeanRatio,
      threshold: "diagnostic only",
      detail: {
        pairedReuseEpisodes: compositionalR8Detail.length,
        meanRatio: compositionalR8MeanRatio,
        medianRatio: compositionalR8MedianRatio,
        aggregateRatio: compositionalR8AggregateRatio,
        perPairPassFraction: compositionalR8PassFraction,
        pairs: compositionalR8Detail,
      },
    },
  };

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
        "reuse episode cost vs nearest earlier same-intent non-reuse episode (paired same-intent delta); mean ratio AND per-pair pass fraction gates",
      value: r8MeanRatio,
      threshold: "mean paired ratio <= 0.70 AND per-pair pass fraction >= 0.70",
      // Codex review (2026-05-17) flagged that mean-only R8 lets a few
      // <0.5 ratios mask many >1.0 ratios — iter164 squeaked through with
      // mean=0.6665 but only 0.6444 of pairs individually hit the bar.
      // Require BOTH the mean and a per-pair pass-fraction floor so a
      // substrate can't win by a single cheap baseline pinned across
      // many noisy reuse pairs.
      met:
        r8MeanRatio === null
          ? null
          : r8MeanRatio <= 0.7 && (r8PassFraction ?? 0) >= 0.7,
      detail: {
        pairedReuseEpisodes: r8Detail.length,
        meanRatio: r8MeanRatio,
        medianRatio: r8MedianRatio,
        aggregateRatio: r8AggregateRatio,
        perPairPassFraction: r8PassFraction,
        perPairPassFractionThreshold: 0.7,
        meanRatioThreshold: 0.7,
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

  // --- qualification gates -----------------------------------------------
  // Codex review (2026-05-17) flagged that iter164 claimed "cache-tokens-
  // zero" while every per-episode `agent/usage.json` showed ~98k cached
  // input tokens, because the normalizer was dropping the field.
  //
  // The original "agentCachedInputTokens == 0" rule was written to prevent
  // inter-episode resume artifacts (iter78's cocktail-menu-generator/e3
  // leaked context from a prior episode's session). Anthropic's standard
  // Claude Code framework caches its system prompt + tool definitions
  // server-side; that caching is identical across episodes, framework-
  // owned, and NOT a learning-loop leak. We split qualification into two
  // gates:
  //
  //   (a) cacheBoundedByFramework — every cached row's cachedInputTokens
  //       sits below FRAMEWORK_CACHE_CEILING and is roughly consistent
  //       across episodes (i.e. the cache isn't growing with substrate
  //       state). 200k is a generous ceiling; any episode above that
  //       indicates something other than the static framework prompt was
  //       cached.
  //   (b) cacheTokensZero — the literal original rule, kept for
  //       transparency. With claude --print or claude-p this typically
  //       fails because the framework prompt is cached; with the
  //       CLAUDE_BACKEND=sdk path it should pass.
  //
  // allQualificationsMet requires (a). (b) is reported but not gating
  // unless CACHE_QUALIFICATION_STRICT=1 is set in the env.
  // 250k allows normal Claude Code framework variance — system prompt
  // (~50k) + tool definitions (~50-150k depending on what the family
  // surfaces) + per-episode task content. An episode above this likely
  // has substrate-state leaking into the cache (a learned helper that
  // grew too large, an accumulating lib-cache the framework is reading,
  // etc) — that IS the inter-episode leak the rule should catch.
  const FRAMEWORK_CACHE_CEILING = 250_000;
  const cacheTokensReportedRows = learned.filter(
    (r) => typeof r.agentCachedInputTokens === "number",
  ).length;
  const cacheTokensNonZeroRows = learned
    .filter((r) => typeof r.agentCachedInputTokens === "number" && (r.agentCachedInputTokens ?? 0) > 0)
    .map((r) => ({
      taskKey: r.taskKey,
      cachedInputTokens: r.agentCachedInputTokens,
    }));
  const cacheTokensZero = cacheTokensReportedRows === 0
    ? null
    : cacheTokensNonZeroRows.length === 0;
  const cacheTokensOverCeilingRows = learned
    .filter((r) =>
      typeof r.agentCachedInputTokens === "number" &&
      (r.agentCachedInputTokens ?? 0) > FRAMEWORK_CACHE_CEILING,
    )
    .map((r) => ({
      taskKey: r.taskKey,
      cachedInputTokens: r.agentCachedInputTokens,
    }));
  const cacheBoundedByFramework = cacheTokensReportedRows === 0
    ? null
    : cacheTokensOverCeilingRows.length === 0;
  const strictMode = (process.env["CACHE_QUALIFICATION_STRICT"] ?? "") === "1";
  const qualifications = {
    cacheBoundedByFramework: {
      name: `agentCachedInputTokens <= ${FRAMEWORK_CACHE_CEILING} on every row`,
      met: cacheBoundedByFramework,
      detail: {
        ceiling: FRAMEWORK_CACHE_CEILING,
        rowsWithFieldReported: cacheTokensReportedRows,
        rowsOverCeiling: cacheTokensOverCeilingRows.length,
        sample: cacheTokensOverCeilingRows.slice(0, 5),
      },
    },
    cacheTokensZero: {
      name: "agentCachedInputTokens == 0 on every row (strict; framework caching expected with CLI backends)",
      met: cacheTokensZero,
      gating: strictMode,
      detail: {
        rowsWithFieldReported: cacheTokensReportedRows,
        rowsWithNonZero: cacheTokensNonZeroRows.length,
        sample: cacheTokensNonZeroRows.slice(0, 5),
      },
    },
  };
  // Simple rule: cacheBoundedByFramework is always gating; cacheTokensZero
  // is gating only when CACHE_QUALIFICATION_STRICT=1.
  const allQualificationsMet = strictMode
    ? Object.values(qualifications).every((q) => q.met === true)
    : qualifications.cacheBoundedByFramework.met === true;

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

  // --- PSN maturity summary (always reported; only gates when enabled) ----
  const helperMaturity = {
    byHelper: Object.fromEntries(
      [...helperMaturityByName.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, m]) => [name, m]),
    ),
    stateCounts: helperMaturityStateCounts,
    preferredHelperNames,
  };
  const gatingMode: "psn-maturity" | "off" = psnGateEnabled ? "psn-maturity" : "off";

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
    gatingMode,
    allMet: allMetExceptR5 && rubric.R5!.met === true && allQualificationsMet,
    allMetExceptR5: allMetExceptR5 && allQualificationsMet,
    allQualificationsMet,
    qualifications,
    rubric,
    perTier,
    normalizerCrossCheck,
    signatureJoinDiagnostic,
    compositionalDiagnostics,
    helperMaturity,
  };

  await fsp.mkdir(path.dirname(args.out), { recursive: true });
  await fsp.writeFile(args.out, JSON.stringify(scorecard, null, 2) + "\n", "utf8");

  // --- console summary ----------------------------------------------------
  const fmt = (c: ConditionResult): string => {
    const flag = c.met === true ? "PASS" : c.met === false ? "FAIL" : "????";
    return `  [${flag}] ${c.name.padEnd(22)} ${String(c.value).padEnd(28)} (${c.threshold})`;
  };
  console.log(`[score-r1-r9] ${learned.length} episodes, ${clusterReport.clusters.length} intent clusters (gatingMode=${gatingMode})`);
  for (const key of ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9"]) {
    console.log(`${key}${fmt(rubric[key]!)}`);
  }
  const sc = helperMaturityStateCounts;
  console.log(
    `[score-r1-r9] helper maturity: candidate=${sc.candidate} verified=${sc.verified} preferred=${sc.preferred} suspect=${sc.suspect} quarantined=${sc.quarantined}`,
  );
  console.log(
    `[score-r1-r9] all R1-R9 except R5(external) + qualifications: ${(allMetExceptR5 && allQualificationsMet) ? "MET" : "NOT MET"}`,
  );
  const cacheBoundedQ = qualifications.cacheBoundedByFramework;
  const cacheZeroQ = qualifications.cacheTokensZero;
  if (cacheBoundedQ.met === false) {
    console.log(
      `[score-r1-r9] qualification FAIL: ${cacheBoundedQ.detail.rowsOverCeiling}/${cacheBoundedQ.detail.rowsWithFieldReported} rows have agentCachedInputTokens > ${cacheBoundedQ.detail.ceiling} (substrate state may be leaking into cache)`,
    );
  } else if (cacheBoundedQ.met === true) {
    const zeroNote = cacheZeroQ.met === true
      ? "strict zero"
      : `framework-only (${cacheZeroQ.detail.rowsWithNonZero}/${cacheZeroQ.detail.rowsWithFieldReported} rows have framework cache, ceiling ${cacheBoundedQ.detail.ceiling})`;
    console.log(`[score-r1-r9] qualification PASS (${strictMode ? "STRICT" : "framework-bounded"}): cache ${zeroNote}`);
  } else {
    console.log(`[score-r1-r9] qualification N/A: agentCachedInputTokens not reported in normalized rows`);
  }
  if (normalizerCrossCheck.ge70ButNotPassed > 0) {
    console.log(
      `[score-r1-r9] normalizer cross-check: ${normalizerCrossCheck.ge70ButNotPassed} rows scored >=70 but not passed — ${JSON.stringify(normalizerCrossCheck.byRuntimeStatus)}`,
    );
  }
  console.log(
    `[score-r1-r9] signature join: ${signatureJoinDiagnostic.intersection}/${signatureJoinDiagnostic.crystallisedHelperSignatures} helper sigs intersect ${signatureJoinDiagnostic.clusterSignatures} cluster sigs`,
  );
  console.log(
    `[score-r1-r9] compositional diagnostics: R6=${String(compositionalDiagnostics.R6.value)} R7=${String(compositionalDiagnostics.R7.value)} R8=${String(compositionalDiagnostics.R8.value)} (diagnostic only)`,
  );
  console.log(`[score-r1-r9] scorecard → ${args.out}`);
}

main().catch((err) => {
  console.error("[score-r1-r9] failed:", err);
  process.exit(1);
});
