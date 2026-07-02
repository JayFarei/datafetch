// Curated seed: alpha "open + high priority ticket count", window-capable.
//
// The index-backed answer path for the `alpha-open-high` query FAMILY ("as of
// the first N tickets filed, ..."). The index records the filing POSITIONS of
// matching tickets, so one index answers every window: count = matches with
// position < asOf. One read, one turn, distinct answers per window. This is the
// honest, non-circular procedure: it recomputes from the fixture records — it
// does NOT reference any gold artifact (V7:G3).

import type { Seed } from "../../src/ladder/seed.js";

export const alphaOpenHighCount: Seed = {
  id: "alpha-open-high-count",
  taskId: "alpha-open-high",
  provenance: "curated",
  indexName: "open-high-count",
  buildIndex(records) {
    const matchPositions = records
      .map((r, pos) => ({ r, pos }))
      .filter(({ r }) => r["status"] === "open" && r["priority"] === "high")
      .map(({ pos }) => pos);
    return { matchPositions };
  },
  reduceIndex(index, param) {
    const positions = (index["matchPositions"] as number[]) ?? [];
    return { kind: "count", value: positions.filter((p) => p < param.asOf).length };
  },
};
