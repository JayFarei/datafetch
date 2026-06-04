import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  getMountRuntimeRegistry,
  setMountRuntimeRegistry,
  InMemoryMountRuntimeRegistry,
  type MountRuntime,
} from "../../src/adapter/runtime.js";
import { buildIdentMap } from "../../src/bootstrap/idents.js";
import { regenerateManifest } from "../../src/server/manifest.js";
import type { ToolCatalogEntry } from "../../src/runtime/toolCatalog.js";
import type { CollectionHandle } from "../../src/sdk/index.js";

// Phase-3 MECHANISM proof / Phase-2 end-to-end validation.
//
// The point of Phase 2 (dataset-neutral governance #1/#2, code-gen
// specialization registry #3, df.tool.* manifest rendering #4) was to make the
// substrate general enough that a NEW dataset compiles into a mountable
// code-mode interface with ZERO substrate (src/ outside src/eval) changes. This
// test is the integration proof that those parts COMPOSE: it onboards a
// brand-new synthetic dataset (collections + tools) using ONLY public substrate
// APIs (getMountRuntimeRegistry().register() + buildIdentMap + regenerateManifest)
// and asserts the generated df.d.ts carries the full reference surface
// (df.db.* + df.tool.* + df.lib + df.answer + df.run + support types).
//
// Synthetic fixture by design: this validates the MECHANISM. It does NOT make
// the Goal-reserved Phase-3 corpus choice (WideSearch-vs-alternative) and does
// NOT exercise the live "helpers learned in hooks-draft" path (which needs the
// corpus's data + an agent run). Those remain the user's call.

function makeRuntime(args: {
  mountId: string;
  identMap: ReturnType<typeof buildIdentMap>;
  tools?: readonly ToolCatalogEntry[];
}): MountRuntime {
  return {
    mountId: args.mountId,
    adapter: {} as MountRuntime["adapter"],
    identMap: args.identMap,
    ...(args.tools ? { tools: args.tools } : {}),
    collection<T>(): CollectionHandle<T> {
      return {} as CollectionHandle<T>;
    },
    async close() {
      /* no-op */
    },
  };
}

describe("zero-src dataset onboarding (Phase-3 mechanism / Phase-2 validation)", () => {
  let baseDir: string | null = null;

  afterEach(async () => {
    setMountRuntimeRegistry(new InMemoryMountRuntimeRegistry());
    if (baseDir) {
      await rm(baseDir, { recursive: true, force: true });
      baseDir = null;
    }
  });

  it("compiles a NEW dataset (collections + tools) into a full df.d.ts via only public APIs", async () => {
    baseDir = await mkdtemp(path.join(tmpdir(), "sac-onboard-"));

    // --- Onboard a brand-new dataset using ONLY the public substrate API ---
    // (no substrate code names or knows this dataset; this is what a Phase-3
    //  eval/<dataset>/ module would do).
    getMountRuntimeRegistry().register(
      "widely-2026",
      makeRuntime({
        mountId: "widely-2026",
        identMap: buildIdentMap(["items", "sources"]),
        tools: [
          {
            bundle: "search_api",
            tools: [
              { name: "web_search", description: "Run a wide web search; returns matching items.", params_json_schema: {} },
              { name: "fetch_page", description: "Fetch one page's content.", params_json_schema: {} },
            ],
          },
        ],
      }),
    );

    await regenerateManifest({ baseDir, tenantId: "widely-2026" });
    const dts = await readFile(path.join(baseDir, "df.d.ts"), "utf8");

    // --- The full reference surface, generated entirely by the substrate ---
    expect(dts).toContain("declare const df: {");
    // df.db.<collection> from the mount's identMap
    expect(dts).toContain("db: {");
    expect(dts).toContain("items: CollectionHandle;");
    expect(dts).toContain("sources: CollectionHandle;");
    // df.tool.<bundle>.<name> from the mount's tools (Phase-2 #4)
    expect(dts).toContain("tool: {");
    expect(dts).toContain("search_api: {");
    expect(dts).toContain("web_search(input: Record<string, unknown>): Promise<unknown>;");
    expect(dts).toContain("fetch_page(input: Record<string, unknown>): Promise<unknown>;");
    expect(dts).toContain("Run a wide web search; returns matching items.");
    // df.lib / df.answer / df.run
    expect(dts).toContain("lib: {");
    expect(dts).toContain("answer(input:");
    expect(dts).toContain("run<T>(fn: () => Promise<T>): Promise<Result<T>>;");
    // Reference support types
    expect(dts).toContain("interface Result<T> {");
    expect(dts).toContain("interface CollectionHandle {");
  });
});
