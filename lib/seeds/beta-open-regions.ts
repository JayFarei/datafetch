// Curated seed: beta "distinct regions with placed orders", window-capable.
// Index-backed path for the `beta-open-regions` query family. The index maps
// each region to the FIRST filing position of a placed order in it, so one
// index answers every "as of #N placed" window: a region is present iff its
// first position < asOf. Non-circular: recomputed from fixture records.

import type { Seed } from "../../src/ladder/seed.js";

export const betaOpenRegions: Seed = {
  id: "beta-open-regions-index",
  taskId: "beta-open-regions",
  provenance: "curated",
  indexName: "open-regions",
  buildIndex(records) {
    const regionFirstPos: Record<string, number> = {};
    records.forEach((r, pos) => {
      if (r["state"] !== "placed") return;
      const region = String(r["region"]);
      if (!(region in regionFirstPos)) regionFirstPos[region] = pos;
    });
    return { regionFirstPos };
  },
  reduceIndex(index, param) {
    const firstPos = (index["regionFirstPos"] as Record<string, number>) ?? {};
    const regions = Object.keys(firstPos)
      .filter((r) => firstPos[r]! < param.asOf)
      .sort();
    return { kind: "list", items: regions.map((region) => ({ region })) };
  },
};
