import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { DiskSnippetRuntime } from "../src/snippet/runtime.js";

describe("DiskSnippetRuntime sibling TypeScript imports", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
    dirs.length = 0;
  });

  it("loads named exports from a sibling .ts module that has its own imports", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "df-runtime-sibling-import-"));
    dirs.push(baseDir);
    const scriptsDir = path.join(baseDir, "workspace", "scripts");
    await mkdir(scriptsDir, { recursive: true });
    await writeFile(
      path.join(scriptsDir, "helper.ts"),
      [
        'import { writeFile } from "node:fs/promises";',
        'export const g = (value: unknown) => `ok:${String(value)}`;',
        "export const writeJson = (file: string, value: unknown) =>",
        '  writeFile(file, JSON.stringify(value), "utf8");',
        "",
      ].join("\n"),
      "utf8",
    );

    const runtime = new DiskSnippetRuntime();
    const result = await runtime.run({
      source: [
        'import { g } from "./helper.ts";',
        'console.log(g("loaded"));',
      ].join("\n"),
      phase: "execute",
      sourcePath: path.join(scriptsDir, "answer.ts"),
      sessionCtx: {
        sessionId: "sess_sibling_ts_import",
        tenantId: "tenant-a",
        mountIds: [],
        baseDir,
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("ok:loaded\n");
    expect(result.stderr).toBe("");
  });
});
