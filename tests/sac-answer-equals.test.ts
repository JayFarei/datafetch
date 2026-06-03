import { describe, expect, it } from "vitest";

import { answerEquals, ANSWER_FAC_REL_TOLERANCE } from "../src/runtime/answerKit.js";

// Phase 2 (dataset-neutral governance): answerEquals generalises the gate's
// numeric-only FAC match to strings / booleans / structured answers, while
// keeping the numeric branch behaviourally identical to the old isFacMatch.
describe("answerEquals (dataset-neutral governance equality predicate)", () => {
  describe("numeric branch (must match the old 1% FAC contract)", () => {
    it("exact + within-tolerance numbers match", () => {
      expect(answerEquals(100, 100)).toBe(true);
      expect(answerEquals(100.5, 100)).toBe(true); // 0.5% < 1%
      expect(answerEquals(0, 0)).toBe(true);
    });
    it("outside-tolerance numbers do not match", () => {
      expect(answerEquals(102, 100)).toBe(false); // 2% > 1%
    });
    it("coerces numeric strings ($, commas, %) like the gate did", () => {
      expect(answerEquals("$1,000", 1000)).toBe(true);
      expect(answerEquals("1000", 1000)).toBe(true);
      expect(answerEquals(1000, "1,000")).toBe(true);
    });
    it("ANSWER_FAC_REL_TOLERANCE is the 1e-2 FinChain contract", () => {
      expect(ANSWER_FAC_REL_TOLERANCE).toBe(1e-2);
    });
  });

  describe("boolean branch", () => {
    it("matches equal booleans, rejects unequal", () => {
      expect(answerEquals(true, true)).toBe(true);
      expect(answerEquals(false, false)).toBe(true);
      expect(answerEquals(true, false)).toBe(false);
    });
    it("treats a boolean vs its string form as a type mismatch (conservative)", () => {
      expect(answerEquals(true, "true")).toBe(false);
    });
  });

  describe("string branch (normalised equality)", () => {
    it("matches modulo trim / case / internal whitespace", () => {
      expect(answerEquals("  Hello   World ", "hello world")).toBe(true);
      expect(answerEquals("Bulbasaur", "bulbasaur")).toBe(true);
    });
    it("rejects genuinely different strings", () => {
      expect(answerEquals("charmander", "squirtle")).toBe(false);
    });
  });

  describe("structured branch (canonical key-sorted deep equality)", () => {
    it("is key-order insensitive", () => {
      expect(answerEquals({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
      expect(answerEquals({ x: { p: 1, q: 2 } }, { x: { q: 2, p: 1 } })).toBe(true);
    });
    it("matches equal arrays, rejects different ones", () => {
      expect(answerEquals([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(answerEquals(["grass", "poison"], ["grass", "poison"])).toBe(true);
      expect(answerEquals([1, 2, 3], [3, 2, 1])).toBe(false); // order-sensitive for arrays
    });
    it("rejects structural mismatch", () => {
      expect(answerEquals({ a: 1 }, { a: 2 })).toBe(false);
      expect(answerEquals({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    });
    it("does not throw on cyclic structures", () => {
      const cyc: any = { a: 1 };
      cyc.self = cyc;
      expect(() => answerEquals(cyc, { a: 1 })).not.toThrow();
    });
  });

  describe("the diagnosed gap: non-numeric answers were previously un-validatable", () => {
    it("now validates a matching string answer (would have been 'not numeric' before)", () => {
      expect(answerEquals("Kanto", "kanto")).toBe(true);
    });
    it("now validates a matching structured answer", () => {
      const got = { name: "bulbasaur", types: ["grass", "poison"], stat_total: 318 };
      const expected = { types: ["grass", "poison"], stat_total: 318, name: "bulbasaur" };
      expect(answerEquals(got, expected)).toBe(true);
    });
  });
});
