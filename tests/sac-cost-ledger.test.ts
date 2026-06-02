import { describe, expect, it } from "vitest";

import {
  effectiveModelContextTokens,
  modelContextCostAtCachedWeight,
} from "../src/eval/sacArms.js";

// Guards the cost arithmetic that the cross-arm scorer's headline M* + the
// attribution ladder + the sensitivity ladder (CONTRACT §c) all read. No
// scorer test existed before this; this is the credibility-spine guard.
describe("SaC cost ledger arithmetic", () => {
  describe("effectiveModelContextTokens (HEADLINE unit)", () => {
    it("counts cached input at FULL weight (input + cached + output)", () => {
      expect(
        effectiveModelContextTokens({
          agentInputTokens: 8,
          agentCachedInputTokens: 139093,
          agentOutputTokens: 2604,
        }),
      ).toBe(8 + 139093 + 2604);
    });

    it("treats a null/absent cached count as 0 (input + output)", () => {
      expect(
        effectiveModelContextTokens({ agentInputTokens: 100, agentOutputTokens: 50 }),
      ).toBe(150);
      expect(
        effectiveModelContextTokens({
          agentInputTokens: 100,
          agentCachedInputTokens: null,
          agentOutputTokens: 50,
        }),
      ).toBe(150);
    });
  });

  describe("modelContextCostAtCachedWeight (sensitivity ladder)", () => {
    const parts = { rawInputTokens: 8, cachedInputTokens: 139093, outputTokensLedger: 2604 };

    it("at cachedWeight=1 is IDENTICAL to effectiveModelContextTokens (no-op consistency)", () => {
      const full = modelContextCostAtCachedWeight({ ...parts, cachedWeight: 1 });
      expect(full).toBe(
        effectiveModelContextTokens({
          agentInputTokens: parts.rawInputTokens,
          agentCachedInputTokens: parts.cachedInputTokens,
          agentOutputTokens: parts.outputTokensLedger,
        }),
      );
      expect(full).toBe(141705);
    });

    it("at cachedWeight=0 is the cache-excluded marginal (fresh input + output)", () => {
      expect(modelContextCostAtCachedWeight({ ...parts, cachedWeight: 0 })).toBe(8 + 2604);
    });

    it("at cachedWeight=0.1 is the dollar-equivalent tie-breaker unit", () => {
      expect(modelContextCostAtCachedWeight({ ...parts, cachedWeight: 0.1 })).toBeCloseTo(
        8 + 0.1 * 139093 + 2604,
        6,
      );
    });

    it("demonstrates the unit gap the tie-breaker exists to catch (~141.7k full vs ~2.6k fresh)", () => {
      const full = modelContextCostAtCachedWeight({ ...parts, cachedWeight: 1 });
      const fresh = modelContextCostAtCachedWeight({ ...parts, cachedWeight: 0 });
      // cached scaffolding dominates: the full-weight number is >50x the
      // cache-excluded number, so a token win must be re-checked in dollars.
      expect(full / fresh).toBeGreaterThan(50);
    });

    it("a per-question difference cancels the shared cached floor only when cached counts match", () => {
      // arm1 and arm4 with IDENTICAL cached reads: the difference is unit-invariant.
      const arm1 = { rawInputTokens: 20, cachedInputTokens: 1000, outputTokensLedger: 30 };
      const arm4 = { rawInputTokens: 12, cachedInputTokens: 1000, outputTokensLedger: 18 };
      for (const w of [0, 0.1, 1]) {
        const diff =
          modelContextCostAtCachedWeight({ ...arm1, cachedWeight: w }) -
          modelContextCostAtCachedWeight({ ...arm4, cachedWeight: w });
        expect(diff).toBeCloseTo(20 + 30 - (12 + 18), 6); // = 20, independent of w
      }
      // arm1 and arm4 with DIFFERENT cached reads: the difference now depends on
      // the unit — exactly why "the cached floor cancels by the parity gate" is
      // false in general (the gate fixes prompt text, not realized cache reads).
      const arm4HotCache = { rawInputTokens: 12, cachedInputTokens: 5000, outputTokensLedger: 18 };
      const diffAt1 =
        modelContextCostAtCachedWeight({ ...arm1, cachedWeight: 1 }) -
        modelContextCostAtCachedWeight({ ...arm4HotCache, cachedWeight: 1 });
      const diffAt0 =
        modelContextCostAtCachedWeight({ ...arm1, cachedWeight: 0 }) -
        modelContextCostAtCachedWeight({ ...arm4HotCache, cachedWeight: 0 });
      expect(diffAt1).not.toBeCloseTo(diffAt0, 6);
    });
  });
});
