// Curated seed: beta "distinct regions with placed orders".
// Index-backed path for task `beta-open-regions`. Non-circular: recomputes the
// region set from the fixture records.

import type { Seed } from "../../src/ladder/seed.js";

export const betaOpenRegions: Seed = {
  id: "beta-open-regions-index",
  taskId: "beta-open-regions",
  provenance: "curated",
  indexName: "open-regions",
  buildIndex(records) {
    const regions = [
      ...new Set(
        records
          .filter((r) => r["state"] === "placed")
          .map((r) => String(r["region"])),
      ),
    ].sort();
    return { regions };
  },
  reduceIndex(index) {
    const regions = (index["regions"] as string[]) ?? [];
    return { kind: "list", items: regions.map((region) => ({ region })) };
  },
};
