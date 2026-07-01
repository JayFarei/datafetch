// Snapshot mount + drift fingerprint (C1).
//
// A snapshot is a directory of committed JSON. Top-level `*.json` files are
// SOURCE collections (arrays of records). A `indexes/` subdirectory holds
// DERIVED artifacts (precomputed aggregates) that carry the source fingerprint
// they were built against.
//
// The drift fingerprint hashes the SOURCE files only. Mutating a source file
// changes the fingerprint; the derived indexes are NOT rebuilt, so their
// stored `sourceFingerprint` no longer matches and the executor abstains rather
// than serve a stale answer. This is the substrate primitive the drift probe
// (S2) and graceful floor (V8) are built on.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface IndexArtifact {
  /** the source fingerprint this derived artifact was built against */
  sourceFingerprint: string;
  [key: string]: unknown;
}

export interface MountedSnapshot {
  tenant: string;
  dir: string;
  /** hash of the SOURCE files only (excludes indexes/) */
  sourceFingerprint: string;
  collections: Record<string, Record<string, unknown>[]>;
  indexes: Record<string, IndexArtifact>;
}

function sha256(buf: Buffer | string): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** List top-level `*.json` source files (indexes/ is derived, excluded). */
function sourceFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => e.name)
    .sort();
}

/**
 * Deterministic fingerprint over a snapshot's SOURCE files. Sorted by relative
 * path; each file contributes `name\n<sha256(bytes)>`. Excludes indexes/.
 */
export function fingerprintSnapshot(dir: string): string {
  const parts: string[] = [];
  for (const name of sourceFiles(dir)) {
    const bytes = fs.readFileSync(path.join(dir, name));
    parts.push(`${name}\n${sha256(bytes)}`);
  }
  return sha256(parts.join("\n"));
}

export function mountSnapshot(dir: string, tenant = path.basename(path.dirname(dir))): MountedSnapshot {
  const collections: Record<string, Record<string, unknown>[]> = {};
  for (const name of sourceFiles(dir)) {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    if (!Array.isArray(parsed)) {
      throw new Error(`snapshot source ${name} is not a JSON array`);
    }
    collections[name.replace(/\.json$/, "")] = parsed as Record<string, unknown>[];
  }

  const indexes: Record<string, IndexArtifact> = {};
  const indexDir = path.join(dir, "indexes");
  if (fs.existsSync(indexDir)) {
    for (const name of fs.readdirSync(indexDir).sort()) {
      if (!name.endsWith(".json")) continue;
      const parsed = JSON.parse(fs.readFileSync(path.join(indexDir, name), "utf8"));
      indexes[name.replace(/\.json$/, "")] = parsed as IndexArtifact;
    }
  }

  return {
    tenant,
    dir,
    sourceFingerprint: fingerprintSnapshot(dir),
    collections,
    indexes,
  };
}
