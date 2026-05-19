// Hand-crafted preseed helper for iter 3.0a probe (Goal 5).
//
// Target: investment_analysis/ci tpl4 (Intermediate; semi-annual compounding
// with a mid-term rate change). Mirrors the FinChain Python template's
// computation exactly (n=2 fixed, two-phase exponential growth, 2-dp rounding
// at the end). Inputs are the four numbers an agent extracts from the
// question text. Output is the compound interest in dollars.
//
// Probe gate: if the next-episode agent does not CALL df.lib.ci_two_phase_semiannual
// on a fresh seed of this template, the substrate's "agent calls learned
// helpers" premise does not fit FinChain (regardless of how generic the
// authoring path becomes). The probe halts iter 3 in that case.

import { fn } from "@datafetch/sdk";
import * as v from "valibot";

export const ci_two_phase_semiannual = fn({
  intent:
    "Compound interest, semi-annual compounding, two phases (rate changes once mid-term). Given the principal, the rate for phase 1, the years in phase 1, the rate for phase 2, and the years in phase 2, returns the total compound interest earned at the end of the horizon. Mirrors FinChain investment_analysis/ci tpl4 exactly.",
  examples: [],
  input: v.object({
    principal: v.number(),
    ratePercentPhase1: v.number(),
    yearsPhase1: v.number(),
    ratePercentPhase2: v.number(),
    yearsPhase2: v.number(),
  }),
  output: v.number(),
  async body(input) {
    const i = input as {
      principal: number;
      ratePercentPhase1: number;
      yearsPhase1: number;
      ratePercentPhase2: number;
      yearsPhase2: number;
    };
    const n = 2; // fixed: semi-annual compounding
    const amountAfterPhase1 =
      i.principal *
      Math.pow(1 + i.ratePercentPhase1 / (100 * n), n * i.yearsPhase1);
    const amountExact =
      amountAfterPhase1 *
      Math.pow(1 + i.ratePercentPhase2 / (100 * n), n * i.yearsPhase2);
    const amount = Math.round(amountExact * 100) / 100;
    const ci = Math.round((amount - i.principal) * 100) / 100;
    return ci;
  },
});
