// Ladder path resolution, anchored to the module location (not cwd) so replay
// is reproducible regardless of where bin/ladder-replay is invoked from.

import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// src/ladder/ -> repo root
export const REPO_ROOT = path.resolve(HERE, "..", "..");

export function tenantSnapshotDir(tenant: string): string {
  return path.join(REPO_ROOT, "fixtures", "tenants", tenant, "snapshot");
}

export function repoRelative(absPath: string): string {
  return path.relative(REPO_ROOT, absPath);
}
