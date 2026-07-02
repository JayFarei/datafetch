// Derived-index builder. Reads a tenant snapshot's source collections, computes
// each curated seed's index payload, stamps it with the CURRENT source
// fingerprint, and writes indexes/<indexName>.json. Committed fixtures are the
// deterministic output of this function; on drift the source changes but the
// indexes are NOT rebuilt, so their stamped fingerprint goes stale.

import fs from "node:fs";
import path from "node:path";

import { getTask } from "./tasks.js";
import { mountSnapshot } from "./snapshot.js";
import { seedsForTenant } from "./registry.js";

export function buildIndexes(tenant: string, snapshotDir: string): string[] {
  const snapshot = mountSnapshot(snapshotDir, tenant);
  const indexDir = path.join(snapshotDir, "indexes");
  fs.mkdirSync(indexDir, { recursive: true });

  const written: string[] = [];
  for (const seed of seedsForTenant(tenant)) {
    const task = getTask(seed.taskId);
    const records = snapshot.collections[task.sourceCollection] ?? [];
    const payload = seed.buildIndex(records);
    const artifact = { sourceFingerprint: snapshot.sourceFingerprint, ...payload };
    const outPath = path.join(indexDir, `${seed.indexName}.json`);
    fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2) + "\n");
    written.push(outPath);
  }
  return written;
}
