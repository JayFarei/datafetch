// Coverage for src/runtime/toolCatalog.ts — the substrate-level tool
// catalog shape and the canonical tool_manifest.json writer.

import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, it, expect } from "vitest";

import {
  TOOL_MANIFEST_FILENAME,
  flattenToolCatalogNames,
  writeToolManifest,
  type ToolCatalogEntry,
} from "../src/runtime/toolCatalog.js";

const SAMPLE_CATALOG: ToolCatalogEntry[] = [
  {
    bundle: "github",
    tools: [
      {
        name: "getIssue",
        description: "Fetch a GitHub issue by repo+number.",
        params_json_schema: { type: "object", required: ["repo", "number"] },
      },
      {
        name: "listIssues",
        description: "List issues for a repo.",
        params_json_schema: { type: "object", required: ["repo"] },
      },
    ],
  },
  {
    bundle: "openlibrary",
    tools: [
      {
        name: "search",
        description: "Search OpenLibrary by title.",
        params_json_schema: { type: "object", required: ["q"] },
      },
    ],
  },
];

describe("flattenToolCatalogNames", () => {
  it("returns the bare tool-name list across bundles in declaration order", () => {
    expect(flattenToolCatalogNames(SAMPLE_CATALOG)).toEqual([
      "getIssue",
      "listIssues",
      "search",
    ]);
  });

  it("returns an empty list for an empty catalog", () => {
    expect(flattenToolCatalogNames([])).toEqual([]);
  });
});

describe("writeToolManifest", () => {
  it("writes the canonical filename with JSON.stringify(indent=2) + trailing newline", async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "df-manifest-"));
    try {
      await writeToolManifest(dir, SAMPLE_CATALOG);
      const target = path.join(dir, TOOL_MANIFEST_FILENAME);
      const raw = await fsp.readFile(target, "utf8");
      expect(target.endsWith("tool_manifest.json")).toBe(true);
      expect(raw.endsWith("\n")).toBe(true);
      // Parses cleanly and round-trips equal.
      const parsed = JSON.parse(raw) as ToolCatalogEntry[];
      expect(parsed).toEqual(SAMPLE_CATALOG);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});
