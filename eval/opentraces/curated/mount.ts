import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";

import type { ContextNode, EventEntry, JsonMap, TimeWindow, TraceEntry, TraceSummary } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
export const defaultSnapshotRoot = resolve(here, "..", "vendor", "snapshot");

export class SnapshotMount {
  private readonly root: string;
  private traceCache: Promise<TraceEntry[]> | null = null;

  constructor(root: string = defaultSnapshotRoot) {
    this.root = resolve(root);
  }

  async traces(): Promise<TraceEntry[]> {
    this.traceCache ??= this.loadTraces();
    return this.traceCache;
  }

  async traceSummaries(filter: TraceFilter = {}): Promise<TraceSummary[]> {
    const entries = await this.traces();
    return entries.map(toSummary).filter((entry) => traceMatches(entry, filter));
  }

  async *events(filter: EventFilter = {}): AsyncGenerator<EventEntry> {
    const dir = join(this.root, "events", "v1", "batches");
    for (const file of await listFiles(dir, ".jsonl.gz")) {
      const stream = createReadStream(file).pipe(createGunzip());
      const lines = createInterface({ input: stream, crlfDelay: Infinity });
      for await (const line of lines) {
        if (!line.trim()) continue;
        const raw = JSON.parse(line) as JsonMap;
        const entry = toEvent(raw);
        if (eventMatches(entry, filter)) yield entry;
      }
    }
  }

  async contextNodes(traceId: string, stepIndex?: number): Promise<ContextNode[]> {
    const entry = (await this.traces()).find((candidate) => candidate.traceId === traceId);
    if (!entry) return [];
    const file = join(this.root, "contexts", "v1", entry.project, traceId, "nodes.jsonl");
    if (!(await exists(file))) return [];
    const out: ContextNode[] = [];
    for (const line of (await readFile(file, "utf8")).split("\n")) {
      if (!line.trim()) continue;
      const raw = JSON.parse(line) as JsonMap;
      const node = toContextNode(raw);
      if (stepIndex === undefined || node.stepIndex === stepIndex) out.push(node);
    }
    return out;
  }

  private async loadTraces(): Promise<TraceEntry[]> {
    const pointerRoot = join(this.root, "objects", "traces", "v1");
    const pointers = await listFiles(pointerRoot, "current.json");
    const out: TraceEntry[] = [];
    for (const pointerFile of pointers) {
      const pointer = JSON.parse(await readFile(pointerFile, "utf8")) as JsonMap;
      const objectPath = String(pointer.object_path ?? "");
      const bodyPath = resolve(this.root, ...objectPath.split("/"));
      if (!inside(this.root, bodyPath)) throw new Error(`Pointer escapes snapshot: ${pointerFile}`);
      const body = JSON.parse(await readFile(bodyPath, "utf8")) as JsonMap;
      const record = asMap(body.record);
      out.push({
        traceId: String(body.trace_id ?? record.trace_id ?? pointer.trace_id ?? ""),
        project: String(body.project_slug ?? pointer.project_slug ?? ""),
        body,
        record,
      });
    }
    return out.sort((a, b) => a.traceId.localeCompare(b.traceId));
  }
}

export interface TraceFilter {
  window?: TimeWindow;
  project?: string;
  model?: string;
  skill?: string;
  committed?: boolean;
}

export interface EventFilter {
  types?: string[];
  window?: TimeWindow;
  traceId?: string;
}

export function numberAt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function globMatches(pattern: string, value: string): boolean {
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${source}$`).test(value);
}

export function valueText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function toSummary(entry: TraceEntry): TraceSummary {
  const record = entry.record;
  const agent = asMap(record.agent);
  const outcome = asMap(record.outcome);
  const metrics = asMap(record.metrics);
  const security = asMap(entry.body.security);
  return {
    traceId: entry.traceId,
    sessionId: stringOrNull(record.session_id),
    project: entry.project,
    model: stringOrNull(agent.model),
    timestampStart: stringOrNull(record.timestamp_start),
    committed: typeof outcome.committed === "boolean" ? outcome.committed : null,
    syncable: typeof security.syncable === "boolean" ? security.syncable : null,
    privacyTier: stringOrNull(security.privacy_tier),
    metrics,
    skills: skillNames(record),
    steps: typeof metrics.total_steps === "number" ? metrics.total_steps : null,
  };
}

function toEvent(raw: JsonMap): EventEntry {
  return {
    eventType: stringOrNull(raw.event_type),
    eventTime: stringOrNull(raw.event_time),
    traceId: stringOrNull(raw.trace_id),
    stepIndex: typeof raw.step_index === "number" ? raw.step_index : null,
    payload: asMap(raw.payload),
    raw,
  };
}

function toContextNode(raw: JsonMap): ContextNode {
  return {
    traceId: stringOrNull(raw.trace_id),
    stepIndex: typeof raw.step_index === "number" ? raw.step_index : null,
    nodeId: stringOrNull(raw.node_id),
    branchType: stringOrNull(raw.branch_type),
    parentNodeId: stringOrNull(raw.parent_node_id),
    raw,
  };
}

function traceMatches(entry: TraceSummary, filter: TraceFilter): boolean {
  if (filter.project && entry.project !== filter.project) return false;
  if (filter.model && entry.model !== filter.model) return false;
  if (filter.skill && !entry.skills.includes(filter.skill)) return false;
  if (filter.committed !== undefined && entry.committed !== filter.committed) return false;
  return inWindow(entry.timestampStart, filter.window);
}

function eventMatches(entry: EventEntry, filter: EventFilter): boolean {
  if (filter.types && (!entry.eventType || !filter.types.includes(entry.eventType))) return false;
  if (filter.traceId && entry.traceId !== filter.traceId) return false;
  return inWindow(entry.eventTime, filter.window);
}

function inWindow(value: string | null, window?: TimeWindow): boolean {
  if (!window || (!window.start && !window.end)) return true;
  if (!value) return false;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return false;
  if (window.start && time < Date.parse(window.start)) return false;
  if (window.end && time >= Date.parse(window.end)) return false;
  return true;
}

function skillNames(record: JsonMap): string[] {
  const metadata = asMap(record.metadata);
  const values = Array.isArray(metadata.skill_invocations) ? metadata.skill_invocations : [];
  return values.map((item) => stringOrNull(asMap(item).skill_name)).filter((item): item is string => !!item);
}

function asMap(value: unknown): JsonMap {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonMap) : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function listFiles(dir: string, suffix: string): Promise<string[]> {
  const out: string[] = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, item.name);
    if (item.isDirectory()) out.push(...(await listFiles(full, suffix)));
    else if (item.isFile() && item.name.endsWith(suffix)) out.push(full);
  }
  return out.sort();
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function inside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep));
}
