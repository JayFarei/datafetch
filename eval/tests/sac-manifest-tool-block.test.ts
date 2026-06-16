import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  InMemoryMountRuntimeRegistry,
  setMountRuntimeRegistry,
  type MountRuntime,
} from "../../src/adapter/runtime.js";
import { regenerateManifest } from "../../src/server/manifest.js";
import type { ToolCatalogEntry } from "../../src/runtime/toolCatalog.js";
import type { CollectionHandle } from "../../src/sdk/index.js";

// Phase-2 #4: regenerateManifest renders a df.tool.* surface for tool-shaped
// mounts (dataset-neutral: gathered from the registry, the substrate names no
// dataset). For db-only mounts it emits NO tool block (additive — existing
// db/lib datasets are unaffected). This is the substrate capability Phase-3
// zero-src onboarding of a tool-shaped corpus depends on.

function makeRuntime(mountId: string, tools?: readonly ToolCatalogEntry[]): MountRuntime {
  return {
    mountId,
    adapter: {} as MountRuntime["adapter"],
    identMap: [],
    ...(tools ? { tools } : {}),
    collection<T>(): CollectionHandle<T> {
      return {} as CollectionHandle<T>;
    },
    async close() {
      /* no-op */
    },
  };
}

async function renderTo(baseDir: string): Promise<string> {
  await regenerateManifest({ baseDir, tenantId: "test-tenant" });
  return readFile(path.join(baseDir, "df.d.ts"), "utf8");
}

describe("regenerateManifest df.tool.* branch (Phase-2 #4)", () => {
  let baseDir: string | null = null;

  afterEach(async () => {
    setMountRuntimeRegistry(new InMemoryMountRuntimeRegistry());
    if (baseDir) {
      await rm(baseDir, { recursive: true, force: true });
      baseDir = null;
    }
  });

  it("renders df.tool.<bundle>.<name> for a tool-shaped mount", async () => {
    baseDir = await mkdtemp(path.join(tmpdir(), "sac-manifest-tool-"));
    const reg = new InMemoryMountRuntimeRegistry();
    reg.register(
      "demo-mount",
      makeRuntime("demo-mount", [
        {
          bundle: "demo_api",
          tools: [
            { name: "getUser", description: "Fetch a user by id.", params_json_schema: {} },
            { name: "list-posts", description: "List posts.", params_json_schema: {} },
          ],
        },
      ]),
    );
    setMountRuntimeRegistry(reg);

    const dts = await renderTo(baseDir);
    expect(dts).toContain("tool: {");
    expect(dts).toContain("demo_api: {");
    expect(dts).toContain("[name: string]: (input: any) => Promise<unknown>;");
    expect(dts).toContain("getUser(input: Record<string, unknown>): Promise<unknown>;");
    // Non-identifier tool names are safely quoted.
    expect(dts).toContain('"list-posts"(input: Record<string, unknown>): Promise<unknown>;');
    // JSDoc carries the description.
    expect(dts).toContain("Fetch a user by id.");
  });

  it("emits NO tool block for a db-only mount (additive)", async () => {
    baseDir = await mkdtemp(path.join(tmpdir(), "sac-manifest-notool-"));
    const reg = new InMemoryMountRuntimeRegistry();
    reg.register("db-mount", makeRuntime("db-mount")); // no tools
    setMountRuntimeRegistry(reg);

    const dts = await renderTo(baseDir);
    expect(dts).not.toContain("tool: {");
    // The db + lib + answer surface is still present.
    expect(dts).toContain("db: {");
    expect(dts).toContain("lib: {");
    expect(dts).toContain("answer(input:");
  });
});
