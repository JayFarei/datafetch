import { describe, expect, it } from "vitest";

import {
  applyMaturityContract,
  buildMaturityContractLines,
} from "../src/observer/quarantineValidator.js";

describe("quarantine validator maturity contracts", () => {
  it("stamps maturity contracts only when origin and held-out replay evidence exist", () => {
    expect(buildMaturityContractLines({
      originating: { trajectoryId: "traj_origin", expected: 1, got: 1 },
    })).toEqual([]);

    const lines = buildMaturityContractLines({
      originating: { trajectoryId: "traj_origin", expected: 1, got: 1 },
      sibling: { trajectoryId: "traj_heldout", expected: 2, got: 2 },
    });

    expect(lines).toEqual([
      "@replay-contract: origin=traj_origin exp=1 got=1; heldout=traj_heldout exp=2 got=2",
      "@change-contract: held-out replay matched on traj_heldout; public schema and answer semantics preserved",
      "@verifier: quarantineValidator idempotency+genericity replay pass",
      "@rollback: hook-manifest quarantine/supersede on regression",
    ]);

    const promoted = applyMaturityContract(
      "/* ---\n@quarantined: true\n--- */",
      lines,
    );
    expect(promoted).not.toContain("@quarantined: true");
    expect(promoted).toContain("@quarantined: false\n@replay-contract:");
    expect(promoted).toContain("@rollback: hook-manifest quarantine/supersede on regression");
  });
});
