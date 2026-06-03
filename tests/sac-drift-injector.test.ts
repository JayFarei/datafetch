import { describe, expect, it } from "vitest";

import {
  injectDrift,
  runDriftSweep,
  expectPromoteUnderDrift,
  relDiff,
} from "../eval/skillcraft/probes/driftInjector.js";
import { runGovernanceProbe } from "../eval/skillcraft/probes/governanceGate.js";
import { sourceDriftFixture } from "../eval/skillcraft/probes/fixtures.js";

// B-2 (C4 A0 drift-injector kill-gate). The injector generalises the static
// sourceDriftFixture; these tests regression-lock it to the proven fixture's
// behaviour, confirm the gate's decline decision MOVES across the FAC-tolerance
// boundary (mechanism liveness — the C4 $0 falsifier), and confirm determinism.

describe("drift injector (C4 A0 kill-gate)", () => {
  it("regression-locks to sourceDriftFixture: magnitude 1.75x reproduces 1000->1750 and DECLINES", async () => {
    const spec = { base: 500, staleMultiplier: 2.0, magnitude: 1.75 };
    expect(expectPromoteUnderDrift(spec)).toBe(false);

    const injected = injectDrift(spec);
    expect(injected.expectGatePromotes).toBe(false);

    const [injOut, refOut] = await Promise.all([
      runGovernanceProbe(injected),
      runGovernanceProbe(sourceDriftFixture()),
    ]);
    // Same gate decision as the proven static fixture: DECLINE.
    expect(injOut.gatePromotes).toBe(false);
    expect(refOut.gatePromotes).toBe(false);
    // Same stale-vs-current numbers the frozen gate caught.
    expect(injOut.arm3WouldEmit).toBe(1000); // the stale value an ungoverned arm emits
    expect(injOut.siblingExpected).toBe(1750); // the current (drifted) gold
    expect(refOut.arm3WouldEmit).toBe(1000);
    expect(refOut.siblingExpected).toBe(1750);
  });

  it("no drift (magnitude 1.0) PROMOTES: stale == current", async () => {
    const spec = { base: 500, staleMultiplier: 2.0, magnitude: 1.0 };
    expect(expectPromoteUnderDrift(spec)).toBe(true);
    const out = await runGovernanceProbe(injectDrift(spec));
    expect(out.gatePromotes).toBe(true);
  });

  it("sub-tolerance drift (1.005x) PROMOTES; supra-tolerance drift (1.05x) DECLINES", async () => {
    // relDiff(1000, 1005) = 5/1005 ~= 0.005 < 1% tolerance -> promote
    expect(relDiff(1000, 1005)).toBeLessThan(0.01);
    const sub = await runGovernanceProbe(injectDrift({ base: 500, staleMultiplier: 2.0, magnitude: 1.005 }));
    expect(sub.gatePromotes).toBe(true);

    // relDiff(1000, 1050) = 50/1050 ~= 0.048 > 1% tolerance -> decline
    expect(relDiff(1000, 1050)).toBeGreaterThan(0.01);
    const supra = await runGovernanceProbe(injectDrift({ base: 500, staleMultiplier: 2.0, magnitude: 1.05 }));
    expect(supra.gatePromotes).toBe(false);
  });

  it("SWEEP: the gate's decision MOVES across the tolerance boundary (C4 mechanism is live)", async () => {
    const live = await runDriftSweep(500, 2.0, [1.0, 1.005, 1.05, 1.75]);
    // The decline decision is sensitive to drift magnitude (not promote- or
    // decline-everywhere) -> the governance mechanism C4 rests on is alive.
    expect(live.decisionMoved).toBe(true);
    // No supra-tolerance stale clone is silently promoted (no false-accept).
    expect(live.noSupraToleranceFalseAccept).toBe(true);
    // Every swept point matched its pre-registered expectation.
    expect(live.allMatched).toBe(true);
    // C4 A0 PASSES at $0 (had it failed, C4 -> DONE-HONEST-NEGATIVE for free).
    expect(live.pass).toBe(true);
    // The two endpoints bracket the boundary.
    expect(live.points[0].gatePromotes).toBe(true); // no drift
    expect(live.points[live.points.length - 1].gatePromotes).toBe(false); // 1.75x
  });

  it("is deterministic (same spec -> identical helper source + identical sweep)", async () => {
    const a = injectDrift({ base: 500, staleMultiplier: 2.0, magnitude: 1.75 });
    const b = injectDrift({ base: 500, staleMultiplier: 2.0, magnitude: 1.75 });
    expect(a.helperSource).toBe(b.helperSource);
    expect(a.tenantId).toBe(b.tenantId);

    const [s1, s2] = await Promise.all([
      runDriftSweep(500, 2.0, [1.0, 1.05]),
      runDriftSweep(500, 2.0, [1.0, 1.05]),
    ]);
    expect(s1.points.map((p) => p.gatePromotes)).toEqual(s2.points.map((p) => p.gatePromotes));
  });
});
