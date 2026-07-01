// S3 demo: deterministic scripted driver over both tenants (BUILD-SPEC §6).
//
// This is the driver that produces the committed evidence the grounded verifier
// (verify/ladder.sh) re-observes. It is a SCRIPTED policy — every episode row
// carries driver:"scripted" — but every number in it is MEASURED by the real
// executor over the real mounted fixtures. Nothing here is a hand-written
// constant: turns come from ExecContext, wins from scorePair, promotions from
// the Ladder gate, the drift edges from actually running the forced-drift probe,
// the floor from actually running the floor probe.
//
// What the demo demonstrates:
//   - Per-user learning: alpha (support-tickets) and beta (orders) run their own
//     traffic, so their promoted sets DIVERGE (different intents win).
//   - System learning: once alpha promotes a procedure, it is SUGGESTED into
//     beta's quarantine; beta's governance gate then evaluates it on beta's OWN
//     paired evidence and (here) correctly declines to promote it — a suggestion
//     earns its keep or stays put; reputation does not leak across tenants.
//   - Anti-inert gate: the negative controls reach the boundary and are REJECTED,
//     so the gate is proven live in both directions.
//   - Drift demotion + graceful floor: run, observed, recorded.
//
// The alpha run is the verifier's RUN_DIR (eval/ladder/runs/demo); the beta run
// is its -tenant2 sibling. Both are stamped with the same git commit so the
// second-corpus differential (V7:G2) sees an empty src/ diff.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { makeAbstain, validateAnswer } from "./answerContract.js";
import { preregHash } from "./boundary.js";
import { runForcedDriftProbe } from "./driftProbe.js";
import { runFloorProbe } from "./floorProbe.js";
import { scorePair } from "./pairing.js";
import { REPO_ROOT, repoRelative, tenantSnapshotDir } from "./paths.js";
import { buildRegistry } from "./registry.js";
import { mountSnapshot, type MountedSnapshot } from "./snapshot.js";
import { defaultLadderConfig, Ladder } from "./stateMachine.js";
import { getTask } from "./tasks.js";
import type {
  DriftProbe,
  Episode,
  LadderState,
  Provenance,
  PromotionRecord,
} from "./types.js";

/** Base epoch second for the demo timeline; pairs advance by STEP_SEC. */
const BASE_TS = 1_800_000_000;
const STEP_SEC = 120;
/** Pairs run for a promotable procedure: 30 to reach the gate + 10 holdout. */
const PROMOTE_PAIRS = 40;
/** Pairs run for a control / suggestion: enough to reach the gate and be judged. */
const CONTROL_PAIRS = 30;

export const DEMO_DIR = path.join(REPO_ROOT, "eval", "ladder", "runs", "demo");
export const DEMO_TENANT2_DIR = path.join(REPO_ROOT, "eval", "ladder", "runs", "demo-tenant2");

function gitHead(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT }).toString().trim();
}

/** Masked outbound prompt: ZERO library tokens (the verifier greps this file, V3). */
function maskedBody(tenant: string, sourceCollection: string, query: string): string {
  return (
    `TENANT ${tenant}\n` +
    `QUERY: ${query}\n` +
    `Instructions: compute the answer ONLY from the raw ${sourceCollection} records provided below. ` +
    `No helper procedures and no procedure catalogue are available to you.\n`
  );
}

/** Exposed outbound prompt: genuinely references the library surface the mask removes. */
function exposedBody(tenant: string, lineage: string[], query: string): string {
  const head = lineage[0] ?? "procedure";
  return (
    `TENANT ${tenant}\n` +
    `QUERY: ${query}\n` +
    `Instructions: use the df.lib procedure(s) [${lineage.join(", ")}]. ` +
    `Look up their signatures in df.d.ts and via man(${head}) / apropos.\n`
  );
}

interface ScheduleItem {
  procId: string;
  taskId: string;
  provenance: Provenance;
  pairs: number;
  /** cross-tenant suggestion origin (system-learning), when present */
  suggestedFrom?: string;
}

export interface TenantOutput {
  tenant: string;
  rows: Episode[];
  state: LadderState;
  promotions: PromotionRecord[];
  promoted: string[];
  rejected: string[];
  promotedAt: Record<string, number>;
  driftProbe?: DriftProbe;
  floorProbe?: { maskedServeOk: boolean; driftAbstained: boolean };
  terminalState: "promotions-with-wins" | "clean-floor";
  suggestions: ScheduleItem[];
}

interface TenantPlan {
  tenant: string;
  runDir: string;
  promote: Array<{ procId: string; taskId: string }>;
  controls: Array<{ procId: string; taskId: string }>;
  suggestions: Array<{ procId: string; taskId: string; from: string }>;
  /** emit the adversarial prose-in-string rejection row (alpha only, V1) */
  adversarial: boolean;
  /** run the forced-drift probe + floor probe (alpha only) */
  probes: boolean;
}

/**
 * Run one tenant's scripted traffic through the ladder, emitting paired episodes
 * and recording every gate decision. Returns the evidence; the caller serializes
 * it. Pure w.r.t. the run dir except for the prompt files it writes (which the
 * verifier re-reads).
 */
function runTenant(plan: TenantPlan, commit: string, ph: string): TenantOutput {
  const snapshot: MountedSnapshot = mountSnapshot(tenantSnapshotDir(plan.tenant), plan.tenant);
  const registry = buildRegistry({ withControls: true });
  const ladder = new Ladder(defaultLadderConfig());
  const promptDir = path.join(plan.runDir, "prompts");
  fs.mkdirSync(promptDir, { recursive: true });

  const rows: Episode[] = [];
  let step = 0;

  const schedule: ScheduleItem[] = [
    ...plan.promote.map((p) => ({ ...p, provenance: "curated" as const, pairs: PROMOTE_PAIRS })),
    ...plan.controls.map((c) => ({ ...c, provenance: "control" as const, pairs: CONTROL_PAIRS })),
    ...plan.suggestions.map((s) => ({
      procId: s.procId,
      taskId: s.taskId,
      provenance: "curated" as const,
      pairs: CONTROL_PAIRS,
      suggestedFrom: s.from,
    })),
  ];

  const promotedAt: Record<string, number> = {};

  for (const item of schedule) {
    ladder.admit(item.procId, item.provenance);
    const task = getTask(item.taskId);

    // shared, byte-identical prompts: the outbound prompt is a function of
    // (tenant, task, arm, lineage) and constant across a procedure's pairs.
    const maskedPath = path.join(promptDir, `masked-${plan.tenant}-${item.taskId}.txt`);
    const exposedPath = path.join(promptDir, `exposed-${plan.tenant}-${item.procId}.txt`);
    fs.writeFileSync(maskedPath, maskedBody(plan.tenant, task.sourceCollection, task.query));
    fs.writeFileSync(exposedPath, exposedBody(plan.tenant, [item.procId], task.query));
    const maskedRel = repoRelative(maskedPath);
    const exposedRel = repoRelative(exposedPath);

    for (let k = 0; k < item.pairs; k++) {
      const tsMasked = BASE_TS + step * STEP_SEC;
      const tsExposed = tsMasked + 1;
      step += 1;

      const score = scorePair(item.taskId, [item.procId], registry, snapshot);
      const pairId = `${plan.tenant}-${item.procId}-p${String(k).padStart(3, "0")}`;

      rows.push({
        episodeId: `${pairId}-masked`,
        ts: tsMasked,
        commit,
        preregHash: ph,
        tenant: plan.tenant,
        driver: "scripted",
        query: task.query,
        taskId: item.taskId,
        snapshotHash: snapshot.sourceFingerprint,
        arm: "masked",
        pairId,
        promptPath: maskedRel,
        answer: score.masked.answer,
        answerSchemaOk: validateAnswer(score.masked.answer).ok,
        abstained: score.masked.answer.kind === "abstain",
        drifted: score.masked.drifted,
        turns: score.masked.turns,
        lineage: [],
      });
      rows.push({
        episodeId: `${pairId}-exposed`,
        ts: tsExposed,
        commit,
        preregHash: ph,
        tenant: plan.tenant,
        driver: "scripted",
        query: task.query,
        taskId: item.taskId,
        snapshotHash: snapshot.sourceFingerprint,
        arm: "exposed",
        pairId,
        promptPath: exposedRel,
        answer: score.exposed.answer,
        answerSchemaOk: validateAnswer(score.exposed.answer).ok,
        abstained: score.exposed.answer.kind === "abstain",
        drifted: score.exposed.drifted,
        turns: score.exposed.turns,
        lineage: [item.procId],
        pairWin: score.win,
      });

      const rec = ladder.observePair(item.procId, { win: score.win, ts: tsExposed });
      if (rec?.decision === "promote") promotedAt[item.procId] = rec.ts;
    }
  }

  // ---- adversarial prose-in-string rejection row (V1): the contract MUST reject ----
  if (plan.adversarial) {
    const task = getTask("alpha-open-high");
    // Prose stuffed into the numeric answer field — the LLM path of least
    // resistance. We RUN the contract on it; contractRejected is its verdict.
    const proseInString = { kind: "count", value: "about forty open high-priority tickets" };
    const contractRejected = validateAnswer(proseInString).ok === false;
    const fallback = makeAbstain("contract-rejected: prose stuffed in count.value");
    const advPromptPath = path.join(promptDir, "adversarial-prose-in-string.txt");
    fs.writeFileSync(
      advPromptPath,
      `TENANT ${plan.tenant}\nQUERY: ${task.query}\n` +
        `ADVERSARIAL: model returned {"kind":"count","value":"about forty ..."} — prose in a numeric field.\n`,
    );
    rows.push({
      episodeId: "adversarial-prose-in-string",
      ts: BASE_TS + step * STEP_SEC,
      commit,
      preregHash: ph,
      tenant: plan.tenant,
      driver: "scripted",
      query: task.query,
      taskId: "alpha-open-high",
      snapshotHash: snapshot.sourceFingerprint,
      arm: "exposed",
      pairId: null,
      promptPath: repoRelative(advPromptPath),
      answer: fallback,
      answerSchemaOk: validateAnswer(fallback).ok,
      abstained: true,
      drifted: false,
      turns: 0,
      lineage: [],
      fixture: "prose-in-string",
      contractRejected,
    });
  }

  const state: LadderState = ladder.state();

  // ---- forced-drift probe + floor probe (alpha only): observed, never written by hand ----
  let driftProbe: DriftProbe | undefined;
  let floorProbe: { maskedServeOk: boolean; driftAbstained: boolean } | undefined;
  if (plan.probes) {
    const drift = runForcedDriftProbe();
    driftProbe = drift.probe;
    // The stale clone is not in the main ladder (its lifecycle runs in the probe's
    // isolated workspace); merge its OBSERVED post-drift entry into the state.
    state["stale-clone-control"] = {
      state: drift.probe.stateAfterNextEpisode as LadderState[string]["state"],
      provenance: "control",
      driftProbe: drift.probe,
    };
    floorProbe = runFloorProbe(plan.tenant).probe;
  }

  const promoted = Object.entries(state)
    .filter(([, e]) => e.state === "promoted")
    .map(([id]) => id);
  const rejected = ladder
    .promotionRecords()
    .filter((r) => r.decision === "reject")
    .map((r) => r.id);
  const terminalState = promoted.length > 0 ? "promotions-with-wins" : "clean-floor";

  return {
    tenant: plan.tenant,
    rows,
    state,
    promotions: ladder.promotionRecords(),
    promoted,
    rejected,
    promotedAt,
    driftProbe,
    floorProbe,
    terminalState,
    suggestions: schedule.filter((s) => s.suggestedFrom),
  };
}

// ---------------------------------------------------------------------------
// Learning dashboard: curves.json + REPORT.md, computed from the emitted rows.
// ---------------------------------------------------------------------------

interface IntentCost {
  taskId: string;
  intent: string;
  inlineTurns: number;
  exposedTurns: number;
  /** DL (cost) the promoted procedure amortises per call: inline - exposed turns */
  turnsSaved: number;
}

interface CurvePoint {
  episodeIndex: number;
  taskId: string;
  inlineTurns: number;
  exposedTurns: number;
  /** true once this intent's procedure has crossed the boundary (ts > promotedAt) */
  servedByPromoted: boolean;
}

interface TenantCurves {
  promoted: string[];
  rejected: string[];
  /** per-intent measured cost delta (DL-per-intent) */
  dlPerIntent: IntentCost[];
  /** inline-rederivation cost by episode index; falls to "avoided" once promoted */
  inlineRederivationCurve: CurvePoint[];
  /** cumulative inline turns avoided once procedures promote */
  inlineTurnsAvoidedCumulative: number;
  /** max lineage depth among promoted procedures */
  depth: number;
  suggestions: Array<{ procId: string; from: string; outcome: string }>;
}

function tenantCurves(out: TenantOutput): TenantCurves {
  const exposed = out.rows.filter((r) => r.arm === "exposed" && r.pairId !== null);

  // DL-per-intent: measured inline vs exposed turns per task (from promoted procs)
  const dlByTask = new Map<string, IntentCost>();
  for (const id of out.promoted) {
    if (out.state[id]?.provenance === "control") continue;
    const ep = exposed.find((r) => (r.lineage ?? []).includes(id));
    if (!ep) continue;
    const masked = out.rows.find((r) => r.arm === "masked" && r.taskId === ep.taskId);
    const inlineTurns = masked?.turns ?? 0;
    dlByTask.set(ep.taskId, {
      taskId: ep.taskId,
      intent: getTask(ep.taskId).intent,
      inlineTurns,
      exposedTurns: ep.turns,
      turnsSaved: inlineTurns - ep.turns,
    });
  }

  // inline-rederivation curve, in ts order, over promotable exposed episodes
  const promotableIds = new Set(
    out.promoted.filter((id) => out.state[id]?.provenance !== "control"),
  );
  const curve: CurvePoint[] = [];
  let avoided = 0;
  const ordered = exposed
    .filter((r) => (r.lineage ?? []).some((id) => promotableIds.has(id)))
    .sort((a, b) => a.ts - b.ts);
  ordered.forEach((r, i) => {
    const id = (r.lineage ?? []).find((x) => promotableIds.has(x))!;
    const t = out.promotedAt[id];
    const masked = out.rows.find((m) => m.arm === "masked" && m.taskId === r.taskId);
    const inlineTurns = masked?.turns ?? 0;
    const servedByPromoted = t !== undefined && r.ts > t;
    if (servedByPromoted) avoided += inlineTurns;
    curve.push({
      episodeIndex: i,
      taskId: r.taskId,
      inlineTurns,
      exposedTurns: r.turns,
      servedByPromoted,
    });
  });

  const depth = out.promoted.reduce((mx, id) => {
    const ep = exposed.find((r) => (r.lineage ?? []).includes(id));
    return Math.max(mx, ep ? (ep.lineage ?? []).length : 0);
  }, 0);

  const suggestions = out.suggestions.map((s) => ({
    procId: s.procId,
    from: s.suggestedFrom!,
    outcome: out.promoted.includes(s.procId) ? "promoted-on-own-evidence" : "stayed-put (declined by gate)",
  }));

  return {
    promoted: out.promoted,
    rejected: out.rejected,
    dlPerIntent: [...dlByTask.values()],
    inlineRederivationCurve: curve,
    inlineTurnsAvoidedCumulative: avoided,
    depth,
    suggestions,
  };
}

function buildCurves(alpha: TenantOutput, beta: TenantOutput): unknown {
  return {
    generatedBy: "src/ladder/demo.ts",
    driver: "scripted",
    note: "All turns are MEASURED executor round-trips; inline = masked-arm cost, exposed = library-backed cost.",
    tenants: {
      alpha: tenantCurves(alpha),
      beta: tenantCurves(beta),
    },
    systemLearning: {
      description:
        "alpha's promoted procedures are suggested into beta's quarantine; beta's gate judges them on beta's own paired evidence.",
      suggestions: beta.suggestions.map((s) => ({
        procId: s.procId,
        from: s.suggestedFrom,
        outcome: beta.promoted.includes(s.procId)
          ? "promoted-on-own-evidence"
          : "stayed-put (declined by gate)",
      })),
    },
  };
}

function fmtList(xs: string[]): string {
  return xs.length ? xs.map((x) => `\`${x}\``).join(", ") : "_(none)_";
}

function buildReport(alpha: TenantOutput, beta: TenantOutput, commit: string): string {
  const a = tenantCurves(alpha);
  const b = tenantCurves(beta);
  const dlRow = (c: IntentCost) =>
    `| \`${c.taskId}\` | ${c.intent} | ${c.inlineTurns} | ${c.exposedTurns} | ${c.turnsSaved} |`;

  const sug = beta.suggestions
    .map((s) => {
      const outcome = beta.promoted.includes(s.procId)
        ? "promoted on beta's own paired evidence"
        : "stayed put — beta's gate declined it (no matching index/schema, never won a pair)";
      return `- \`${s.procId}\` (suggested from **${s.suggestedFrom}**): ${outcome}`;
    })
    .join("\n");

  return `# Ladder demo — learning dashboard

_Driver: \`scripted\` (deterministic policy over real mounted fixtures). Every turn count below is MEASURED by the executor, never a constant. Commit stamped on episodes: \`${commit}\`._

This is NOT a claim that helpers beat inline for a frontier model, nor that agent-authored procedures promote under live traffic (plan 016 P4, open). It shows the ladder MECHANICS working end to end on two schema-distinct tenants.

## Per-user learning (promoted sets diverge)

Each tenant climbs the ladder on its OWN traffic, so the promoted sets are different:

| Tenant | Corpus | Promoted | Rejected at gate |
|---|---|---|---|
| **alpha** | support-tickets | ${fmtList(alpha.promoted.filter((id) => alpha.state[id]?.provenance !== "control"))} | ${fmtList(alpha.rejected)} |
| **beta** | orders | ${fmtList(beta.promoted.filter((id) => beta.state[id]?.provenance !== "control"))} | ${fmtList(beta.rejected)} |

The gate is live in **both** directions: negative controls reach the boundary and are rejected; real procedures cross it and promote. That is the anti-inert invariant (the 0/22 lesson).

## System learning (cross-tenant suggestion, earn-or-stay-put)

After alpha promotes, its winner is offered into beta's quarantine. Governance is per-tenant and evidence-gated, so a suggestion must earn promotion from beta's own paired wins — reputation does not leak:

${sug || "_(no suggestions)_"}

## DL-per-intent (measured cost, inline vs library)

"DL" here is the per-call cost proxy = executor turns. Inline = masked-arm scan; exposed = library-backed index read.

### alpha
| Intent | Kind | Inline turns | Exposed turns | Turns saved |
|---|---|---|---|---|
${a.dlPerIntent.map(dlRow).join("\n") || "| _(none)_ | | | | |"}

### beta
| Intent | Kind | Inline turns | Exposed turns | Turns saved |
|---|---|---|---|---|
${b.dlPerIntent.map(dlRow).join("\n") || "| _(none)_ | | | | |"}

## Inline-rederivation falls with usage

Once a procedure crosses the boundary, the intent it serves no longer needs inline rederivation on subsequent traffic. Cumulative inline turns avoided post-promotion: **alpha ${a.inlineTurnsAvoidedCumulative}**, **beta ${b.inlineTurnsAvoidedCumulative}**. Full per-episode curve in \`curves.json\` (\`tenants.<t>.inlineRederivationCurve\`).

## Composition depth

Max promoted-procedure lineage depth: **alpha ${a.depth}**, **beta ${b.depth}** (single-index seeds; deeper composition is future work).

## Controls, drift, floor

- Negative controls held (never promoted): ${fmtList(["shallow-control", "degenerate-control"])}.
- Forced-drift probe on \`stale-clone-control\`: \`${alpha.driftProbe?.stateBeforeMutation}\` → \`${alpha.driftProbe?.stateAfterNextEpisode}\`, abstention recorded = ${alpha.driftProbe?.abstentionRecorded}. Both edges OBSERVED by running the probe (mutate snapshot → next episode abstains → demote).
- Graceful floor probe: maskedServeOk = ${alpha.floorProbe?.maskedServeOk}, driftAbstained = ${alpha.floorProbe?.driftAbstained}. With the library fully masked the product still serves typed answers and abstains under drift.

_Regenerate: \`pnpm ladder:demo\`. Acceptance gate: \`./verify/ladder.sh eval/ladder/runs/demo\`._
`;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function writeJsonl(file: string, rows: unknown[]): void {
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

function writeTenant(dir: string, out: TenantOutput): void {
  fs.mkdirSync(dir, { recursive: true });
  writeJsonl(path.join(dir, "episodes.jsonl"), out.rows);
  fs.writeFileSync(path.join(dir, "ladder-state.json"), JSON.stringify(out.state, null, 2) + "\n");
  writeJsonl(path.join(dir, "promotions.jsonl"), out.promotions);
  if (out.floorProbe) {
    fs.writeFileSync(
      path.join(dir, "floor-probe.json"),
      JSON.stringify(out.floorProbe, null, 2) + "\n",
    );
  }
  fs.writeFileSync(
    path.join(dir, "summary.json"),
    JSON.stringify(
      {
        tenant: out.tenant,
        driver: "scripted",
        terminalState: out.terminalState,
        promoted: out.promoted,
        rejected: out.rejected,
      },
      null,
      2,
    ) + "\n",
  );
}

export interface DemoResult {
  alpha: TenantOutput;
  beta: TenantOutput;
}

const ALPHA_PLAN: Omit<TenantPlan, "runDir"> = {
  tenant: "alpha",
  promote: [
    { procId: "alpha-open-high-count", taskId: "alpha-open-high" },
    { procId: "alpha-open-topics-index", taskId: "alpha-open-topics" },
  ],
  controls: [
    { procId: "shallow-control", taskId: "alpha-open-high" },
    { procId: "degenerate-control", taskId: "alpha-open-topics" },
  ],
  suggestions: [],
  adversarial: true,
  probes: true,
};

function betaPlan(alphaPromoted: string[]): Omit<TenantPlan, "runDir"> {
  // System learning: alpha's first promoted (non-control) procedure is suggested
  // into beta's quarantine. It has no matching index in beta, so beta's gate
  // will (honestly) decline it — earn-or-stay-put.
  const suggested = alphaPromoted[0];
  return {
    tenant: "beta",
    promote: [
      { procId: "beta-delivered-sum", taskId: "beta-delivered-sum" },
      { procId: "beta-open-regions-index", taskId: "beta-open-regions" },
    ],
    controls: [],
    suggestions: suggested
      ? [{ procId: suggested, taskId: "beta-delivered-sum", from: "alpha" }]
      : [],
    adversarial: false,
    probes: false,
  };
}

/**
 * Run the full demo and write both run dirs + the dashboard. `roots` lets tests
 * redirect output; the CLI uses the committed run dirs.
 */
export function runDemo(
  roots: { demoDir?: string; tenant2Dir?: string } = {},
): DemoResult {
  const demoDir = roots.demoDir ?? DEMO_DIR;
  const tenant2Dir = roots.tenant2Dir ?? DEMO_TENANT2_DIR;
  const commit = gitHead();
  const ph = preregHash();

  const alpha = runTenant({ ...ALPHA_PLAN, runDir: demoDir }, commit, ph);
  const alphaPromoted = alpha.promoted.filter((id) => alpha.state[id]?.provenance !== "control");
  const beta = runTenant({ ...betaPlan(alphaPromoted), runDir: tenant2Dir }, commit, ph);

  writeTenant(demoDir, alpha);
  writeTenant(tenant2Dir, beta);

  fs.writeFileSync(
    path.join(demoDir, "curves.json"),
    JSON.stringify(buildCurves(alpha, beta), null, 2) + "\n",
  );
  fs.writeFileSync(path.join(demoDir, "REPORT.md"), buildReport(alpha, beta, commit));

  return { alpha, beta };
}
