import { describe, expect, it } from "vitest";

import {
  scoreCragRow,
  scoreCragRows,
  cragMetrics,
  type CragResultRow,
} from "../harness/cragGrader.js";
import {
  loadCragRows,
  resolveCragJsonlPath,
  deriveAnswerType,
} from "../harness/cragCorpus.js";

// C4 live-prep, increment 1: the CRAG tri-state grader (ported) + the corpus
// loader/ETL. The grader is corpus-independent (always tested); the loader test
// runs against the in-env CRAG jsonl and SKIPS gracefully when it is absent
// (like the finchain smoke), so the suite stays green everywhere.

const row = (over: Partial<CragResultRow>): CragResultRow => ({
  interaction_id: "x",
  question_type: "simple",
  answer_type: "valid",
  gold: "",
  predicted: null,
  ...over,
});

describe("CRAG tri-state grader (governance endpoint metric)", () => {
  it("scores valid questions: exact / substring / numeric ±1% = accurate", () => {
    expect(scoreCragRow(row({ gold: "microsoft", predicted: "Microsoft" }))).toBe("accurate");
    expect(scoreCragRow(row({ gold: "microsoft", predicted: "the answer is Microsoft." }))).toBe("accurate");
    // numeric ±1% match (clean single-number gold; exercises numericMatch).
    expect(scoreCragRow(row({ gold: "1000000", predicted: "about 1,000,005 total" }))).toBe("accurate");
    expect(scoreCragRow(row({ gold: "microsoft", predicted: "apple" }))).toBe("incorrect");
  });

  it("abstention is MISSING (0), never accurate; confident-wrong is INCORRECT (-1)", () => {
    expect(scoreCragRow(row({ gold: "microsoft", predicted: "" }))).toBe("missing");
    expect(scoreCragRow(row({ gold: "microsoft", predicted: "I don't know" }))).toBe("missing");
    expect(scoreCragRow(row({ gold: "microsoft", predicted: "definitely apple" }))).toBe("incorrect");
  });

  it("false-premise (answer_type=invalid): 'invalid question' accurate, wrong substantive incorrect, abstain missing", () => {
    const fp = (predicted: string | null) =>
      scoreCragRow(row({ answer_type: "invalid", gold: "invalid question", question_type: "false_premise", predicted }));
    expect(fp("invalid question")).toBe("accurate"); // GOVERNED decline wins here
    expect(fp("the answer is 42")).toBe("incorrect"); // UNGOVERNED confident-wrong loses
    expect(fp("")).toBe("missing");
  });

  it("a confident 'invalid question' on a VALID question is a hallucination (incorrect)", () => {
    expect(scoreCragRow(row({ gold: "microsoft", predicted: "this is an invalid question" }))).toBe("incorrect");
  });

  it("Truthfulness = Accuracy - Hallucination; abstention raises truthfulness over confident-wrong", () => {
    // The governance story in one assertion: on 2 false-premise cells, the
    // ABSTAINING arm (2 missing) beats the CONFIDENT-WRONG arm (2 incorrect).
    const governed = scoreCragRows([
      row({ answer_type: "invalid", gold: "invalid question", predicted: "invalid question" }),
      row({ answer_type: "invalid", gold: "invalid question", predicted: "" }),
    ]);
    const ungoverned = scoreCragRows([
      row({ answer_type: "invalid", gold: "invalid question", predicted: "stale answer A" }),
      row({ answer_type: "invalid", gold: "invalid question", predicted: "stale answer B" }),
    ]);
    expect(governed.overall.truthfulnessPct).toBeGreaterThan(ungoverned.overall.truthfulnessPct);
    // ungoverned confidently-wrong is penalised below zero (hallucination).
    expect(ungoverned.overall.truthfulnessPct).toBeLessThan(0);
    expect(cragMetrics({ total: 4, accurate: 2, missing: 0, incorrect: 2 }).truthfulnessPct).toBe(0);
  });
});

describe("CRAG corpus loader + answer_type ETL", () => {
  it("derives answer_type from question_type/gold (the ETL)", () => {
    expect(deriveAnswerType("false_premise", "invalid question")).toBe("invalid");
    expect(deriveAnswerType("simple", "invalid question")).toBe("invalid");
    expect(deriveAnswerType("simple", "I don't know")).toBe("no_answer");
    expect(deriveAnswerType("simple", "microsoft")).toBe("valid");
  });

  const CRAG_PATH = resolveCragJsonlPath();

  it.skipIf(!CRAG_PATH)("loads real in-env rows with derived answer_type (streamed, limited)", async () => {
    const rows = await loadCragRows({ limit: 60 });
    expect(rows.length).toBe(60);
    for (const r of rows) {
      expect(typeof r.query).toBe("string");
      expect(r.query.length).toBeGreaterThan(0);
      expect(["invalid", "no_answer", "valid"]).toContain(r.answerType);
      // every false_premise row got answer_type 'invalid' via the ETL
      if (r.questionType === "false_premise") expect(r.answerType).toBe("invalid");
    }
  });

  it.skipIf(!CRAG_PATH)("filters by drift class (static_or_dynamic) for the C4 drift slice", async () => {
    const drifting = await loadCragRows({
      staticOrDynamic: ["fast-changing", "real-time"],
      limit: 8,
      maxScan: 20000,
    });
    // The corpus has ~620 fast-changing+real-time rows; a bounded scan finds some.
    for (const r of drifting) {
      expect(["fast-changing", "real-time"]).toContain(r.staticOrDynamic);
    }
  });
});
