import { describe, expect, it } from "vitest";

import { generatePureSource } from "../../src/observer/author.js";
import type { CallTemplate } from "../../src/observer/template.js";
import type { TrajectoryRecord } from "../../src/trajectory/recorder.js";
// Phase-2 #3: the rangeTableMetric specialization now lives in src/eval and is
// registered on import. The byte-golden below must remain IDENTICAL to the
// pre-relocation snapshot — that is the proof the move was verbatim.
import "../harness/finchainSpecialization.js";

// Phase-2 #3 characterisation (safety net + feasibility proof).
//
// The finqacases/rangeTableMetric specialization is FinChain-specific code-gen
// woven through generatePureSource (renderSpecializedBody -> renderRangeTableMetricBody,
// specializeExternalParams, renderRangeTableCandidateRetrieval/caseCollectionIdent,
// callGraphDescription, skip-pruning). It had ZERO unit coverage. This test pins
// the CURRENT output for a synthetic-but-branch-covering rangeTableMetric template,
// so a later "move-don't-rewrite" relocation of the specialization into src/eval
// can be verified to leave the generated source unchanged. The code-gen is a pure
// (template, trajectory) -> string function, so this needs NO FinChain vendor.

// A rangeTableMetric template that exercises every specialization branch:
// db.finqacases retrieval + lib.inferTableMathPlan + lib.executeTableMath, with
// external params {query, limit} bound so pickExample harvests an example.
const template: CallTemplate = {
  name: "rangeTableMetric",
  topic: "filing_table_metric_range",
  shapeHash: "synthrtm0001",
  intentSignature: "source(synthrtm)",
  finalOutputBinding: "result",
  parameters: [
    { name: "query", jsType: "string" },
    { name: "limit", jsType: "number" },
  ],
  steps: [
    {
      primitive: "db.finqacases.findSimilar",
      outputName: "candidates",
      callShape: "positional-query-limit",
      trajectoryCallIndex: 0,
      inputBindings: {
        query: { kind: "param", param: "query" },
        limit: { kind: "param", param: "limit" },
      },
    },
    {
      primitive: "lib.inferTableMathPlan",
      outputName: "plan",
      callShape: "single-arg",
      trajectoryCallIndex: 1,
      inputBindings: {
        question: { kind: "param", param: "query" },
        filing: { kind: "ref", ref: "candidates" },
      },
    },
    {
      primitive: "lib.executeTableMath",
      outputName: "result",
      callShape: "single-arg",
      trajectoryCallIndex: 2,
      inputBindings: {
        filing: { kind: "ref", ref: "candidates" },
        plan: { kind: "ref", ref: "plan" },
      },
    },
  ],
};

const trajectory: TrajectoryRecord = {
  id: "traj_synth_rtm",
  tenantId: "synth-finchain",
  question: "What is the range of chemicals revenue between 2014 and 2018?",
  mode: "novel",
  createdAt: "2026-06-03T00:00:00.000Z",
  calls: [
    {
      index: 0,
      primitive: "db.finqacases.findSimilar",
      input: { query: "What is the range of chemicals revenue between 2014 and 2018?", limit: 5 },
      output: [{ id: "f1" }],
      startedAt: "2026-06-03T00:00:00.000Z",
      durationMs: 1,
    },
    {
      index: 1,
      primitive: "lib.inferTableMathPlan",
      input: { question: "What is the range of chemicals revenue between 2014 and 2018?", filing: { id: "f1" } },
      output: { years: [2014, 2018] },
      startedAt: "2026-06-03T00:00:00.000Z",
      durationMs: 1,
    },
    {
      index: 2,
      primitive: "lib.executeTableMath",
      input: { filing: { id: "f1" }, plan: { years: [2014, 2018] } },
      output: { answer: 700, roundedAnswer: 700, operation: "range" },
      startedAt: "2026-06-03T00:00:00.000Z",
      durationMs: 1,
    },
  ],
};

// Machine-specific file:// import URLs are normalised so the golden is portable.
function normalise(src: string): string {
  return src
    .replace(/from "file:\/\/[^"]*\/src\/sdk\/index\.ts"/, 'from "<SDK>"')
    .replace(/from "file:\/\/[^"]*valibot[^"]*"/, 'from "<VALIBOT>"')
    .replace(/import \* as v from "[^"]*"/, 'import * as v from "<VALIBOT>"');
}

describe("rangeTableMetric code-gen characterisation (Phase-2 #3 relocation safety net)", () => {
  const src = generatePureSource({ template, trajectory });

  it("produces source (the synthetic template flows through the specialization path)", () => {
    expect(src).not.toBeNull();
  });

  it("emits the rangeTableMetric specialized body (candidate-validation loop)", () => {
    const s = normalise(src ?? "");
    // renderRangeTableMetricBody markers:
    expect(s).toContain("const isNumericTableMathResult");
    expect(s).toContain("for (const candidate of candidates)");
    expect(s).toContain("await df.lib.inferTableMathPlan(");
    expect(s).toContain("await df.lib.executeTableMath(");
    // renderRangeTableCandidateRetrieval + caseCollectionIdent (the finqacases literal):
    expect(s).toContain("await df.db.finqacases.findSimilar(input.query, input.limit)");
  });

  it("specializes external params to {query, limit} and the rangeTableMetric intent", () => {
    const s = normalise(src ?? "");
    expect(s).toContain("export const rangeTableMetric = fn<");
    expect(s).toMatch(/type Input = \{ query: string; limit\??: number \}/);
    // callGraphDescription rangeTableMetric branch:
    expect(s).toContain("candidate validation loop");
  });

  // Byte-exact golden: a "move-don't-rewrite" relocation of the specialization
  // into src/eval (Phase-2 #3) must leave this normalised output identical.
  it("matches the byte-golden snapshot (relocation guard)", () => {
    expect(normalise(src ?? "")).toMatchSnapshot();
  });
});
