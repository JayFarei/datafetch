import { describe, expect, it } from "vitest";

import { defaultLadderConfig, Ladder } from "../../src/ladder/stateMachine.js";

function driveWins(ladder: Ladder, id: string, n: number, winEvery: number, startTs = 1_800_000_000) {
  // winEvery = 1 -> always win; 2 -> every other; etc.
  for (let i = 0; i < n; i++) {
    ladder.observePair(id, { win: i % winEvery === 0, ts: startTs + i });
  }
}

describe("ladder state machine (V4/V5)", () => {
  it("climbs quarantine -> shadow -> candidate -> promoted on repeated real wins", () => {
    const ladder = new Ladder(defaultLadderConfig());
    ladder.admit("seed-a", "curated");

    expect(ladder.stateOf("seed-a")).toBe("quarantine");
    ladder.observePair("seed-a", { win: true, ts: 1 });
    ladder.observePair("seed-a", { win: true, ts: 2 });
    ladder.observePair("seed-a", { win: true, ts: 3 }); // >= shadowAfterCalls(3)
    expect(ladder.stateOf("seed-a")).toBe("shadow");

    for (let i = 4; i <= 10; i++) ladder.observePair("seed-a", { win: true, ts: i });
    expect(ladder.stateOf("seed-a")).toBe("candidate"); // >= candidateAfterCalls(10), winRate 1.0

    for (let i = 11; i <= 30; i++) ladder.observePair("seed-a", { win: true, ts: i });
    expect(ladder.stateOf("seed-a")).toBe("promoted");
  });

  it("promotes only with a boundaryRef and pairs>=minPairs (V5)", () => {
    const ladder = new Ladder(defaultLadderConfig());
    ladder.admit("seed-a", "curated");
    driveWins(ladder, "seed-a", 30, 1);

    const e = ladder.entry("seed-a");
    expect(e.state).toBe("promoted");
    expect(e.evidence?.pairs).toBe(30);
    expect(e.evidence?.boundaryRef).toBeTruthy();
    expect(typeof e.promotedAt).toBe("number");

    const promote = ladder.promotionRecords().find((r) => r.decision === "promote");
    expect(promote?.id).toBe("seed-a");
    expect(promote?.boundaryRef).toBe(e.evidence?.boundaryRef);
  });

  it("REJECTS a high-usage sub-floor procedure at the gate (D6) and never promotes it", () => {
    const ladder = new Ladder(defaultLadderConfig());
    ladder.admit("coinflip", "curated");
    // 40 pairs at ~50% win-rate: heavy usage, below the 0.70 floor.
    driveWins(ladder, "coinflip", 40, 2);

    expect(ladder.stateOf("coinflip")).not.toBe("promoted");
    const rec = ladder.promotionRecords().find((r) => r.id === "coinflip");
    expect(rec?.decision).toBe("reject");
  });

  it("the gate is live in BOTH directions over a run (anti-inert, D3)", () => {
    const ladder = new Ladder(defaultLadderConfig());
    ladder.admit("winner", "curated");
    ladder.admit("loser", "control");
    driveWins(ladder, "winner", 30, 1);
    driveWins(ladder, "loser", 30, 1000); // effectively 1 win in 30 -> sub-floor

    const decisions = ladder.promotionRecords();
    expect(decisions.some((r) => r.decision === "promote")).toBe(true);
    expect(decisions.some((r) => r.decision === "reject")).toBe(true);
  });

  it("a negative control never reaches promoted", () => {
    const ladder = new Ladder(defaultLadderConfig());
    ladder.admit("degenerate-control", "control");
    driveWins(ladder, "degenerate-control", 40, 1000); // never wins
    expect(ladder.stateOf("degenerate-control")).not.toBe("promoted");
  });

  it("the gate fires exactly once per procedure", () => {
    const ladder = new Ladder(defaultLadderConfig());
    ladder.admit("seed-a", "curated");
    driveWins(ladder, "seed-a", 60, 1); // well past minPairs
    const decisionsForA = ladder.promotionRecords().filter((r) => r.id === "seed-a");
    expect(decisionsForA).toHaveLength(1);
  });

  it("demote() drives promoted -> quarantine and clears promotedAt (drift edge)", () => {
    const ladder = new Ladder(defaultLadderConfig());
    ladder.admit("seed-a", "curated");
    driveWins(ladder, "seed-a", 30, 1);
    expect(ladder.stateOf("seed-a")).toBe("promoted");

    const from = ladder.demote("seed-a", "drift:stale-index");
    expect(from).toBe("promoted");
    expect(ladder.stateOf("seed-a")).toBe("quarantine");
    expect(ladder.entry("seed-a").promotedAt).toBeUndefined();
  });

  it("serialises to a ladder-state map keyed by procedureId", () => {
    const ladder = new Ladder(defaultLadderConfig());
    ladder.admit("seed-a", "curated");
    driveWins(ladder, "seed-a", 30, 1);
    const state = ladder.state();
    expect(state["seed-a"]!.state).toBe("promoted");
    expect(state["seed-a"]!.provenance).toBe("curated");
  });
});
