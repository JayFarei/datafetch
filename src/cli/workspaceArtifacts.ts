import { createHash } from "node:crypto";
import { promises as fsp } from "node:fs";
import path from "node:path";

import type { TrajectoryRecord } from "../sdk/index.js";

import {
  normalizeTrajectoryRecord,
  renderTrajectoryGraphText,
} from "./trajectoryGraph.js";
import { writeWorkspaceSnapshot } from "./workspaceSnapshot.js";

export type WorkspaceArtifactConfig = {
  tenantId: string;
  dataset: string;
  intent: string;
};

export type WorkspaceSnippetResponse = {
  stdout: string;
  stderr: string;
  exitCode: number;
  trajectoryId?: string;
  cost?: unknown;
  mode?: string;
  functionName?: string;
  callPrimitives?: string[];
  clientCallPrimitives?: string[];
  nestedCallPrimitives?: string[];
  nestedCalls?: Array<{
    primitive: string;
    parent: string;
    root: string;
    depth: number;
  }>;
  nestedByRoot?: Array<{ root: string; count: number }>;
  phase?: string;
  crystallisable?: boolean;
  artifactDir?: string;
  answer?: unknown;
  validation?: unknown;
};

export type WorkspaceHead = {
  version: 1;
  commit: string;
  trajectoryId?: string;
  intent: string;
  committedIntent?: unknown;
  tenantId: string;
  dataset: string;
  source: string;
  sourceSnapshotPath: string;
  sourceHash: string;
  updatedAt: string;
  answerPath: string;
  validationPath: string;
  lineagePath: string;
  graphPath: string;
  reportPath: string;
  observerDecisionLogPath: string;
  replayTestPath: string;
  replaySummaryPath: string;
  workspaceSnapshotPath: string;
};

const OBSERVER_DECISION_NOT_RECORDED = "not-recorded-in-workspace-response";
const CALLABILITY_AUTHORITY_HOOK_MANIFEST = "hook-manifest";

type WorkspaceLearningSummary = {
  phase: string | null;
  crystallisable: boolean;
  mode: string | null;
  functionName: string | null;
  eligible: boolean;
  observerDecision: typeof OBSERVER_DECISION_NOT_RECORDED;
  observerDecisionLogPath: string;
  callabilityAuthority: typeof CALLABILITY_AUTHORITY_HOOK_MANIFEST;
};

export function hashSourceText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function validationAccepted(value: unknown): boolean {
  return normalizeObject(value)?.["accepted"] === true;
}

export async function writeRunSnapshot(args: {
  dir: string;
  source: string;
  response: WorkspaceSnippetResponse;
}): Promise<void> {
  const { dir, source, response } = args;
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, "source.ts"), source, "utf8");
  await fsp.writeFile(
    path.join(dir, "result.json"),
    `${JSON.stringify(response, null, 2)}\n`,
    "utf8",
  );
  await fsp.writeFile(path.join(dir, "result.md"), renderRunMarkdown(response), "utf8");
  await writeLineageArtifacts(response, path.join(dir, "lineage.json"));
}

export async function writeCommitSnapshot(args: {
  root: string;
  dir: string;
  commitId: string;
  sourceLabel: string;
  sourceHash: string;
  source: string;
  response: WorkspaceSnippetResponse;
  workspace: WorkspaceArtifactConfig;
}): Promise<void> {
  const { root, dir, commitId, sourceLabel, sourceHash, source, response, workspace } = args;
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, "source.ts"), source, "utf8");
  await fsp.writeFile(
    path.join(dir, "answer.json"),
    `${JSON.stringify(response.answer ?? null, null, 2)}\n`,
    "utf8",
  );
  await fsp.writeFile(
    path.join(dir, "validation.json"),
    `${JSON.stringify(response.validation ?? null, null, 2)}\n`,
    "utf8",
  );
  await fsp.writeFile(path.join(dir, "answer.md"), renderAnswerMarkdown(response), "utf8");
  const lineage = await writeLineageArtifacts(response, path.join(dir, "lineage.json"));

  const replay = buildReplayTest({
    commitId,
    source: sourceLabel,
    sourceHash,
    response,
    workspace,
  });
  const testsDir = path.join(dir, "tests");
  await fsp.mkdir(testsDir, { recursive: true });
  await fsp.writeFile(
    path.join(testsDir, "replay.json"),
    `${JSON.stringify(replay, null, 2)}\n`,
    "utf8",
  );
  await fsp.writeFile(path.join(testsDir, "replay.txt"), renderReplaySummary(replay), "utf8");
  await writeWorkspaceSnapshot({
    root,
    targetDir: path.join(dir, "workspace"),
  });
  await fsp.writeFile(
    path.join(dir, "report.md"),
    renderCommitReport({
      commitId,
      source: sourceLabel,
      sourceHash,
      response,
      workspace,
      replay,
      graphText: lineage.graphText,
    }),
    "utf8",
  );
}

export function buildWorkspaceHead(args: {
  commitId: string;
  sourceLabel: string;
  sourceHash: string;
  response: WorkspaceSnippetResponse;
  workspace: WorkspaceArtifactConfig;
  updatedAt?: string;
}): WorkspaceHead {
  const committedIntent = answerIntent(args.response.answer);
  return {
    version: 1,
    commit: args.commitId,
    trajectoryId: args.response.trajectoryId,
    intent: args.workspace.intent,
    ...(committedIntent !== undefined ? { committedIntent } : {}),
    tenantId: args.workspace.tenantId,
    dataset: args.workspace.dataset,
    source: args.sourceLabel,
    sourceSnapshotPath: "source.ts",
    sourceHash: args.sourceHash,
    updatedAt: args.updatedAt ?? new Date().toISOString(),
    answerPath: "answer.json",
    validationPath: "validation.json",
    lineagePath: "lineage.json",
    graphPath: "graph.txt",
    reportPath: "report.md",
    observerDecisionLogPath: observerDecisionLogPath(args.workspace.tenantId),
    replayTestPath: path.join("tests", "replay.json"),
    replaySummaryPath: path.join("tests", "replay.txt"),
    workspaceSnapshotPath: path.join("workspace", "manifest.json"),
  };
}

async function writeLineageArtifacts(
  response: WorkspaceSnippetResponse,
  target: string,
): Promise<{ trajectory: TrajectoryRecord; graphText: string }> {
  const trajectory = await writeLineage(response, target);
  const graphText = renderTrajectoryGraphText(trajectory);
  await fsp.writeFile(
    path.join(path.dirname(target), "graph.txt"),
    graphText,
    "utf8",
  );
  return { trajectory, graphText };
}

async function writeLineage(
  response: WorkspaceSnippetResponse,
  target: string,
): Promise<TrajectoryRecord> {
  await fsp.mkdir(path.dirname(target), { recursive: true });
  if (response.artifactDir) {
    try {
      const raw = await fsp.readFile(
        path.join(response.artifactDir, "trajectory.json"),
        "utf8",
      );
      const trajectory = normalizeTrajectoryRecord(JSON.parse(raw));
      await fsp.writeFile(target, raw, "utf8");
      return trajectory;
    } catch {
      // Fall through to the compact response lineage.
    }
  }
  const lineage = {
    trajectoryId: response.trajectoryId,
    phase: response.phase,
    callPrimitives: response.callPrimitives ?? [],
    answer: response.answer,
    validation: response.validation,
  };
  await fsp.writeFile(target, `${JSON.stringify(lineage, null, 2)}\n`, "utf8");
  return normalizeTrajectoryRecord(lineage);
}

function buildReplayTest(args: {
  commitId: string;
  source: string;
  sourceHash: string;
  response: WorkspaceSnippetResponse;
  workspace: WorkspaceArtifactConfig;
}): Record<string, unknown> {
  const answer = normalizeObject(args.response.answer);
  const validation = normalizeObject(args.response.validation);
  const learning = buildLearningSummary(args.response, validation, args.workspace.tenantId);
  const committedIntent = answerIntent(args.response.answer);
  return {
    version: 1,
    kind: "workspace-head-replay",
    commit: args.commitId,
    trajectoryId: args.response.trajectoryId,
    tenantId: args.workspace.tenantId,
    dataset: args.workspace.dataset,
    intent: args.workspace.intent,
    ...(committedIntent !== undefined ? { committedIntent } : {}),
    source: args.source,
    sourceSnapshotPath: "source.ts",
    sourceHash: args.sourceHash,
    expected: {
      status: typeof answer?.["status"] === "string" ? answer["status"] : null,
      ...(committedIntent !== undefined ? { intent: committedIntent } : {}),
      ...(Object.prototype.hasOwnProperty.call(answer ?? {}, "value")
        ? { value: answer?.["value"] }
        : {}),
      ...(typeof answer?.["unit"] === "string" ? { unit: answer["unit"] } : {}),
      evidencePresent: evidencePresent(answer?.["evidence"]),
      derivationPresent: answer?.["derivation"] !== undefined,
      assumptionsPresent: answer?.["assumptions"] !== undefined,
      coverage: answer?.["coverage"] ?? null,
      missing: answer?.["missing"] ?? null,
    },
    validation: {
      accepted: validation?.["accepted"] === true,
      learnable: validation?.["learnable"] === true,
      blockers: Array.isArray(validation?.["blockers"])
        ? validation?.["blockers"]
        : [],
    },
    learning,
    lineage: {
      phase: args.response.phase,
      calls: args.response.callPrimitives ?? [],
      clientCalls: args.response.clientCallPrimitives ?? [],
      nestedCalls: args.response.nestedCalls ?? [],
      nestedByRoot: args.response.nestedByRoot ?? [],
      requiresDb: (args.response.callPrimitives ?? []).some((p) =>
        p.startsWith("db."),
      ),
      requiresLib: (args.response.callPrimitives ?? []).some((p) =>
        p.startsWith("lib."),
      ),
      clientRequiresDb: (args.response.clientCallPrimitives ?? []).some((p) =>
        p.startsWith("db."),
      ),
      clientRequiresLib: (args.response.clientCallPrimitives ?? []).some((p) =>
        p.startsWith("lib."),
      ),
    },
  };
}

function renderRunMarkdown(response: WorkspaceSnippetResponse): string {
  return [
    "# datafetch run",
    "",
    `exitCode: ${response.exitCode}`,
    `trajectoryId: ${response.trajectoryId ?? "none"}`,
    "",
    "```json",
    JSON.stringify(response, null, 2),
    "```",
    "",
  ].join("\n");
}

function renderAnswerMarkdown(response: WorkspaceSnippetResponse): string {
  const validation = response.validation as { accepted?: boolean; blockers?: string[] } | undefined;
  const lines = ["# datafetch committed answer", ""];
  if (validation) {
    lines.push(`accepted: ${validation.accepted === true ? "yes" : "no"}`);
    const blockers = validation.blockers ?? [];
    if (blockers.length > 0) {
      lines.push("");
      lines.push("blockers:");
      for (const blocker of blockers) lines.push(`- ${blocker}`);
    }
    lines.push("");
  }
  lines.push("```json");
  lines.push(JSON.stringify(response.answer ?? null, null, 2));
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

function renderReplaySummary(replay: Record<string, unknown>): string {
  const expected = normalizeObject(replay["expected"]);
  const validation = normalizeObject(replay["validation"]);
  const learning = normalizeObject(replay["learning"]);
  const lineage = normalizeObject(replay["lineage"]);
  const calls = Array.isArray(lineage?.["calls"])
    ? lineage["calls"].filter((call): call is string => typeof call === "string")
    : [];
  const blockers = Array.isArray(validation?.["blockers"])
    ? validation["blockers"].filter((blocker): blocker is string => typeof blocker === "string")
    : [];
  const lines = [
    "workspace replay",
    `kind: ${stringField(replay, "kind") ?? "unknown"}`,
    `commit: ${stringField(replay, "commit") ?? "unknown"}`,
    `trajectoryId: ${stringField(replay, "trajectoryId") ?? "unknown"}`,
    `tenant: ${stringField(replay, "tenantId") ?? "unknown"}`,
    `dataset: ${stringField(replay, "dataset") ?? "unknown"}`,
    `intent: ${stringField(replay, "intent") ?? "unknown"}`,
    `source: ${stringField(replay, "source") ?? "unknown"}`,
    `sourceSnapshot: ${stringField(replay, "sourceSnapshotPath") ?? "unknown"}`,
    `sourceHash: ${stringField(replay, "sourceHash") ?? "unknown"}`,
    "",
    "expected",
    `status: ${stringField(expected, "status") ?? "unknown"}`,
    `valuePresent: ${Object.prototype.hasOwnProperty.call(expected ?? {}, "value")}`,
    `evidencePresent: ${booleanField(expected, "evidencePresent")}`,
    `derivationPresent: ${booleanField(expected, "derivationPresent")}`,
    `assumptionsPresent: ${booleanField(expected, "assumptionsPresent")}`,
    "",
    "validation",
    `accepted: ${booleanField(validation, "accepted")}`,
    `learnable: ${booleanField(validation, "learnable")}`,
  ];
  if (blockers.length > 0) {
    lines.push("blockers:");
    for (const blocker of blockers) lines.push(`- ${blocker}`);
  }
  lines.push("");
  lines.push("learning");
  lines.push(`eligible: ${booleanField(learning, "eligible")}`);
  lines.push(`phase: ${stringField(learning, "phase") ?? "unknown"}`);
  lines.push(`crystallisable: ${booleanField(learning, "crystallisable")}`);
  lines.push(`mode: ${stringField(learning, "mode") ?? "unknown"}`);
  lines.push(`functionName: ${stringField(learning, "functionName") ?? "none"}`);
  lines.push(`observerDecision: ${stringField(learning, "observerDecision") ?? "unknown"}`);
  lines.push(
    `observerDecisionLog: ${stringField(learning, "observerDecisionLogPath") ?? "unknown"}`,
  );
  lines.push(`callabilityAuthority: ${stringField(learning, "callabilityAuthority") ?? "unknown"}`);
  lines.push("");
  lines.push("lineage");
  lines.push(`calls: ${calls.length === 0 ? "(none)" : calls.join(" -> ")}`);
  lines.push(`requiresDb: ${booleanField(lineage, "requiresDb")}`);
  lines.push(`requiresLib: ${booleanField(lineage, "requiresLib")}`);
  lines.push("");
  return lines.join("\n");
}

function renderCommitReport(args: {
  commitId: string;
  source: string;
  sourceHash: string;
  response: WorkspaceSnippetResponse;
  workspace: WorkspaceArtifactConfig;
  replay: Record<string, unknown>;
  graphText: string;
}): string {
  const answer = normalizeObject(args.response.answer);
  const validation = normalizeObject(args.response.validation);
  const learning = buildLearningSummary(args.response, validation, args.workspace.tenantId);
  const expected = normalizeObject(args.replay["expected"]);
  const blockers = Array.isArray(validation?.["blockers"])
    ? validation["blockers"].filter((blocker): blocker is string => typeof blocker === "string")
    : [];
  const lines = [
    "# datafetch workspace report",
    "",
    "This report is a derived filesystem view. The authoritative artifacts sit next to it.",
    "",
    "## HEAD",
    "",
    `commit: ${args.commitId}`,
    `trajectoryId: ${args.response.trajectoryId ?? "none"}`,
    `tenant: ${args.workspace.tenantId}`,
    `dataset: ${args.workspace.dataset}`,
    `intent: ${args.workspace.intent}`,
    `source: ${args.source}`,
    `sourceHash: ${args.sourceHash}`,
    "",
    "## Validation",
    "",
    `accepted: ${booleanField(validation, "accepted")}`,
    `learnable: ${booleanField(validation, "learnable")}`,
  ];
  if (blockers.length > 0) {
    lines.push("blockers:");
    for (const blocker of blockers) lines.push(`- ${blocker}`);
  }
  lines.push("");
  lines.push("## Answer");
  lines.push("");
  lines.push(`status: ${stringField(answer, "status") ?? "unknown"}`);
  lines.push(`valuePresent: ${Object.prototype.hasOwnProperty.call(answer ?? {}, "value")}`);
  lines.push(`evidencePresent: ${evidencePresent(answer?.["evidence"])}`);
  lines.push(`derivationPresent: ${answer?.["derivation"] !== undefined}`);
  lines.push(`assumptionsPresent: ${booleanField(expected, "assumptionsPresent")}`);
  lines.push("");
  lines.push("## Learning");
  lines.push("");
  lines.push(`eligible: ${learning.eligible}`);
  lines.push(`phase: ${learning.phase ?? "unknown"}`);
  lines.push(`crystallisable: ${learning.crystallisable}`);
  lines.push(`mode: ${learning.mode ?? "unknown"}`);
  lines.push(`functionName: ${learning.functionName ?? "none"}`);
  lines.push(`observerDecision: ${learning.observerDecision}`);
  lines.push(`observerDecisionLog: ${learning.observerDecisionLogPath}`);
  lines.push(`callabilityAuthority: ${learning.callabilityAuthority}`);
  lines.push("");
  lines.push("## Artifacts");
  lines.push("");
  lines.push("- `source.ts` — exact committed TypeScript source snapshot.");
  lines.push("- `answer.json` / `answer.md` — typed `df.answer(...)` envelope.");
  lines.push("- `validation.json` — answer validation and blockers.");
  lines.push("- `lineage.json` — persisted trajectory/call record.");
  lines.push("- `graph.txt` — readable read/compute/tool/write graph.");
  lines.push("- `tests/replay.json` / `tests/replay.txt` — replay contract and summary.");
  lines.push("- `workspace/manifest.json` — workspace snapshot manifest.");
  lines.push("");
  lines.push("## Graph");
  lines.push("");
  lines.push("```text");
  lines.push(args.graphText.trimEnd());
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

function normalizeObject(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function evidencePresent(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined;
}

function stringField(
  obj: Record<string, unknown> | null,
  key: string,
): string | undefined {
  const value = obj?.[key];
  return typeof value === "string" ? value : undefined;
}

function booleanField(
  obj: Record<string, unknown> | null,
  key: string,
): boolean {
  return obj?.[key] === true;
}

function buildLearningSummary(
  response: WorkspaceSnippetResponse,
  validation: Record<string, unknown> | null,
  tenantId: string,
): WorkspaceLearningSummary {
  return {
    phase: response.phase ?? null,
    crystallisable: response.crystallisable === true,
    mode: response.mode ?? null,
    functionName: response.functionName ?? null,
    eligible:
      validation?.["accepted"] === true &&
      validation?.["learnable"] === true &&
      response.crystallisable === true,
    observerDecision: OBSERVER_DECISION_NOT_RECORDED,
    observerDecisionLogPath: observerDecisionLogPath(tenantId),
    callabilityAuthority: CALLABILITY_AUTHORITY_HOOK_MANIFEST,
  };
}

function observerDecisionLogPath(tenantId: string): string {
  return `observer/${tenantId}/decisions.jsonl`;
}

function answerIntent(value: unknown): unknown | undefined {
  const answer = normalizeObject(value);
  if (!answer || answer["intent"] === undefined) return undefined;
  return answer["intent"];
}
