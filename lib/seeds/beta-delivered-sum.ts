// Curated seed: beta "total value of delivered orders", window-capable.
// Index-backed path for the `beta-delivered-sum` query family. The index keeps
// the filing positions of delivered orders alongside PREFIX SUMS of their
// totals, so one index answers every "as of #N placed" window in one read:
// the answer is the cumulative total at the last delivered position < asOf.
// Non-circular: recomputed from fixture records.

import type { Seed } from "../../src/ladder/seed.js";

export const betaDeliveredSum: Seed = {
  id: "beta-delivered-sum",
  taskId: "beta-delivered-sum",
  provenance: "curated",
  indexName: "delivered-sum",
  buildIndex(records) {
    const deliveredPositions: number[] = [];
    const cumTotals: number[] = [];
    let running = 0;
    records.forEach((r, pos) => {
      if (r["state"] !== "delivered") return;
      running += Number(r["total"]);
      deliveredPositions.push(pos);
      cumTotals.push(running);
    });
    return { deliveredPositions, cumTotals };
  },
  reduceIndex(index, param) {
    const positions = (index["deliveredPositions"] as number[]) ?? [];
    const cum = (index["cumTotals"] as number[]) ?? [];
    let value = 0;
    for (let i = 0; i < positions.length; i++) {
      if (positions[i]! < param.asOf) value = cum[i]!;
      else break;
    }
    return { kind: "count", value };
  },
};
