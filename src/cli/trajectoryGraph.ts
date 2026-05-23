import { promises as fsp } from "node:fs";
import path from "node:path";

import {
  buildTrajectoryOperationGraph,
  readTrajectory,
  type TrajectoryOperationGraph,
  type TrajectoryRecord,
} from "../sdk/index.js";
import { defaultBaseDir } from "../paths.js";

import type { Flags } from "./types.js";

function flagString(flags: Flags, key: string): string | undefined {
  const v = flags[key];
  return typeof v === "string" ? v : undefined;
}

function baseDirFromFlags(flags: Flags): string {
  const flag = flagString(flags, "base-dir");
  return flag ? path.resolve(flag) : defaultBaseDir();
}

export async function cmdGraph(
  positionals: string[],
  flags: Flags,
): Promise<void> {
  const trajectory = await resolveTrajectory(positionals[0], baseDirFromFlags(flags));
  const graph = buildTrajectoryOperationGraph(trajectory);
  if (flags["json"] === true) {
    process.stdout.write(
      `${JSON.stringify(
        {
          trajectoryId: trajectory.id,
          sourceHash: trajectory.sourceHash ?? null,
          graph,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
  process.stdout.write(renderTrajectoryGraphText(trajectory, graph));
}

export function renderTrajectoryGraphText(
  trajectory: TrajectoryRecord,
  graph: TrajectoryOperationGraph = buildTrajectoryOperationGraph(trajectory),
): string {
  const lines: string[] = [];
  lines.push(`trajectory ${trajectory.id}`);
  lines.push(
    `summary reads=${graph.summary.reads} computes=${graph.summary.computes} tools=${graph.summary.tools} writes=${graph.summary.writes} unknown=${graph.summary.unknown}`,
  );
  if (graph.summary.sourceHash) lines.push(`sourceHash ${graph.summary.sourceHash}`);
  lines.push("");
  lines.push("nodes");
  if (graph.nodes.length === 0) {
    lines.push("  (none)");
  } else {
    for (const node of graph.nodes) {
      const call = node.callIndex === undefined ? "" : ` #${node.callIndex}`;
      lines.push(`  ${node.id}${call} ${node.kind} ${node.primitive}`);
    }
  }
  lines.push("");
  lines.push("edges");
  if (graph.edges.length === 0) {
    lines.push("  (none)");
  } else {
    for (const edge of graph.edges) {
      lines.push(`  ${edge.from} -> ${edge.to} (${edge.kind})`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function normalizeTrajectoryRecord(value: unknown): TrajectoryRecord {
  if (isTrajectoryRecord(value)) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("graph: lineage file does not contain an object");
  }
  const compact = value as {
    trajectoryId?: unknown;
    phase?: unknown;
    callPrimitives?: unknown;
    answer?: unknown;
    validation?: unknown;
  };
  if (!Array.isArray(compact.callPrimitives)) {
    throw new Error("graph: lineage file does not contain calls or callPrimitives");
  }
  const calls = compact.callPrimitives
    .filter((primitive): primitive is string => typeof primitive === "string")
    .map((primitive, index) => ({
      index,
      primitive,
      input: null,
      output: null,
      startedAt: "",
      durationMs: 0,
    }));
  return {
    id: typeof compact.trajectoryId === "string" ? compact.trajectoryId : "unknown",
    tenantId: "unknown",
    question: "",
    mode: "interpreted",
    calls,
    createdAt: "",
    ...(compact.phase === "plan" ||
    compact.phase === "execute" ||
    compact.phase === "run" ||
    compact.phase === "commit"
      ? { phase: compact.phase }
      : {}),
    ...(compact.answer !== undefined ? { answer: compact.answer } : {}),
    ...(compact.validation !== undefined
      ? { answerValidation: compact.validation }
      : {}),
  };
}

async function resolveTrajectory(
  arg: string | undefined,
  baseDir: string,
): Promise<TrajectoryRecord> {
  if (arg === undefined) {
    const workspaceLineage = await findWorkspaceLineage(process.cwd());
    if (workspaceLineage) return readTrajectoryFile(workspaceLineage);
    throw new Error(
      "graph: provide a trajectory id/path or run inside a datafetch workspace with result/lineage.json",
    );
  }

  const maybePath = path.resolve(arg);
  if (arg.endsWith(".json") || arg.includes("/") || arg.includes(path.sep)) {
    return readTrajectoryFile(maybePath);
  }
  return readTrajectory(arg, baseDir);
}

async function readTrajectoryFile(file: string): Promise<TrajectoryRecord> {
  const raw = await fsp.readFile(file, "utf8");
  return normalizeTrajectoryRecord(JSON.parse(raw));
}

async function findWorkspaceLineage(start: string): Promise<string | null> {
  let dir = start;
  while (true) {
    const workspaceConfig = path.join(dir, ".datafetch", "workspace.json");
    try {
      await fsp.access(workspaceConfig);
      const lineage = path.join(dir, "result", "lineage.json");
      await fsp.access(lineage);
      return lineage;
    } catch {
      // Keep walking upward until the filesystem root.
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function isTrajectoryRecord(value: unknown): value is TrajectoryRecord {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === "string" &&
    Array.isArray((value as { calls?: unknown }).calls)
  );
}
