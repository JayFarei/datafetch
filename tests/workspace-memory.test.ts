import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { regenerateWorkspaceMemory } from "../src/bootstrap/workspaceMemory.js";

const FN_OK = (name: string): string =>
  [
    'import { fn } from "@datafetch/sdk";',
    'import * as v from "valibot";',
    `export const ${name} = fn({`,
    `  intent: "${name} seed intent",`,
    "  examples: [{ input: {}, output: { value: 1 } }],",
    "  input: v.object({}),",
    "  output: v.object({ value: v.number() }),",
    "  body: () => ({ value: 1 }),",
    "});",
    "",
  ].join("\n");

describe("regenerateWorkspaceMemory", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(path.join(os.tmpdir(), "df-memory-"));
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  async function writeFinqaMount(): Promise<void> {
    const mountRoot = path.join(baseDir, "mounts", "finqa-2024");
    const collRoot = path.join(mountRoot, "finqa_cases");
    await mkdir(collRoot, { recursive: true });
    await writeFile(
      path.join(mountRoot, "_inventory.json"),
      JSON.stringify(
        {
          mountId: "finqa-2024",
          substrate: "atlas",
          generatedAt: "2026-05-06T00:00:00.000Z",
          collections: [
            {
              ident: "finqaCases",
              name: "finqa_cases",
              rows: 8281,
              fingerprint: "sha256:abcdef",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(
      path.join(collRoot, "_descriptor.json"),
      JSON.stringify(
        {
          kind: "documents",
          cardinality: { rows: 8281 },
          fields: {
            question: { role: "text", presence: 1, embeddable: true },
            answer: { role: "number", presence: 0.92 },
            program: { role: "text", presence: 0.88 },
            sector: { role: "label", presence: 0.5, cardinality_estimate: 12 },
          },
          affordances: ["findExact", "search", "findSimilar", "hybrid"],
          polymorphic_variants: null,
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  it("writes AGENTS.md and a Claude-compatible symlink from mount metadata", async () => {
    await writeFinqaMount();

    await regenerateWorkspaceMemory({
      baseDir,
      tenantId: "test-jay",
      mountIds: ["finqa-2024"],
    });

    const agents = await readFile(path.join(baseDir, "AGENTS.md"), "utf8");
    expect(agents).toContain("Datafetch Workspace Memory");
    expect(agents).toContain("df.d.ts");
    expect(agents).toContain("Code-Native Discovery");
    expect(agents).toContain("Namespace Boundaries");
    expect(agents).toContain("df.db.*` is the mounted system/provider data surface");
    expect(agents).toContain("df.lib.*` is tenant-local TypeScript");
    expect(agents).toContain("df.tool.*` is a governed adapter bridge");
    expect(agents).toContain("df.answer(...)` is the typed commit boundary");
    expect(agents).toContain("validated plan");
    expect(agents).toContain("result/report.md");
    expect(agents).toContain("result/graph.txt");
    expect(agents).toContain("accepted HEAD view");
    expect(agents).toContain("hook manifests remain the authority");
    expect(agents).toContain("observer/<tenant>/decisions.jsonl");
    expect(agents).toContain("scripts/helpers.ts");
    expect(agents).toContain("do not create nested `lib/<tenant>/...` paths");
    expect(agents).toContain("validated observer promotion");
    expect(agents).toContain("df.db.finqaCases");
    expect(agents).toContain("financial question answering");
    expect(agents).toContain("question");
    expect(agents).toContain("sector");
    expect(agents).toContain("return df.answer({");
    expect(agents).not.toContain("export default async function");

    const alias = path.join(baseDir, "CLAUDE.md");
    expect((await lstat(alias)).isSymbolicLink()).toBe(true);
    expect(await readlink(alias)).toBe("AGENTS.md");
  });

  it("does not clobber a human-authored CLAUDE.md", async () => {
    await writeFinqaMount();
    await writeFile(path.join(baseDir, "CLAUDE.md"), "# Human Notes\n", "utf8");

    await regenerateWorkspaceMemory({
      baseDir,
      tenantId: "test-jay",
      mountIds: ["finqa-2024"],
    });

    expect(await readFile(path.join(baseDir, "CLAUDE.md"), "utf8")).toBe(
      "# Human Notes\n",
    );
  });

  it("lists seed primitives that remain callable under hook modes", async () => {
    await mkdir(path.join(baseDir, "lib", "__seed__"), { recursive: true });
    await writeFile(
      path.join(baseDir, "lib", "__seed__", "seeded.ts"),
      FN_OK("seeded"),
      "utf8",
    );

    await regenerateWorkspaceMemory({
      baseDir,
      tenantId: "test-jay",
    });

    const agents = await readFile(path.join(baseDir, "AGENTS.md"), "utf8");
    expect(agents).toContain("df.lib.seeded");
  });
});
