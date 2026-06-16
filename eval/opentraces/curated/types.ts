export type JsonMap = Record<string, unknown>;

export interface TimeWindow {
  start?: string;
  end?: string;
}

export type SpendGroup = "model" | "project" | "day";

export interface TraceEntry {
  traceId: string;
  project: string;
  body: JsonMap;
  record: JsonMap;
}

export interface TraceSummary {
  traceId: string;
  sessionId: string | null;
  project: string;
  model: string | null;
  timestampStart: string | null;
  committed: boolean | null;
  syncable: boolean | null;
  privacyTier: string | null;
  metrics: JsonMap;
  skills: string[];
  steps: number | null;
}

export interface EventEntry {
  eventType: string | null;
  eventTime: string | null;
  traceId: string | null;
  stepIndex: number | null;
  payload: JsonMap;
  raw: JsonMap;
}

export interface ContextNode {
  traceId: string | null;
  stepIndex: number | null;
  nodeId: string | null;
  branchType: string | null;
  parentNodeId: string | null;
  raw: JsonMap;
}
