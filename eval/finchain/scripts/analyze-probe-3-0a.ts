// Analyser for the iter 3.0a probe (Goal 5).
//
// Reads two run directories produced by `pnpm eval:finchain --live` — one
// control (no preseed) and one helper-arm (preseed enabled) — and computes:
//   - per-arm FAC rate, mean effective tokens, mean wall-clock ms
//   - per-arm helper-call count (df.lib.ci_two_phase_semiannual)
//   - the probe verdict: helper-call > 0 AND (FAC delta > 0 OR token delta < 0)
//
// Writes a single JSON verdict file. The /goal hook reads acceptance from
// `verdict.helperCalled` and `verdict.measurableImprovement`.

import { promises as fsp } from "node:fs";
import path from "node:path";

interface EpisodeRow {
  taskKey: string;
  facMatch?: boolean;
  passed?: boolean;
  predictedFinalValue?: number | null;
  goldFinalValue?: number | null;
  effectiveTokens?: number;
  wallClockMs?: number;
  agentElapsedMs?: number;
  llmCalls?: number;
  snippetExitCode?: number;
  artifactPath?: string;
  answerStatus?: string;
}

interface Trajectory {
  id: string;
  calls?: Array<{ primitive: string }>;
}

interface ArmSummary {
  label: string;
  episodes: number;
  facRate: number;
  meanTokens: number;
  meanWallMs: number;
  helperCalls: number;
  helperCallsPerEpisode: number;
  primitiveHistogram: Record<string, number>;
  episodeRows: EpisodeRow[];
}

function parseArgs(argv: string[]): {
  control: string;
  helper: string;
  out: string;
} {
  const out = { control: "", helper: "", out: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--control") out.control = argv[++i]!;
    else if (arg === "--helper") out.helper = argv[++i]!;
    else if (arg === "--out") out.out = argv[++i]!;
  }
  if (!out.control || !out.helper || !out.out) {
    throw new Error("usage: analyze-probe-3-0a --control <dir> --helper <dir> --out <file>");
  }
  return out;
}

async function readEpisodes(dir: string): Promise<EpisodeRow[]> {
  const jsonlPath = path.join(dir, "episodes.jsonl");
  const raw = await fsp.readFile(jsonlPath, "utf8");
  return raw.split("\n").filter(Boolean).map((line) => JSON.parse(line) as EpisodeRow);
}

async function walkTrajectories(dir: string): Promise<Trajectory[]> {
  const out: Trajectory[] = [];
  async function recurse(p: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fsp.readdir(p, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(p, entry.name);
      if (entry.isDirectory()) await recurse(full);
      else if (entry.isFile() && entry.name.startsWith("traj_") && entry.name.endsWith(".json")) {
        try {
          const t = JSON.parse(await fsp.readFile(full, "utf8")) as Trajectory;
          out.push(t);
        } catch {
          /* ignore corrupt trajectory */
        }
      }
    }
  }
  await recurse(dir);
  return out;
}

function summarizeArm(label: string, rows: EpisodeRow[], trajectories: Trajectory[]): ArmSummary {
  const facCount = rows.filter((r) => r.facMatch === true).length;
  const tokens = rows.map((r) => r.effectiveTokens ?? 0);
  const walls = rows.map((r) => r.wallClockMs ?? 0);
  const meanTokens = tokens.length === 0 ? 0 : tokens.reduce((a, b) => a + b, 0) / tokens.length;
  const meanWallMs = walls.length === 0 ? 0 : walls.reduce((a, b) => a + b, 0) / walls.length;
  const primitiveHistogram: Record<string, number> = {};
  let helperCalls = 0;
  for (const t of trajectories) {
    for (const c of t.calls ?? []) {
      primitiveHistogram[c.primitive] = (primitiveHistogram[c.primitive] ?? 0) + 1;
      if (c.primitive === "lib.ci_two_phase_semiannual") helperCalls += 1;
    }
  }
  return {
    label,
    episodes: rows.length,
    facRate: rows.length === 0 ? 0 : facCount / rows.length,
    meanTokens,
    meanWallMs,
    helperCalls,
    helperCallsPerEpisode: rows.length === 0 ? 0 : helperCalls / rows.length,
    primitiveHistogram,
    episodeRows: rows,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const [controlRows, helperRows, controlTraj, helperTraj] = await Promise.all([
    readEpisodes(args.control),
    readEpisodes(args.helper),
    walkTrajectories(args.control),
    walkTrajectories(args.helper),
  ]);

  const control = summarizeArm("control", controlRows, controlTraj);
  const helper = summarizeArm("helper", helperRows, helperTraj);

  const tokenDeltaPct = control.meanTokens === 0
    ? 0
    : ((helper.meanTokens - control.meanTokens) / control.meanTokens) * 100;
  const facDelta = helper.facRate - control.facRate;
  const helperCalled = helper.helperCalls > 0;
  // "measurable margin" = FAC absolute delta > 0 OR token reduction > 10%
  const measurableImprovement = facDelta > 0 || tokenDeltaPct < -10;
  const probePass = helperCalled && measurableImprovement;

  const verdict = {
    iter: "3.0a",
    target: "investment_analysis/ci tpl4 (Intermediate, two-phase semi-annual)",
    preseedHelper: "ci_two_phase_semiannual",
    control,
    helper,
    deltas: {
      facDelta,
      tokenDeltaPct: Math.round(tokenDeltaPct * 100) / 100,
      wallDeltaPct: control.meanWallMs === 0
        ? 0
        : Math.round(((helper.meanWallMs - control.meanWallMs) / control.meanWallMs) * 10000) / 100,
    },
    verdict: {
      helperCalled,
      measurableImprovement,
      probePass,
      decision: probePass ? "PROCEED" : "BLOCKED",
      reason: probePass
        ? "agent called the preseeded helper AND helper-arm beat control on FAC OR tokens"
        : !helperCalled
          ? "agent did not call the preseeded helper on any seed"
          : "agent called the helper but neither FAC nor token reduction crossed the measurable margin",
    },
  };

  await fsp.mkdir(path.dirname(args.out), { recursive: true });
  await fsp.writeFile(args.out, `${JSON.stringify(verdict, null, 2)}\n`);
  console.log("[probe-3-0a] verdict written to", args.out);
  console.log(JSON.stringify(verdict.verdict, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
