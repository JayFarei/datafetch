import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import type { Cost, ResultMode } from "../sdk/result.js";

export type PrimitiveCallRecord = {
  index: number;
  primitive: string;
  input: unknown;
  output: unknown;
  startedAt: string;
  durationMs: number;
  // Optional execution nesting metadata. Calls made directly by the client
  // snippet have depth 0. Calls made while a df.lib.* function is executing
  // carry that function in callPath/parentPrimitive so diagnostics can split
  // client-visible calls from server-side implementation work.
  scope?: PrimitiveCallScope;
  // Optional content-addressable pin for the artefact this call resolved
  // against. Populated by the snippet runtime once content-addressing lands;
  // safe to leave unset in earlier phases.
  pin?: string;
};

export type PrimitiveCallScope = {
  depth: number;
  callPath: string[];
  parentPrimitive?: string;
  rootPrimitive?: string;
};

export type TrajectoryOperationKind =
  | "read"
  | "compute"
  | "tool"
  | "write"
  | "unknown";

export type TrajectoryOperationNode = {
  id: string;
  kind: TrajectoryOperationKind;
  primitive: string;
  label: string;
  callIndex?: number;
  scope?: PrimitiveCallScope;
};

export type TrajectoryOperationEdge = {
  from: string;
  to: string;
  kind: "sequence" | "scope";
};

export type TrajectoryOperationGraph = {
  version: 1;
  nodes: TrajectoryOperationNode[];
  edges: TrajectoryOperationEdge[];
  summary: {
    total: number;
    reads: number;
    computes: number;
    tools: number;
    writes: number;
    unknown: number;
    hasAnswerWrite: boolean;
    sourceHash?: string;
  };
};

// Per-trajectory provenance block. Intentionally a subset of the SDK
// `Provenance` type — the trajectory file lives next to the data and
// references the originating tenant + mount + (optional) function.
export type TrajectoryProvenance = {
  tenant: string;
  mount: string;
  functionName?: string;
};

export type TrajectoryPhase = "plan" | "execute" | "run" | "commit";

export type TrajectoryRecord = {
  id: string;
  tenantId: string;
  question: string;
  // Widened from the prototype's `"novel"`-only literal to the full
  // ResultMode union so trajectories can record interpreted / llm-backed
  // / cache hits as well. Per PRD §8.1: `novel` means "first-time
  // successful ad-hoc composition" (tier 4), NOT "errored". Errors are
  // signalled via the separate `errored` flag below.
  mode: ResultMode;
  calls: PrimitiveCallRecord[];
  result?: unknown;
  createdAt: string;
  // True when the snippet threw or no body executed. Disjoint from `mode`
  // so the observer can gate crystallisation on errors without conflating
  // them with the novel/interpreted distinction.
  errored?: boolean;
  // The fields below are optional in the envelope. They are populated
  // by the snippet runtime once a snippet completes; the legacy code
  // path leaves them undefined.
  cost?: Cost;
  provenance?: TrajectoryProvenance;
  phase?: TrajectoryPhase;
  crystallisable?: boolean;
  sourcePath?: string;
  artifactDir?: string;
  answer?: unknown;
  answerValidation?: unknown;
  // iter 3.1: immutable source snapshot — the post-prepareAnswerSourceForRuntime
  // source the snippet runtime actually executed, plus a sha-256 hash for
  // dedup and cache invalidation. Populated synchronously in
  // src/snippet/runtime.ts BEFORE onTrajectorySaved fires so every
  // substrate consumer (observer, author paths, replay validators) reads
  // authoritative metadata instead of doing a racy disk read against
  // <artifactDir>/source.ts. Strictly additive: pre-iter-3.1 callers that
  // don't set these get undefined, which is the legacy behaviour.
  sourceText?: string;
  sourceHash?: string;
};

export function datafetchHome(): string {
  return (
    process.env.DATAFETCH_HOME ??
    process.env.ATLASFS_HOME ??
    path.join(process.cwd(), ".datafetch")
  );
}

/** @deprecated Use datafetchHome(). Kept for older SDK consumers. */
export const atlasfsHome = datafetchHome;

export function trajectoryId(now = new Date()): string {
  return `traj_${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class TrajectoryRecorder {
  private readonly record: TrajectoryRecord;

  constructor(args: { tenantId: string; question: string; id?: string }) {
    this.record = {
      id: args.id ?? trajectoryId(),
      tenantId: args.tenantId,
      question: args.question,
      // Default to "interpreted" — the snippet runtime sets the final
      // mode (novel/interpreted/llm-backed) once the snippet completes.
      // Error paths are signalled via `errored: true`, not via mode.
      mode: "interpreted",
      calls: [],
      errored: false,
      createdAt: new Date().toISOString()
    };
  }

  get id(): string {
    return this.record.id;
  }

  get snapshot(): TrajectoryRecord {
    return structuredClone(this.record);
  }

  async call<TInput, TOutput>(
    primitive: string,
    input: TInput,
    fn: (input: TInput) => Promise<TOutput> | TOutput,
    scope?: PrimitiveCallScope
  ): Promise<TOutput> {
    const startedWall = Date.now();
    const startedHr = performance.now();
    const output = await fn(input);
    this.record.calls.push({
      index: this.record.calls.length,
      primitive,
      input,
      output,
      startedAt: new Date(startedWall).toISOString(),
      // Sub-millisecond resolution; the cost panel relies on fractional
      // ms to make the pure-TS hot path visible vs cold-path roundtrips.
      durationMs: performance.now() - startedHr,
      ...(scope ? { scope } : {})
    });
    return output;
  }

  setResult(result: unknown): void {
    this.record.result = result;
  }

  setAnswer(answer: unknown): void {
    this.record.answer = answer;
  }

  setAnswerValidation(validation: unknown): void {
    this.record.answerValidation = validation;
  }

  setMode(mode: ResultMode): void {
    this.record.mode = mode;
  }

  setErrored(errored: boolean): void {
    this.record.errored = errored;
  }

  setCost(cost: Cost): void {
    this.record.cost = cost;
  }

  setProvenance(provenance: TrajectoryProvenance): void {
    this.record.provenance = provenance;
  }

  setSourceSnapshot(source: string): void {
    this.record.sourceText = source;
    this.record.sourceHash = createHash("sha256").update(source).digest("hex");
  }

  setExecutionMetadata(metadata: {
    phase?: TrajectoryPhase;
    crystallisable?: boolean;
    sourcePath?: string;
    artifactDir?: string;
  }): void {
    if (metadata.phase !== undefined) this.record.phase = metadata.phase;
    if (metadata.crystallisable !== undefined) {
      this.record.crystallisable = metadata.crystallisable;
    }
    if (metadata.sourcePath !== undefined) {
      this.record.sourcePath = metadata.sourcePath;
    }
    if (metadata.artifactDir !== undefined) {
      this.record.artifactDir = metadata.artifactDir;
    }
  }

  async save(baseDir = datafetchHome()): Promise<string> {
    const dir = path.join(baseDir, "trajectories");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${this.record.id}.json`);
    await writeFile(file, `${JSON.stringify(this.record, null, 2)}\n`, "utf8");
    return file;
  }
}

export async function readTrajectory(idOrPath: string, baseDir = datafetchHome()): Promise<TrajectoryRecord> {
  const file = idOrPath.endsWith(".json")
    ? idOrPath
    : path.join(baseDir, "trajectories", `${idOrPath}.json`);
  return JSON.parse(await readFile(file, "utf8")) as TrajectoryRecord;
}

export function buildTrajectoryOperationGraph(
  trajectory: Pick<TrajectoryRecord, "calls" | "answer" | "sourceHash">,
): TrajectoryOperationGraph {
  const nodes: TrajectoryOperationNode[] = trajectory.calls.map((call) => ({
    id: `call:${call.index}`,
    kind: classifyPrimitive(call.primitive),
    primitive: call.primitive,
    label: call.primitive,
    callIndex: call.index,
    ...(call.scope ? { scope: call.scope } : {}),
  }));

  if (trajectory.answer !== undefined) {
    nodes.push({
      id: "answer",
      kind: "write",
      primitive: "df.answer",
      label: "df.answer",
    });
  }

  const edges: TrajectoryOperationEdge[] = [];
  for (let i = 1; i < nodes.length; i += 1) {
    edges.push({
      from: nodes[i - 1]!.id,
      to: nodes[i]!.id,
      kind: "sequence",
    });
  }

  for (const node of nodes) {
    if (node.scope?.parentPrimitive === undefined) continue;
    const parent = findNearestParentNode(nodes, node, node.scope.parentPrimitive);
    if (!parent || parent.id === node.id) continue;
    edges.push({
      from: parent.id,
      to: node.id,
      kind: "scope",
    });
  }

  return {
    version: 1,
    nodes,
    edges,
    summary: {
      total: nodes.length,
      reads: countKind(nodes, "read"),
      computes: countKind(nodes, "compute"),
      tools: countKind(nodes, "tool"),
      writes: countKind(nodes, "write"),
      unknown: countKind(nodes, "unknown"),
      hasAnswerWrite: nodes.some((node) => node.primitive === "df.answer"),
      ...(trajectory.sourceHash ? { sourceHash: trajectory.sourceHash } : {}),
    },
  };
}

function classifyPrimitive(primitive: string): TrajectoryOperationKind {
  if (primitive.startsWith("db.")) return "read";
  if (primitive.startsWith("lib.")) return "compute";
  if (primitive.startsWith("tool.")) return "tool";
  if (primitive === "df.answer" || primitive === "answer") return "write";
  return "unknown";
}

function findNearestParentNode(
  nodes: readonly TrajectoryOperationNode[],
  child: TrajectoryOperationNode,
  parentPrimitive: string,
): TrajectoryOperationNode | undefined {
  const candidates = nodes.filter(
    (node) =>
      node.id !== child.id &&
      node.primitive === parentPrimitive &&
      node.callIndex !== undefined,
  );
  if (candidates.length === 0) return undefined;
  if (child.callIndex === undefined) return candidates[0];
  // Nested calls made inside df.lib.* are recorded before the outer lib
  // boundary is appended, so the matching parent normally follows the child.
  return (
    candidates.find((node) => node.callIndex! > child.callIndex!) ??
    candidates.at(-1)
  );
}

function countKind(
  nodes: readonly TrajectoryOperationNode[],
  kind: TrajectoryOperationKind,
): number {
  return nodes.filter((node) => node.kind === kind).length;
}
