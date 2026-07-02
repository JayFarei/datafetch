// Curated seed: alpha "distinct topics of open tickets", window-capable.
// Index-backed path for the `alpha-open-topics` query family. The index maps
// each topic to the FIRST filing position at which an open ticket carried it,
// so one index answers every "as of #N filed" window: a topic is present iff
// its first position < asOf. Non-circular: recomputed from fixture records.

import type { Seed } from "../../src/ladder/seed.js";

export const alphaOpenTopics: Seed = {
  id: "alpha-open-topics-index",
  taskId: "alpha-open-topics",
  provenance: "curated",
  indexName: "open-topics",
  buildIndex(records) {
    const topicFirstPos: Record<string, number> = {};
    records.forEach((r, pos) => {
      if (r["status"] !== "open") return;
      const topic = String(r["topic"]);
      if (!(topic in topicFirstPos)) topicFirstPos[topic] = pos;
    });
    return { topicFirstPos };
  },
  reduceIndex(index, param) {
    const firstPos = (index["topicFirstPos"] as Record<string, number>) ?? {};
    const topics = Object.keys(firstPos)
      .filter((t) => firstPos[t]! < param.asOf)
      .sort();
    return { kind: "list", items: topics.map((topic) => ({ topic })) };
  },
};
