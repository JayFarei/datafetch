import { SnapshotMount, globMatches, numberAt, valueText } from "./mount.js";
import type { ContextNode, EventEntry, SpendGroup, TimeWindow, TraceSummary } from "./types.js";

const mount = new SnapshotMount();

export interface TraceScanParams {
  window?: TimeWindow;
  project?: string;
  model?: string;
  skill?: string;
  committed?: boolean;
}

export interface EventScanParams {
  types?: string[];
  window?: TimeWindow;
  traceId?: string;
}

export interface ContextNodesParams {
  traceId: string;
  stepIndex?: number;
}

export async function traceScan(params: TraceScanParams = {}): Promise<TraceSummary[]> {
  return mount.traceSummaries(params);
}

export async function eventScan(params: EventScanParams = {}): Promise<EventEntry[]> {
  const out: EventEntry[] = [];
  for await (const entry of mount.events(params)) out.push(entry);
  return out;
}

export async function contextNodes(params: ContextNodesParams): Promise<ContextNode[]> {
  return mount.contextNodes(params.traceId, params.stepIndex);
}

export async function spendBy(params: { groupBy: SpendGroup; window?: TimeWindow; project?: string; model?: string }) {
  const groups = new Map<string, {
    sessions: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  }>();
  for (const entry of await traceScan(params)) {
    const key = groupKey(entry, params.groupBy);
    const current = groups.get(key) ?? {
      sessions: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    const inputTokens = numberAt(entry.metrics.total_input_tokens);
    const outputTokens = numberAt(entry.metrics.total_output_tokens);
    const cacheReadTokens = numberAt(entry.metrics.total_cache_read_tokens);
    const cacheWriteTokens = numberAt(entry.metrics.total_cache_creation_tokens);
    current.sessions += 1;
    current.inputTokens += inputTokens;
    current.outputTokens += outputTokens;
    current.cacheReadTokens += cacheReadTokens;
    current.cacheWriteTokens += cacheWriteTokens;
    current.totalTokens += inputTokens + outputTokens;
    groups.set(key, current);
  }
  return [...groups.entries()]
    .map(([key, value]) => ({ [params.groupBy]: key, ...value }))
    .sort((a, b) => b.totalTokens - a.totalTokens);
}

export async function wasteTop(params: { n: number; window?: TimeWindow; project?: string; model?: string }) {
  return (await traceScan(params))
    .map((entry) => ({
      traceId: entry.traceId,
      sessionId: entry.sessionId,
      project: entry.project,
      model: entry.model,
      timestampStart: entry.timestampStart,
      wasteTokens: numberAt(entry.metrics.total_input_tokens) + numberAt(entry.metrics.total_cache_read_tokens),
      outputTokens: numberAt(entry.metrics.total_output_tokens),
      steps: entry.steps,
    }))
    .sort((a, b) => b.wasteTokens - a.wasteTokens)
    .slice(0, params.n);
}

export async function sessionsWhere(params: TraceScanParams & { cacheBelow?: number; maxSteps?: number } = {}) {
  return (await traceScan(params)).filter((entry) => {
    if (params.cacheBelow !== undefined) {
      const rate = metricNumberOrNull(entry.metrics.cache_hit_rate);
      if (rate === null || rate >= params.cacheBelow) return false;
    }
    if (params.maxSteps !== undefined && (entry.steps ?? Number.POSITIVE_INFINITY) > params.maxSteps) return false;
    return true;
  }).map((entry) => ({
    ...entry,
    capturedRun: entry.traceId,
    sessionId: entry.sessionId ?? entry.traceId,
    cacheHitRate: metricNumberOrNull(entry.metrics.cache_hit_rate),
  }));
}

export async function skillReport(params: { skill: string; window?: TimeWindow; project?: string; model?: string }) {
  const sessions = (await traceScan(params)).filter((entry) => entry.skills.includes(params.skill));
  const coInvoked = new Map<string, number>();
  for (const entry of sessions) {
    for (const skill of entry.skills) if (skill !== params.skill) coInvoked.set(skill, (coInvoked.get(skill) ?? 0) + 1);
  }
  return {
    skill: params.skill,
    sessions: sessions.length,
    committed: sessions.filter((entry) => entry.committed).length,
    totalTokens: sessions.reduce((sum, entry) => sum + tokenTotal(entry), 0),
    byProject: countsBy(sessions, (entry) => entry.project),
    byModel: countsBy(sessions, (entry) => entry.model ?? "unknown"),
    coInvoked: sortedCounts(coInvoked),
    examples: sessions.slice(0, 10).map((entry) => entry.traceId),
  };
}

export async function shareReport(params: { project?: string; window?: TimeWindow } = {}) {
  const sessions = await traceScan(params);
  return {
    sessions: sessions.length,
    shareable: sessions.filter((entry) => entry.syncable === true).length,
    notShareable: sessions.filter((entry) => entry.syncable !== true).length,
    privacyTiers: countsBy(sessions, (entry) => entry.privacyTier ?? "unknown"),
    examples: sessions.slice(0, 10).map((entry) => ({ traceId: entry.traceId, syncable: entry.syncable })),
  };
}

export async function syncBlockers(params: { project?: string; window?: TimeWindow } = {}) {
  const blocked = (await traceScan(params)).filter((entry) => entry.syncable !== true);
  const reasons = new Map<string, number>();
  for (const entry of blocked) {
    const reason = entry.privacyTier ? `privacy:${entry.privacyTier}` : "not-marked-shareable";
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  return {
    blocked: blocked.length,
    reasons: sortedCounts(reasons),
    examples: blocked.slice(0, 20).map((entry) => ({ traceId: entry.traceId, project: entry.project, privacyTier: entry.privacyTier })),
  };
}

export async function blame(params: { commitSha: string }) {
  const anchors = (await eventScan({ types: ["git_anchor_created"] })).filter((entry) => commitHex(entry) === params.commitSha);
  const traceIds = unique(anchors.map((entry) => entry.traceId).filter((item): item is string => !!item));
  const summaries = new Map((await traceScan()).map((entry) => [entry.traceId, entry]));
  const sessions = traceIds.map((traceId) => ({
    traceId,
    capturedRun: traceId,
    sessionId: summaries.get(traceId)?.sessionId ?? null,
  }));
  return {
    commitSha: params.commitSha,
    anchors: anchors.length,
    capturedRun: sessions[0]?.capturedRun ?? null,
    traceId: sessions[0]?.traceId ?? null,
    sessionId: sessions[0]?.sessionId ?? null,
    sessions,
    traces: traceIds,
    paths: unique(anchors.map((entry) => stringFromPayload(entry, "path")).filter((item): item is string => !!item)),
    evidence: anchors.slice(0, 20).map((entry) => ({ traceId: entry.traceId, stepIndex: entry.stepIndex, path: stringFromPayload(entry, "path") })),
  };
}

export async function fileEffort(params: { glob: string; window?: TimeWindow }) {
  const events = await eventScan({ types: ["git_anchor_created", "filesystem_mutation_observed"], window: params.window });
  const matched = events.filter((entry) => {
    const path = stringFromPayload(entry, "path");
    return path ? globMatches(params.glob, path) : false;
  });
  return {
    glob: params.glob,
    events: matched.length,
    traces: unique(matched.map((entry) => entry.traceId).filter((item): item is string => !!item)).length,
    byPath: countsBy(matched, (entry) => stringFromPayload(entry, "path") ?? "unknown").slice(0, 50),
  };
}

export async function patchSurvival(params: { window?: TimeWindow } = {}) {
  const events = await eventScan({ types: ["patch_survival_cached"], window: params.window });
  const states = new Map<string, number>();
  let totalRetention = 0;
  let retentionCount = 0;
  for (const entry of events) {
    const survival = payloadMap(entry, "survival");
    const state = String(survival.survival_state ?? "unknown");
    states.set(state, (states.get(state) ?? 0) + 1);
    if (typeof survival.retention_fraction === "number") {
      totalRetention += survival.retention_fraction;
      retentionCount += 1;
    }
  }
  return {
    observations: events.length,
    states: sortedCounts(states),
    meanRetention: retentionCount ? totalRetention / retentionCount : null,
    examples: events.slice(0, 20).map((entry) => payloadMap(entry, "survival").trace_patch_id).filter(Boolean),
  };
}

function groupKey(entry: TraceSummary, groupBy: SpendGroup): string {
  if (groupBy === "model") return entry.model ?? "unknown";
  if (groupBy === "project") return entry.project;
  return entry.timestampStart ? entry.timestampStart.slice(0, 10) : "unknown";
}

function tokenTotal(entry: TraceSummary): number {
  return numberAt(entry.metrics.total_input_tokens) + numberAt(entry.metrics.total_output_tokens);
}

function metricNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function countsBy<T>(items: T[], key: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return sortedCounts(counts);
}

function sortedCounts(counts: Map<string, number>) {
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function stringFromPayload(entry: EventEntry, key: string): string | null {
  const value = entry.payload[key];
  return typeof value === "string" ? value : null;
}

function payloadMap(entry: EventEntry, key: string): Record<string, unknown> {
  const value = entry.payload[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function commitHex(entry: EventEntry): string | null {
  const commit = payloadMap(entry, "commit_id");
  return typeof commit.hex === "string" ? commit.hex : valueText(entry.payload.observed_ref) || null;
}
