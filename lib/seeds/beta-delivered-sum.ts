// Curated seed: beta "total value of delivered orders".
// Index-backed path for task `beta-delivered-sum`. Non-circular: recomputes the
// sum from the fixture records.

import type { Seed } from "../../src/ladder/seed.js";

export const betaDeliveredSum: Seed = {
  id: "beta-delivered-sum",
  taskId: "beta-delivered-sum",
  provenance: "curated",
  indexName: "delivered-sum",
  buildIndex(records) {
    const sum = records
      .filter((r) => r["state"] === "delivered")
      .reduce((acc, r) => acc + Number(r["total"]), 0);
    return { sum };
  },
  reduceIndex(index) {
    return { kind: "count", value: Number(index["sum"]) };
  },
};
