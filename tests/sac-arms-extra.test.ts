import { describe, expect, it } from "vitest";

import {
  SAC_ARMS,
  armConfig,
  resolveSacArm,
  truncateTrajectoriesToBudget,
  approxTokenCount,
} from "../src/eval/sacArms.js";

// B-3 (armOnb, C2) + B-4 (armT + equal-budget mechanic, C8). Decision-independent
// build: the arm configs + the pure equal-budget helper. The live prompt/scorer
// wiring is sequenced with the live runs.

describe("new arms armOnb (C2) + armT (C8)", () => {
  it("registers both in SAC_ARMS and resolveSacArm", () => {
    expect(SAC_ARMS).toContain("armOnb");
    expect(SAC_ARMS).toContain("armT");
    expect(resolveSacArm({ SAC_ARM: "armOnb" } as NodeJS.ProcessEnv)).toBe("armOnb");
    expect(resolveSacArm({ SAC_ARM: "armT" } as NodeJS.ProcessEnv)).toBe("armT");
    expect(() => resolveSacArm({ SAC_ARM: "armX" } as NodeJS.ProcessEnv)).toThrow();
  });

  it("armOnb = onboarded, NO learning, NO gate (distinct from arm2 which learns)", () => {
    const onb = armConfig("armOnb");
    expect(onb).toMatchObject({
      arm: "armOnb",
      armId: "sac-armOnb",
      interfaceMode: "legacy",
      learningEnabled: false,
      governanceGate: null,
      resultsCache: false,
      recipeHint: false,
      phases: 1,
      withholdTools: false,
      wipeLibBetweenQuestions: false,
    });
    // The crux distinction vs arm2 (the C2 headline must not conflate them).
    expect(armConfig("arm2").learningEnabled).toBe(true);
    expect(onb.learningEnabled).toBe(false);
  });

  it("armT = raw-transcript injection, NO callable learned interface, single-phase", () => {
    const t = armConfig("armT");
    expect(t).toMatchObject({
      arm: "armT",
      armId: "sac-armT",
      interfaceMode: "hooks-candidate-only",
      learningEnabled: false,
      governanceGate: null,
      phases: 1,
      rawTranscriptInjection: true,
    });
    // arm2 (the abstraction arm it is compared against) does NOT inject transcript.
    expect(armConfig("arm2").rawTranscriptInjection ?? false).toBe(false);
  });

  it("leaves the existing 7 arms unchanged", () => {
    expect(armConfig("arm1")).toMatchObject({ interfaceMode: "hooks-candidate-only", wipeLibBetweenQuestions: true, learningEnabled: false });
    expect(armConfig("arm4")).toMatchObject({ phases: 2, governanceGate: true, learningEnabled: true });
    expect(armConfig("arm5a")).toMatchObject({ resultsCache: true, phases: 2 });
  });
});

describe("truncateTrajectoriesToBudget (C8 equal-budget mechanic)", () => {
  const trajs = [
    { id: "t1", text: "A".repeat(40) }, // 10 tokens each
    { id: "t2", text: "B".repeat(40) },
    { id: "t3", text: "C".repeat(40) },
  ];

  it("all fit under a generous budget; chronological order; no truncation", () => {
    const out = truncateTrajectoriesToBudget(trajs, 100);
    expect(out.includedIds).toEqual(["t1", "t2", "t3"]);
    expect(out.truncatedId).toBeNull();
    expect(out.payload.startsWith("AAAA")).toBe(true);
    expect(out.tokens).toBeLessThanOrEqual(100);
  });

  it("recency: a tight budget keeps the NEWEST trajectory", () => {
    // Each traj is exactly 10 tokens; budget 10 holds only t3 (newest) whole,
    // leaving no room for a boundary fragment.
    const out = truncateTrajectoriesToBudget(trajs, 10);
    expect(out.includedIds).toEqual(["t3"]);
    expect(out.truncatedId).toBeNull();
  });

  it("truncates the single boundary trajectory and stays within budget", () => {
    // budget 15: t3 (10) fits; t2 would need 10+1(sep)=11 more -> 21 > 15, so t2
    // is truncated to the remaining (15-10-1=4) tokens.
    const out = truncateTrajectoriesToBudget(trajs, 15);
    expect(out.includedIds).toEqual(["t2", "t3"]);
    expect(out.truncatedId).toBe("t2");
    expect(out.tokens).toBeLessThanOrEqual(15);
    // the truncated t2 payload is shorter than the full 40 chars
    expect(out.payload.length).toBeLessThan(40 + 2 + 40);
  });

  it("zero/empty budget -> empty payload", () => {
    expect(truncateTrajectoriesToBudget(trajs, 0).payload).toBe("");
    expect(truncateTrajectoriesToBudget([], 100).includedIds).toEqual([]);
  });

  it("is deterministic + the realised payload never exceeds the budget", () => {
    for (const b of [3, 7, 11, 19, 25, 31]) {
      const a = truncateTrajectoriesToBudget(trajs, b);
      const c = truncateTrajectoriesToBudget(trajs, b);
      expect(a).toEqual(c);
      expect(approxTokenCount(a.payload)).toBeLessThanOrEqual(b);
    }
  });
});
