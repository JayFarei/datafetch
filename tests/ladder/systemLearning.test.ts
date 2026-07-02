import { describe, expect, it } from "vitest";

import { scorePair } from "../../src/ladder/pairing.js";
import { tenantSnapshotDir } from "../../src/ladder/paths.js";
import { buildRegistry } from "../../src/ladder/registry.js";
import { mountSnapshot } from "../../src/ladder/snapshot.js";
import { defaultLadderConfig, Ladder } from "../../src/ladder/stateMachine.js";

// The demo's cross-tenant suggestion only exercises the DECLINE half of
// earn-or-stay-put (the suggested procedure has no matching index on the
// receiving tenant, so it abstains and is rejected). This test covers the
// PROMOTE half: a suggestion that IS applicable on the receiving tenant earns
// promotion from that tenant's OWN paired evidence — reputation is not inherited
// from the sending tenant, it is re-earned on real wins here.
describe("system learning — promote-on-own-evidence (positive earn-or-stay-put)", () => {
  it("a suggestion with a valid index on the receiving tenant earns promotion from its own pairs", () => {
    const snapshot = mountSnapshot(tenantSnapshotDir("beta"), "beta");
    const registry = buildRegistry({ withControls: true });
    const ladder = new Ladder(defaultLadderConfig());

    // Treat a beta-applicable procedure as if suggested into beta's quarantine.
    const suggested = "beta-open-regions-index";
    ladder.admit(suggested, "curated");

    let ts = 1_800_000_000;
    let rejectedBeforePromote = false;
    for (let k = 0; k < 40; k++) {
      const score = scorePair("beta-open-regions", [suggested], registry, snapshot);
      // it genuinely wins its counterfactual on beta's own data (not inherited)
      expect(score.win).toBe(true);
      const rec = ladder.observePair(suggested, { win: score.win, ts: ts++ });
      if (rec?.decision === "reject") rejectedBeforePromote = true;
    }

    expect(rejectedBeforePromote).toBe(false);
    expect(ladder.stateOf(suggested)).toBe("promoted");

    const promote = ladder.promotionRecords().find((r) => r.decision === "promote");
    expect(promote?.id).toBe(suggested);
    expect(promote?.boundaryRef).toBeTruthy();
  });
});
