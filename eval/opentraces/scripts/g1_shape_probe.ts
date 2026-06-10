import { promises as fsp } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { makeMountRuntime, setMountRuntimeRegistry, InMemoryMountRuntimeRegistry } from "../../../src/adapter/runtime.js";
import { extractTemplate } from "../../../src/observer/template.js";
import { DiskSnippetRuntime } from "../../../src/snippet/runtime.js";
import type { TrajectoryRecord } from "../../../src/trajectory/recorder.js";
import { EvalRecordsMount, type EvalRecord } from "../../harness/evalRecords.js";

const ROOT = path.resolve("eval/opentraces");
const SNAPSHOT = path.join(ROOT, "vendor", "snapshot");
const TRACES_ROOT = path.join(SNAPSHOT, "objects", "traces", "v1");
const BATCHES_ROOT = path.join(SNAPSHOT, "events", "v1", "batches");
const PACK_PATH = path.join(ROOT, "questions", "pack.jsonl");
const RUN_ROOT = path.join(ROOT, "probes", "g1-runs");
const MAX_RECORDS_PER_SESSION = 5000;

type PackRow = {
  row_id: string;
  template_id: "P1-T1" | "P3-T2" | "P4-T1";
  question: string;
  params: Record<string, unknown>;
};

type ProbeSession = {
  id: string;
  family: PackRow["template_id"];
  draw: number;
  row: PackRow;
};

type ProbeTableRow = {
  session: string;
  family: string;
  params: Record<string, unknown>;
  recordCount: number;
  trajectoryPath: string;
  callCount: number;
  primitives: string[];
  intentSignature: string;
  shapeHash: string;
  llmCalls: number;
};

type BaseTraceRecord = {
  id: string;
  recordKey: string;
  entity: string;
  label: string;
  attributes: Record<string, string | number | boolean>;
};

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function addAttr(
  out: Record<string, string | number | boolean>,
  key: string,
  value: unknown,
): void {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    out[key] = value;
  }
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await fsp.readFile(file, "utf8")) as unknown;
}

async function findCurrentPointers(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name === "current.json") {
        out.push(full);
      }
    }
  }
  await walk(dir);
  out.sort();
  return out;
}

async function loadTraceRecords(): Promise<BaseTraceRecord[]> {
  const records: BaseTraceRecord[] = [];
  for (const currentPath of await findCurrentPointers(TRACES_ROOT)) {
    const pointer = await readJson(currentPath) as Record<string, unknown>;
    const objectPath = asString(pointer["object_path"]);
    if (!objectPath) continue;
    const envelope = await readJson(path.join(SNAPSHOT, objectPath)) as Record<string, unknown>;
    const record = (envelope["record"] ?? {}) as Record<string, unknown>;
    const metrics = (record["metrics"] ?? {}) as Record<string, unknown>;
    const agent = (record["agent"] ?? {}) as Record<string, unknown>;
    const outcome = (record["outcome"] ?? {}) as Record<string, unknown>;
    const security = (envelope["security"] ?? {}) as Record<string, unknown>;
    const traceId = asString(envelope["trace_id"], asString(record["trace_id"]));
    if (!traceId) continue;
    const sessionId = asString(record["session_id"]);
    const project = asString(envelope["project_slug"], asString(pointer["project_slug"], "<unknown>"));
    const startedAt = asString(record["timestamp_start"]);
    const day = startedAt.slice(0, 10) || "<unknown>";
    const model = asString(agent["model"], "<unknown>");
    const shareState = security["syncable"] === true ? "shareable" : "blocked";
    const attrs: Record<string, string | number | boolean> = {
      kind: "trace",
      trace_id: traceId,
      project,
      day,
      model,
      share_state: shareState,
      input_tokens: asNumber(metrics["total_input_tokens"]),
      output_tokens: asNumber(metrics["total_output_tokens"]),
      cache_read_tokens: asNumber(metrics["total_cache_read_tokens"]),
      cache_write_tokens: asNumber(metrics["total_cache_creation_tokens"]),
      total_steps: asNumber(metrics["total_steps"]),
      committed: outcome["committed"] === true,
    };
    addAttr(attrs, "session_id", sessionId);
    addAttr(attrs, "started_at", startedAt);
    addAttr(attrs, "safety_tier", security["privacy_tier"]);
    records.push({
      id: traceId,
      recordKey: `trace:${traceId}`,
      entity: traceId,
      label: `${project} ${sessionId || traceId}`,
      attributes: attrs,
    });
  }
  records.sort((left, right) => left.recordKey.localeCompare(right.recordKey));
  return records;
}

async function loadAnchorRecords(): Promise<EvalRecord[]> {
  const records: EvalRecord[] = [];
  const batches = (await fsp.readdir(BATCHES_ROOT))
    .filter((name) => name.endsWith(".jsonl.gz"))
    .sort();
  for (const batchName of batches) {
    const full = path.join(BATCHES_ROOT, batchName);
    const text = gunzipSync(await fsp.readFile(full)).toString("utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as Record<string, unknown>;
      if (event["event_type"] !== "git_anchor_created") continue;
      const payload = (event["payload"] ?? {}) as Record<string, unknown>;
      const commitId = (payload["commit_id"] ?? {}) as Record<string, unknown>;
      const commit = asString(commitId["hex"], asString(payload["observed_ref"]));
      const eventId = asString(event["event_id"]);
      const traceId = asString(event["trace_id"]);
      if (!commit || !eventId || !traceId) continue;
      const attrs: Record<string, string | number | boolean> = {
        kind: "anchor",
        commit,
        event_id: eventId,
        trace_id: traceId,
        event_sequence: asNumber(event["event_sequence"]),
        step_index: asNumber(event["step_index"], -1),
      };
      addAttr(attrs, "event_time", event["event_time"]);
      addAttr(attrs, "path", payload["path"]);
      addAttr(attrs, "evidence_tier", payload["evidence_tier"]);
      addAttr(attrs, "git_anchor_id", payload["git_anchor_id"]);
      records.push({
        id: eventId,
        recordKey: `anchor:${eventId}`,
        family: "P4-T1",
        entity: eventId,
        label: `${commit} ${traceId}`,
        attributes: attrs,
      });
    }
  }
  records.sort((left, right) => left.recordKey.localeCompare(right.recordKey));
  return records;
}

async function loadPackRows(): Promise<PackRow[]> {
  const rows: PackRow[] = [];
  const wanted = new Set(["P1-T1", "P3-T2", "P4-T1"]);
  for (const line of (await fsp.readFile(PACK_PATH, "utf8")).split("\n")) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as PackRow;
    if (wanted.has(row.template_id)) rows.push(row);
  }
  return rows;
}

function makeSessions(rows: PackRow[]): ProbeSession[] {
  const out: ProbeSession[] = [];
  for (const family of ["P1-T1", "P3-T2", "P4-T1"] as const) {
    const familyRows = rows.filter((row) => row.template_id === family).slice(0, 3);
    if (familyRows.length !== 3) {
      throw new Error(`expected 3 pack rows for ${family}, found ${familyRows.length}`);
    }
    familyRows.forEach((row, idx) => {
      out.push({
        id: `${family.toLowerCase().replace("-", "_")}_${String(idx + 1).padStart(2, "0")}`,
        family,
        draw: idx + 1,
        row,
      });
    });
  }
  return out;
}

function traceEvalRecord(base: BaseTraceRecord, family: string, sessionId: string): EvalRecord {
  return {
    id: base.id,
    recordKey: `${sessionId}:${base.recordKey}`,
    family,
    entity: base.entity,
    label: base.label,
    attributes: { ...base.attributes },
  };
}

function recordsForSession(
  session: ProbeSession,
  traces: BaseTraceRecord[],
  anchors: EvalRecord[],
): EvalRecord[] {
  if (session.family === "P4-T1") {
    const anchorTraceIds = new Set(
      anchors
        .map((record) => record.attributes["trace_id"])
        .filter((value): value is string => typeof value === "string"),
    );
    const traceRecords = traces
      .filter((trace) => anchorTraceIds.has(String(trace.attributes["trace_id"])))
      .map((trace) => traceEvalRecord(trace, session.family, session.id));
    return [...anchors, ...traceRecords];
  }
  return traces.map((trace) => traceEvalRecord(trace, session.family, session.id));
}

function p1Source(session: ProbeSession): string {
  return `// ${session.row.question}
const params = ${JSON.stringify(session.row.params, null, 2)};
const rows = await df.db.records.findExact({ family: "P1-T1" }, 5000);
const start = Date.parse(params.window.start);
const end = Date.parse(params.window.end);
const totals = new Map();
let matched = 0;
for (const row of rows) {
  const attrs = row.attributes;
  const started = Date.parse(attrs.started_at);
  if (!Number.isFinite(started) || started < start || started >= end) continue;
  const group = String(attrs[params.group_by] ?? "<unknown>");
  const current = totals.get(group) ?? {
    group,
    sessions: 0,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
  };
  current.sessions += 1;
  current.input_tokens += Number(attrs.input_tokens ?? 0);
  current.output_tokens += Number(attrs.output_tokens ?? 0);
  current.cache_read_tokens += Number(attrs.cache_read_tokens ?? 0);
  current.cache_write_tokens += Number(attrs.cache_write_tokens ?? 0);
  totals.set(group, current);
  matched += 1;
}
const groups = [...totals.values()].sort((left, right) => left.group.localeCompare(right.group));
return df.answer({
  status: "answered",
  value: { matched_sessions: matched, groups },
  evidence: { records_read: rows.length, group_by: params.group_by, window: params.window.label },
});
`;
}

function p3Source(session: ProbeSession): string {
  return `// ${session.row.question}
const params = ${JSON.stringify(session.row.params, null, 2)};
const rows = await df.db.records.search(params.project, { limit: 5000 });
const blocked = rows
  .filter((row) => row.attributes.project === params.project && row.attributes.share_state === "blocked")
  .map((row) => ({
    trace_id: row.attributes.trace_id,
    session_id: row.attributes.session_id ?? null,
    safety_tier: row.attributes.safety_tier ?? "<unknown>",
  }))
  .sort((left, right) => String(left.trace_id).localeCompare(String(right.trace_id)));
const tier_breakdown = {};
for (const row of blocked) {
  const tier = String(row.safety_tier);
  tier_breakdown[tier] = (tier_breakdown[tier] ?? 0) + 1;
}
return df.answer({
  status: "answered",
  value: { blocked_sessions: blocked, tier_breakdown },
  evidence: { records_read: rows.length, project: params.project },
});
`;
}

function p4Source(session: ProbeSession): string {
  return `// ${session.row.question}
const params = ${JSON.stringify(session.row.params, null, 2)};
const anchors = await df.db.records.findExact({ kind: "anchor", commit: params.commit }, 5000);
const traceRows = await df.db.records.findExact({ kind: "trace" }, 5000);
const traceIds = new Set(anchors.map((row) => row.attributes.trace_id));
const sessions = traceRows
  .filter((row) => traceIds.has(row.attributes.trace_id))
  .map((row) => ({
    trace_id: row.attributes.trace_id,
    session_id: row.attributes.session_id ?? null,
    project: row.attributes.project,
  }))
  .sort((left, right) => String(left.trace_id).localeCompare(String(right.trace_id)));
return df.answer({
  status: "answered",
  value: { commit: params.commit, matching_anchor_events: anchors.length, sessions },
  evidence: { anchor_records_read: anchors.length, trace_records_read: traceRows.length },
});
`;
}

function sourceForSession(session: ProbeSession): string {
  if (session.family === "P1-T1") return p1Source(session);
  if (session.family === "P3-T2") return p3Source(session);
  return p4Source(session);
}

async function runSession(
  session: ProbeSession,
  records: EvalRecord[],
): Promise<ProbeTableRow> {
  if (records.length > MAX_RECORDS_PER_SESSION) {
    throw new Error(`${session.id} record slice has ${records.length} records`);
  }

  const sessionDir = path.join(RUN_ROOT, session.id);
  const datafetchHome = path.join(sessionDir, "datafetch-home");
  await fsp.mkdir(sessionDir, { recursive: true });
  await fsp.mkdir(path.join(RUN_ROOT, "trajectories"), { recursive: true });

  const source = sourceForSession(session);
  const sourcePath = path.join(sessionDir, "source.ts");
  await fsp.writeFile(sourcePath, source, "utf8");
  await fsp.writeFile(
    path.join(sessionDir, "records-summary.json"),
    JSON.stringify({
      session: session.id,
      family: session.family,
      record_count: records.length,
      max_records_per_session: MAX_RECORDS_PER_SESSION,
      first_record_keys: records.slice(0, 10).map((record) => record.recordKey),
    }, null, 2) + "\n",
    "utf8",
  );

  const mountId = `${session.id}-records`;
  const adapter = new EvalRecordsMount(mountId, records);
  const registry = new InMemoryMountRuntimeRegistry();
  setMountRuntimeRegistry(registry);
  registry.register(
    mountId,
    makeMountRuntime({
      mountId,
      adapter,
      identMap: [{ ident: "records", name: "records" }],
    }),
  );

  const runtime = new DiskSnippetRuntime();
  const result = await runtime.run({
    source,
    sourcePath,
    sessionCtx: {
      sessionId: session.id,
      tenantId: "opentraces-g1",
      mountIds: [mountId],
      baseDir: datafetchHome,
      trajectoryId: `traj_g1_${session.id}`,
      snippetTimeoutMs: 30_000,
    },
  });
  await registry.closeAll();

  await fsp.writeFile(
    path.join(sessionDir, "run-result.json"),
    JSON.stringify({
      session: session.id,
      family: session.family,
      row_id: session.row.row_id,
      params: session.row.params,
      record_count: records.length,
      execution_path: "DiskSnippetRuntime + EvalRecordsMount",
      fallback_used: false,
      exitCode: result.exitCode,
      trajectoryId: result.trajectoryId,
      cost: result.cost,
      stdout: result.stdout,
      stderr: result.stderr,
    }, null, 2) + "\n",
    "utf8",
  );

  if (result.exitCode !== 0 || !result.trajectoryId) {
    throw new Error(`${session.id} runtime failed: ${result.stderr}`);
  }

  const savedPath = path.join(datafetchHome, "trajectories", `${result.trajectoryId}.json`);
  const trajectory = JSON.parse(await fsp.readFile(savedPath, "utf8")) as TrajectoryRecord;
  const llmCalls = trajectory.cost?.llmCalls ?? 0;
  if (llmCalls !== 0) {
    throw new Error(`${session.id} recorded ${llmCalls} LLM calls`);
  }

  const template = extractTemplate(trajectory);
  const relativeTrajectoryPath = path.join(session.id, "trajectory.json");
  await fsp.writeFile(
    path.join(sessionDir, "trajectory.json"),
    JSON.stringify(trajectory, null, 2) + "\n",
    "utf8",
  );
  await fsp.writeFile(
    path.join(RUN_ROOT, "trajectories", `${session.id}.json`),
    JSON.stringify(trajectory, null, 2) + "\n",
    "utf8",
  );

  return {
    session: session.id,
    family: session.family,
    params: session.row.params,
    recordCount: records.length,
    trajectoryPath: relativeTrajectoryPath,
    callCount: trajectory.calls.length,
    primitives: trajectory.calls.map((call) => call.primitive),
    intentSignature: template.intentSignature,
    shapeHash: template.shapeHash,
    llmCalls,
  };
}

function computeChecks(rows: ProbeTableRow[]) {
  const clusters = new Map<string, Set<string>>();
  const byFamily = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!clusters.has(row.intentSignature)) clusters.set(row.intentSignature, new Set());
    clusters.get(row.intentSignature)!.add(row.family);
    if (!byFamily.has(row.family)) byFamily.set(row.family, new Set());
    byFamily.get(row.family)!.add(row.intentSignature);
  }
  const clusterRows = [...clusters.entries()]
    .map(([signature, families]) => ({
      signature,
      families: [...families].sort(),
      family_bounded: families.size === 1,
    }))
    .sort((left, right) => left.signature.localeCompare(right.signature));
  const familyRows = [...byFamily.entries()]
    .map(([family, signatures]) => ({
      family,
      signatures: [...signatures].sort(),
      stable: signatures.size === 1,
      all_unique_within_family: signatures.size === 3,
    }))
    .sort((left, right) => left.family.localeCompare(right.family));
  const familyBoundedClusterCount = clusterRows.filter((row) => row.family_bounded).length;
  const stableFamilyCount = familyRows.filter((row) => row.stable).length;
  const allUniqueFamilies = familyRows
    .filter((row) => row.all_unique_within_family)
    .map((row) => row.family);
  return {
    clusters: clusterRows,
    by_family: familyRows,
    distinct_intent_signature_count: clusters.size,
    family_bounded_cluster_count: familyBoundedClusterCount,
    separation_pass: clusters.size >= 2 && familyBoundedClusterCount >= 2,
    stable_family_count: stableFamilyCount,
    stability_pass: stableFamilyCount >= 2,
    all_9_collapse_to_one_signature: clusters.size === 1,
    all_unique_within_family_count: allUniqueFamilies.length,
    all_unique_within_families: allUniqueFamilies,
    explicit_fail_condition_triggered:
      clusters.size === 1 || allUniqueFamilies.length >= 2,
  };
}

function formatParams(params: Record<string, unknown>): string {
  return JSON.stringify(params);
}

function tableMarkdown(rows: ProbeTableRow[]): string {
  const lines = [
    "| session | family | params | records | calls | intent signature | shape hash |",
    "|---|---|---|---:|---:|---|---|",
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.session} | ${row.family} | \`${formatParams(row.params)}\` | ${row.recordCount} | ${row.callCount} | \`${row.intentSignature}\` | \`${row.shapeHash}\` |`,
    );
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  process.env["DATAFETCH_INTERFACE_MODE"] = process.env["DATAFETCH_INTERFACE_MODE"] ?? "legacy";
  process.env["DATAFETCH_HOME"] = RUN_ROOT;
  process.env["ATLASFS_HOME"] = RUN_ROOT;

  await fsp.mkdir(RUN_ROOT, { recursive: true });
  const [packRows, traceRecords, anchorRecords] = await Promise.all([
    loadPackRows(),
    loadTraceRecords(),
    loadAnchorRecords(),
  ]);
  const sessions = makeSessions(packRows);
  const rows: ProbeTableRow[] = [];
  for (const session of sessions) {
    const records = recordsForSession(session, traceRecords, anchorRecords);
    rows.push(await runSession(session, records));
  }
  rows.sort((left, right) => left.session.localeCompare(right.session));
  const checks = computeChecks(rows);
  const summary = {
    generated_at: new Date().toISOString(),
    protocol: {
      execution_path: "real snippet runtime over EvalRecordsMount",
      fallback_used: false,
      llm_calls_total: rows.reduce((sum, row) => sum + row.llmCalls, 0),
      max_records_per_session: MAX_RECORDS_PER_SESSION,
      snapshot_root: "eval/opentraces/vendor/snapshot",
    },
    table: rows,
    checks,
    markdown_table: tableMarkdown(rows),
  };
  await fsp.writeFile(
    path.join(RUN_ROOT, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
    "utf8",
  );
  await fsp.writeFile(
    path.join(RUN_ROOT, "signature-table.md"),
    `${tableMarkdown(rows)}\n`,
    "utf8",
  );
  process.stdout.write(JSON.stringify(summary, null, 2));
  process.stdout.write("\n");
}

main().catch((error) => {
  process.stderr.write(error instanceof Error && error.stack ? error.stack : String(error));
  process.stderr.write("\n");
  process.exit(1);
});
