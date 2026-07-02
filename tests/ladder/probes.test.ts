import { describe, expect, it } from "vitest";

import { runForcedDriftProbe } from "../../src/ladder/driftProbe.js";
import { runFloorProbe } from "../../src/ladder/floorProbe.js";

describe("forced-drift probe on stale-clone-control (V4:drift, defeater D3)", () => {
  it("observes BOTH edges: promoted before mutation, quarantine + abstention after", () => {
    const res = runForcedDriftProbe();

    // edge 1: it genuinely served a correct, non-abstain answer while promoted
    expect(res.servedBefore.kind).toBe("count");
    expect(res.probe.stateBeforeMutation).toBe("promoted");

    // edge 2: the next episode after the forced drift abstained and it demoted
    expect(res.servedAfter.kind).toBe("abstain");
    expect(res.probe.stateAfterNextEpisode).toBe("quarantine");
    expect(res.probe.abstentionRecorded).toBe(true);
    expect(res.demotedFrom).toBe("promoted");
  });

  it("is exactly the shape verify/ladder.sh V4:drift reads", () => {
    const { probe } = runForcedDriftProbe();
    expect(probe).toEqual({
      stateBeforeMutation: "promoted",
      stateAfterNextEpisode: "quarantine",
      abstentionRecorded: true,
    });
  });
});

describe("graceful-floor probe (V8, claim C6)", () => {
  it("alpha: fully-masked serves a typed answer; drift abstains", () => {
    const res = runFloorProbe("alpha");
    expect(res.probe.maskedServeOk).toBe(true);
    expect(res.maskedAnswer.kind).not.toBe("abstain");
    expect(res.probe.driftAbstained).toBe(true);
    expect(res.driftAnswer.kind).toBe("abstain");
  });

  it("beta: the same floor holds on the second corpus", () => {
    const res = runFloorProbe("beta");
    expect(res.probe.maskedServeOk).toBe(true);
    expect(res.probe.driftAbstained).toBe(true);
  });
});
