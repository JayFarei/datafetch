import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildTrajectoryOperationGraph,
  readTrajectory,
  TrajectoryRecorder,
} from "./recorder.js";
import { renderTrajectoryGraphText } from "../cli/trajectoryGraph.js";

async function main(): Promise<void> {
  const recorder = new TrajectoryRecorder({
    tenantId: "smoke-tenant",
    question: "exercise operation graph",
    id: "traj_operation_graph_smoke",
  });

  recorder.setSourceSnapshot("return df.answer({ status: 'answered', value: 42 });");
  await recorder.call("db.records.findExact", { filter: { id: 1 }, limit: 1 }, async () => [
    { id: 1, value: 21 },
  ]);
  await recorder.call(
    "lib.doubleValue",
    { value: 21 },
    async () => 42,
    { depth: 0, callPath: ["lib.doubleValue"] },
  );
  await recorder.call(
    "tool.math.audit",
    { value: 42 },
    async () => ({ ok: true }),
    {
      depth: 1,
      callPath: ["lib.doubleValue", "tool.math.audit"],
      parentPrimitive: "lib.doubleValue",
    },
  );
  recorder.setAnswer({ status: "answered", value: 42 });

  const snapshot = recorder.snapshot;
  assert.equal("operationGraph" in snapshot, false);
  const graph = buildTrajectoryOperationGraph(snapshot);
  assert.equal(graph.version, 1);
  assert.deepEqual(
    graph.nodes.map((node) => [node.id, node.kind, node.primitive]),
    [
      ["call:0", "read", "db.records.findExact"],
      ["call:1", "compute", "lib.doubleValue"],
      ["call:2", "tool", "tool.math.audit"],
      ["answer", "write", "df.answer"],
    ],
  );
  assert.equal(graph.summary.reads, 1);
  assert.equal(graph.summary.computes, 1);
  assert.equal(graph.summary.tools, 1);
  assert.equal(graph.summary.writes, 1);
  assert.equal(graph.summary.hasAnswerWrite, true);
  assert.ok(
    graph.edges.some(
      (edge) => edge.kind === "scope" && edge.from === "call:1" && edge.to === "call:2",
    ),
    "expected scoped tool call to point at its parent lib call",
  );

  const explicit = buildTrajectoryOperationGraph(snapshot);
  assert.deepEqual(explicit.summary, graph.summary);

  const duplicateParentGraph = buildTrajectoryOperationGraph({
    sourceHash: "duplicate-parent-smoke",
    answer: undefined,
    calls: [
      {
        index: 0,
        primitive: "tool.math.audit",
        input: {},
        output: {},
        startedAt: new Date().toISOString(),
        durationMs: 1,
        scope: {
          depth: 1,
          callPath: ["lib.repeat", "tool.math.audit"],
          parentPrimitive: "lib.repeat",
        },
      },
      {
        index: 1,
        primitive: "lib.repeat",
        input: {},
        output: {},
        startedAt: new Date().toISOString(),
        durationMs: 1,
      },
      {
        index: 2,
        primitive: "tool.math.audit",
        input: {},
        output: {},
        startedAt: new Date().toISOString(),
        durationMs: 1,
        scope: {
          depth: 1,
          callPath: ["lib.repeat", "tool.math.audit"],
          parentPrimitive: "lib.repeat",
        },
      },
      {
        index: 3,
        primitive: "tool.math.auditExtra",
        input: {},
        output: {},
        startedAt: new Date().toISOString(),
        durationMs: 1,
        scope: {
          depth: 1,
          callPath: ["lib.repeat", "tool.math.auditExtra"],
          parentPrimitive: "lib.repeat",
        },
      },
      {
        index: 4,
        primitive: "lib.repeat",
        input: {},
        output: {},
        startedAt: new Date().toISOString(),
        durationMs: 1,
      },
    ],
  });
  assert.ok(
    duplicateParentGraph.edges.some(
      (edge) => edge.kind === "scope" && edge.from === "call:1" && edge.to === "call:0",
    ),
    "first repeated scoped call should link to nearest parent",
  );
  assert.ok(
    duplicateParentGraph.edges.some(
      (edge) => edge.kind === "scope" && edge.from === "call:4" && edge.to === "call:2",
    ),
    "second repeated scoped call should link to nearest parent",
  );
  assert.ok(
    duplicateParentGraph.edges.some(
      (edge) => edge.kind === "scope" && edge.from === "call:4" && edge.to === "call:3",
    ),
    "multiple scoped calls should link to the following parent boundary",
  );

  const dir = await mkdtemp(path.join(os.tmpdir(), "df-trajectory-graph-"));
  try {
    await recorder.save(dir);
    const saved = await readTrajectory("traj_operation_graph_smoke", dir);
    assert.equal("operationGraph" in saved, false);
    const savedGraph = buildTrajectoryOperationGraph(saved);
    assert.equal(savedGraph.summary.hasAnswerWrite, true);
    assert.equal(savedGraph.nodes.at(-1)?.primitive, "df.answer");
    const rendered = renderTrajectoryGraphText(saved);
    assert.match(rendered, /^trajectory traj_operation_graph_smoke/m);
    assert.match(rendered, /summary reads=1 computes=1 tools=1 writes=1 unknown=0/);
    assert.match(rendered, /call:2 #2 tool tool\.math\.audit/);
    assert.match(rendered, /answer write df\.answer/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  console.log("[smoke/trajectory] operation graph OK");
}

main().catch((err) => {
  console.error("[smoke/trajectory] FAILED", err);
  process.exit(1);
});
