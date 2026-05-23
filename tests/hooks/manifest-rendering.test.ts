// df.d.ts manifest and apropos honour hook callability.

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HookRegistry } from "../../src/hooks/registry.js";
import { DiskLibraryResolver } from "../../src/snippet/library.js";
import { regenerateManifest } from "../../src/server/manifest.js";
import {
  describeLibraryFunction,
  renderManPage,
  searchLibrary,
} from "../../src/discovery/librarySearch.js";

const FN_OK = (name: string): string =>
  [
    'import { fn } from "@datafetch/sdk";',
    'import * as v from "valibot";',
    `export const ${name} = fn({`,
    `  intent: "${name} intent — counts double",`,
    `  examples: [{ input: {}, output: { value: 42 } }],`,
    "  input: v.object({}),",
    "  output: v.object({ value: v.number() }),",
    "  body: () => ({ value: 42 }),",
    "});",
    "",
  ].join("\n");

const FN_TOOL_FANOUT = `/* ---
name: toolFanout
status: provisional
description: |
  Transferable learned datafetch fan-out helper for repeated per-entity tool calls.
  Use when the task has an entity set and needs the same tool bundle plus
  one or more tool names called for each entity. Call with typed fields:
  { entityValues, toolBundle, toolNames, paramName, paramByTool?, limit? }.
--- */
import { fn } from "@datafetch/sdk";
import * as v from "valibot";
export const toolFanout = fn({
  intent: "reusable learned fan-out interface for repeated per-entity tool calls; caller-facing input supplies entityValues, toolBundle, toolNames, and paramName so the helper remains transferable",
  examples: [{ input: { intent: "repeated tool fan-out", limit: 3 }, output: { tools: {} } }],
  input: v.looseObject({
    intent: v.optional(v.string()),
    limit: v.optional(v.number()),
    entityValues: v.optional(v.array(v.union([v.string(), v.number()]))),
    toolBundle: v.optional(v.string()),
    toolNames: v.optional(v.array(v.string())),
    paramName: v.optional(v.string()),
  }),
  output: v.unknown(),
  body: () => [],
});
`;

const FN_BROKEN = `import { fn } from "@datafetch/sdk";
export const broken = fn({
  intent: "broken
});
`;

const tenant = "skillcraft-full";

describe("df.d.ts hides quarantined hooks", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(path.join(os.tmpdir(), "manifest-hide-quar-"));
    await mkdir(path.join(baseDir, "lib", tenant), { recursive: true });
  });

  afterEach(async () => {
    delete process.env["DATAFETCH_INTERFACE_MODE"];
    await rm(baseDir, { recursive: true, force: true });
  });

  it("renderManifest omits quarantined entries when hooks are enabled", async () => {
    await writeFile(path.join(baseDir, "lib", tenant, "ok.ts"), FN_OK("ok"), "utf8");
    await writeFile(path.join(baseDir, "lib", tenant, "broken.ts"), FN_BROKEN, "utf8");

    process.env["DATAFETCH_INTERFACE_MODE"] = "hooks-draft";
    const resolver = new DiskLibraryResolver({ baseDir });
    const registry = new HookRegistry({ baseDir, resolver, mode: "hooks-draft" });
    await registry.ingestTenant(tenant);

    await regenerateManifest({ baseDir, tenantId: tenant });
    const dts = await readFile(path.join(baseDir, "df.d.ts"), "utf8");

    expect(dts).toContain("ok(");
    expect(dts).not.toContain("broken(");
  });

  it("keeps seed primitives visible in df.d.ts under hook modes", async () => {
    await mkdir(path.join(baseDir, "lib", "__seed__"), { recursive: true });
    await writeFile(
      path.join(baseDir, "lib", "__seed__", "seeded.ts"),
      FN_OK("seeded"),
      "utf8",
    );

    process.env["DATAFETCH_INTERFACE_MODE"] = "hooks-candidate-only";
    await regenerateManifest({ baseDir, tenantId: tenant });
    const dts = await readFile(path.join(baseDir, "df.d.ts"), "utf8");

    expect(dts).toContain("seeded(");
  });

  it("ranks validated-typescript helpers above candidate-typescript ones in df.d.ts", async () => {
    await writeFile(path.join(baseDir, "lib", tenant, "alpha.ts"), FN_OK("alpha"), "utf8");
    await writeFile(path.join(baseDir, "lib", tenant, "bravo.ts"), FN_OK("bravo"), "utf8");

    process.env["DATAFETCH_INTERFACE_MODE"] = "hooks-draft";
    const resolver = new DiskLibraryResolver({ baseDir });
    const registry = new HookRegistry({ baseDir, resolver, mode: "hooks-draft" });
    await registry.ingestTenant(tenant);

    // Promote alpha to validated-typescript; bravo stays candidate.
    const { writeManifest, readManifest } = await import(
      "../../src/hooks/manifest.js"
    );
    const alpha = await readManifest(baseDir, tenant, "alpha");
    if (alpha) {
      alpha.maturity = "validated-typescript";
      await writeManifest(baseDir, alpha);
    }

    await regenerateManifest({ baseDir, tenantId: tenant });
    const dts = await readFile(path.join(baseDir, "df.d.ts"), "utf8");
    const alphaIdx = dts.indexOf("alpha(");
    const bravoIdx = dts.indexOf("bravo(");
    expect(alphaIdx).toBeGreaterThan(-1);
    expect(bravoIdx).toBeGreaterThan(-1);
    expect(alphaIdx).toBeLessThan(bravoIdx);
  });

  it("renders learned toolFanout with the operational TypeScript call shape", async () => {
    await writeFile(path.join(baseDir, "lib", tenant, "toolFanout.ts"), FN_TOOL_FANOUT, "utf8");

    process.env["DATAFETCH_INTERFACE_MODE"] = "hooks-draft";
    const resolver = new DiskLibraryResolver({ baseDir });
    const registry = new HookRegistry({ baseDir, resolver, mode: "hooks-draft" });
    await registry.ingestTenant(tenant);

    await regenerateManifest({ baseDir, tenantId: tenant });
    const dts = await readFile(path.join(baseDir, "df.d.ts"), "utf8");

    expect(dts).toContain("toolFanout(input: { intent?: \"repeated tool fan-out\"; limit?: number; entityValues: Array<string | number>; toolBundle: string; toolNames: string[]; paramName: string");
    expect(dts).toContain("entityValues: [/* ids or names */]");
    expect(dts).not.toContain('await df.lib.toolFanout({"intent":"repeated tool fan-out","limit":3})');
  });

  it("orders same-maturity helpers by success count then recency", async () => {
    await writeFile(path.join(baseDir, "lib", tenant, "hot.ts"), FN_OK("hot"), "utf8");
    await writeFile(path.join(baseDir, "lib", tenant, "cold.ts"), FN_OK("cold"), "utf8");

    process.env["DATAFETCH_INTERFACE_MODE"] = "hooks-draft";
    const resolver = new DiskLibraryResolver({ baseDir });
    const registry = new HookRegistry({ baseDir, resolver, mode: "hooks-draft" });
    await registry.ingestTenant(tenant);

    const { writeManifest, readManifest } = await import(
      "../../src/hooks/manifest.js"
    );
    const hot = await readManifest(baseDir, tenant, "hot");
    if (hot) {
      hot.stats.successes = 25;
      await writeManifest(baseDir, hot);
    }
    const cold = await readManifest(baseDir, tenant, "cold");
    if (cold) {
      cold.stats.successes = 1;
      await writeManifest(baseDir, cold);
    }

    await regenerateManifest({ baseDir, tenantId: tenant });
    const dts = await readFile(path.join(baseDir, "df.d.ts"), "utf8");
    const hotIdx = dts.indexOf("hot(");
    const coldIdx = dts.indexOf("cold(");
    expect(hotIdx).toBeLessThan(coldIdx);
  });

  it("apropos can hide quarantined hooks (default) and surface them with the diagnostic flag", async () => {
    await writeFile(path.join(baseDir, "lib", tenant, "ok.ts"), FN_OK("ok"), "utf8");
    await writeFile(path.join(baseDir, "lib", tenant, "broken.ts"), FN_BROKEN, "utf8");

    process.env["DATAFETCH_INTERFACE_MODE"] = "hooks-draft";
    const resolver = new DiskLibraryResolver({ baseDir });
    const registry = new HookRegistry({ baseDir, resolver, mode: "hooks-draft" });
    await registry.ingestTenant(tenant);

    delete process.env["DATAFETCH_HOOKS_SHOW_QUARANTINED"];
    const hiddenMatches = await searchLibrary({
      baseDir,
      tenantId: tenant,
      resolver,
      query: "learned ok broken",
    });
    expect(hiddenMatches.map((m) => m.name).sort()).toEqual(["ok"]);
    expect(hiddenMatches[0]!.governance).toMatchObject({
      callability: "callable-with-fallback",
      maturity: "candidate-typescript",
    });

    process.env["DATAFETCH_HOOKS_SHOW_QUARANTINED"] = "1";
    const allMatches = await searchLibrary({
      baseDir,
      tenantId: tenant,
      resolver,
      query: "learned ok broken",
    });
    expect(allMatches.map((m) => m.name).sort()).toEqual(["broken", "ok"].sort());
    const broken = allMatches.find((m) => m.name === "broken");
    expect(broken?.governance).toMatchObject({
      callability: "quarantined",
      quarantineReason: "missing_export",
    });
    expect(broken?.why.join(" ")).toContain("quarantine: missing_export");
    delete process.env["DATAFETCH_HOOKS_SHOW_QUARANTINED"];
  });

  it("apropos marks not-callable hook invocations as diagnostic", async () => {
    await writeFile(path.join(baseDir, "lib", tenant, "candidate.ts"), FN_OK("candidate"), "utf8");

    process.env["DATAFETCH_INTERFACE_MODE"] = "hooks-candidate-only";
    const resolver = new DiskLibraryResolver({ baseDir });
    const registry = new HookRegistry({ baseDir, resolver, mode: "hooks-candidate-only" });
    await registry.ingestTenant(tenant);

    const matches = await searchLibrary({
      baseDir,
      tenantId: tenant,
      resolver,
      query: "candidate counts double",
    });

    expect(matches[0]).toMatchObject({
      name: "candidate",
      governance: {
        callability: "not-callable",
        maturity: "candidate-typescript",
      },
    });
    expect(matches[0]!.invocation).toContain("// not-callable; inspect");
  });

  it("man can inspect a quarantined hook whose implementation no longer resolves", async () => {
    await writeFile(path.join(baseDir, "lib", tenant, "broken.ts"), FN_BROKEN, "utf8");

    process.env["DATAFETCH_INTERFACE_MODE"] = "hooks-draft";
    const resolver = new DiskLibraryResolver({ baseDir });
    const registry = new HookRegistry({ baseDir, resolver, mode: "hooks-draft" });
    await registry.ingestTenant(tenant);

    const desc = await describeLibraryFunction({
      baseDir,
      tenantId: tenant,
      resolver,
      name: "broken",
    });

    expect(desc).not.toBeNull();
    expect(desc).toMatchObject({
      name: "broken",
      governance: {
        callability: "quarantined",
        quarantineReason: "missing_export",
      },
    });
    const page = renderManPage(desc!);
    expect(page).toContain("NAME\n       broken - learned interface broken");
    expect(page).toContain("GOVERNANCE");
    expect(page).toContain("callability: quarantined");
    expect(page).toContain("quarantineReason: missing_export");
    expect(page).toContain("df.lib.broken(...) // quarantined; inspect");
    expect(page).toContain(path.join(baseDir, "hooks", tenant, "broken.json"));
  });
});
