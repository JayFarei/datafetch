import { describe, expect, it } from "vitest";

import { makeAbstain, validateAnswer } from "../../src/ladder/answerContract.js";

describe("typed answer contract (V1 / defeater D9)", () => {
  it("accepts a well-formed count answer", () => {
    expect(validateAnswer({ kind: "count", value: 8 }).ok).toBe(true);
  });

  it("accepts a well-formed list answer of structured records", () => {
    expect(validateAnswer({ kind: "list", items: [{ topic: "billing" }] }).ok).toBe(true);
    expect(validateAnswer({ kind: "list", items: [] }).ok).toBe(true);
  });

  it("accepts a non-empty abstain answer", () => {
    expect(validateAnswer(makeAbstain("drift:stale-index")).ok).toBe(true);
  });

  // --- the prose-in-string rejection path (the standing V1 proof) ---
  it("REJECTS prose stuffed into a count value", () => {
    const res = validateAnswer({ kind: "count", value: "about forty open tickets" });
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it("REJECTS a bare prose string as an answer", () => {
    expect(validateAnswer("there are three open topics").ok).toBe(false);
  });

  it("REJECTS a list whose items are bare prose strings", () => {
    expect(validateAnswer({ kind: "list", items: ["billing and login"] }).ok).toBe(false);
  });

  it("REJECTS an unknown answer kind", () => {
    expect(validateAnswer({ kind: "summary", text: "..." }).ok).toBe(false);
  });

  it("REJECTS an empty-reason abstain", () => {
    expect(validateAnswer({ kind: "abstain", reason: "" }).ok).toBe(false);
  });
});
