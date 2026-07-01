// Curated seed: alpha "open + high priority ticket count".
//
// The index-backed answer path for task `alpha-open-high`. Builds a single
// aggregate (the count) from the tickets collection, and reads it back in one
// turn. This is the honest, non-circular procedure: it recomputes from the
// fixture records — it does NOT reference any gold artifact (V7:G3).

import type { Seed } from "../../src/ladder/seed.js";

export const alphaOpenHighCount: Seed = {
  id: "alpha-open-high-count",
  taskId: "alpha-open-high",
  provenance: "curated",
  indexName: "open-high-count",
  buildIndex(records) {
    const count = records.filter(
      (r) => r["status"] === "open" && r["priority"] === "high",
    ).length;
    return { count };
  },
  reduceIndex(index) {
    return { kind: "count", value: Number(index["count"]) };
  },
};
