// Curated seed: alpha "distinct topics of open tickets".
// Index-backed path for task `alpha-open-topics`. Non-circular: recomputes the
// topic set from the fixture records.

import type { Seed } from "../../src/ladder/seed.js";

export const alphaOpenTopics: Seed = {
  id: "alpha-open-topics-index",
  taskId: "alpha-open-topics",
  provenance: "curated",
  indexName: "open-topics",
  buildIndex(records) {
    const topics = [
      ...new Set(
        records
          .filter((r) => r["status"] === "open")
          .map((r) => String(r["topic"])),
      ),
    ].sort();
    return { topics };
  },
  reduceIndex(index) {
    const topics = (index["topics"] as string[]) ?? [];
    return { kind: "list", items: topics.map((topic) => ({ topic })) };
  },
};
