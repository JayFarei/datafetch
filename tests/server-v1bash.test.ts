import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createBashApp } from "../src/server/v1bash.js";
import { DiskMountReader, type MountReader } from "../src/bash/mountReader.js";
import {
  StubSnippetRuntime,
  type SessionCtx,
  type SnippetRuntime,
} from "../src/bash/snippetRuntime.js";
import type { BashRuntimeKind } from "../src/bash/types.js";

async function buildBaseDir(): Promise<string> {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "v1bash-"));
  // Seed a minimal mount so DiskMountReader can serve /db/<mount>/.
  const mountId = "demo-mount";
  const mountDir = path.join(baseDir, "mounts", mountId);
  const collDir = path.join(mountDir, "rows");
  await mkdir(collDir, { recursive: true });
  await writeFile(
    path.join(mountDir, "rows.ts"),
    `// generated\nexport interface Row { id: string }\nexport const SCHEMA_VERSION = "sha256:test" as const;\nexport declare const rows: { findExact(filter: Partial<Row>, limit?: number): Promise<Row[]> };\n`,
    "utf8",
  );
  await writeFile(
    path.join(mountDir, "README.md"),
    "# demo-mount\n",
    "utf8",
  );
  await writeFile(
    path.join(collDir, "_descriptor.json"),
    JSON.stringify({ kind: "documents", cardinality: { rows: 0 }, fields: {}, affordances: ["findExact"], polymorphic_variants: null }),
    "utf8",
  );
  await writeFile(
    path.join(collDir, "_samples.json"),
    "[]",
    "utf8",
  );
  await writeFile(
    path.join(collDir, "_stats.json"),
    JSON.stringify({ rows: 0, presence: {}, cardinality: {} }),
    "utf8",
  );
  return baseDir;
}

describe("createBashApp", () => {
  let baseDir: string;
  let mountReader: MountReader;

  beforeEach(async () => {
    baseDir = await buildBaseDir();
    mountReader = new DiskMountReader({ baseDir });
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  function postBash(app: ReturnType<typeof createBashApp>, body: unknown) {
    return app.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  function appWithRuntime(runtime?: BashRuntimeKind, snippetRuntime: SnippetRuntime = new StubSnippetRuntime()) {
    return createBashApp({
      mountReader,
      snippetRuntime,
      libraryResolver: null,
      baseDir,
      ...(runtime ? { runtime } : {}),
    });
  }

  it("rejects invalid JSON with 400", async () => {
    const app = appWithRuntime();
    const res = await postBash(app, "not-json{");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_json" });
  });

  it("rejects malformed body shape with 400 + issues array", async () => {
    const app = appWithRuntime();
    const res = await postBash(app, { sessionId: "" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: unknown[] };
    expect(body.error).toBe("invalid_request");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("executes a bash command and returns stdout/stderr/exitCode", async () => {
    const app = appWithRuntime();
    const res = await postBash(app, {
      sessionId: "sess-1",
      tenantId: "t",
      mountIds: ["demo-mount"],
      command: "ls /db",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      stdout: string;
      stderr: string;
      exitCode: number;
    };
    expect(typeof body.stdout).toBe("string");
    expect(typeof body.stderr).toBe("string");
    expect(typeof body.exitCode).toBe("number");
    expect(body.stdout).toContain("demo-mount");
  });

  it("seeds the VFS root with the server-maintained AGENTS.md when present", async () => {
    await writeFile(
      path.join(baseDir, "AGENTS.md"),
      "# Generated Workspace Memory\n\nvalidated plan\n",
      "utf8",
    );
    const app = appWithRuntime();
    const res = await postBash(app, {
      sessionId: "sess-agents",
      tenantId: "t",
      mountIds: ["demo-mount"],
      command: "cat /AGENTS.md && cat /CLAUDE.md",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { stdout: string };
    expect(body.stdout).toContain("Generated Workspace Memory");
    expect(body.stdout).toContain("validated plan");
  });

  it("reuses the cached session across calls with the same sessionId", async () => {
    const app = appWithRuntime();
    const sessionId = "sess-reuse";
    const first = await postBash(app, {
      sessionId,
      tenantId: "t",
      mountIds: ["demo-mount"],
      command: 'echo "first"',
    });
    expect(first.status).toBe(200);
    const second = await postBash(app, {
      sessionId,
      tenantId: "t",
      mountIds: ["demo-mount"],
      command: 'echo "second"',
    });
    expect(second.status).toBe(200);
    const sb = (await second.json()) as { stdout: string };
    expect(sb.stdout).toContain("second");
  });

  it("treats mounted /db filesystems as read-only", async () => {
    const app = appWithRuntime();
    const res = await postBash(app, {
      sessionId: "sess-readonly",
      tenantId: "t",
      mountIds: ["demo-mount"],
      command: "echo x > /db/demo-mount/new.ts",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      stdout: string;
      stderr: string;
      exitCode: number;
    };
    expect(body.exitCode).not.toBe(0);
    expect(`${body.stdout}\n${body.stderr}`).toMatch(/EROFS|read-only/i);
  });

  it("supports the Mirage runtime behind the same /v1/bash contract", async () => {
    const runtime = new RecordingSnippetRuntime();
    const app = appWithRuntime("mirage", runtime);
    const sessionId = "sess-mirage";

    const inspect = await postBash(app, {
      sessionId,
      tenantId: "tenant-a",
      mountIds: ["demo-mount"],
      command: "cat /AGENTS.md >/tmp/agents-copy.md && ls /db && cat /db/demo-mount/README.md",
    });
    expect(inspect.status).toBe(200);
    const inspectBody = (await inspect.json()) as { stdout: string; exitCode: number };
    expect(inspectBody.exitCode).toBe(0);
    expect(inspectBody.stdout).toContain("demo-mount");
    expect(inspectBody.stdout).toContain("# demo-mount");

    const writeDb = await postBash(app, {
      sessionId,
      tenantId: "tenant-a",
      mountIds: ["demo-mount"],
      command: "echo x > /db/demo-mount/blocked.ts",
    });
    const writeDbBody = (await writeDb.json()) as {
      stdout: string;
      stderr: string;
      exitCode: number;
    };
    expect(writeDbBody.exitCode).not.toBe(0);
    expect(`${writeDbBody.stdout}\n${writeDbBody.stderr}`).toMatch(/read-only/i);

    const writeLib = await postBash(app, {
      sessionId,
      tenantId: "tenant-a",
      mountIds: ["demo-mount"],
      command: [
        "cat > /lib/mirageOnly.ts <<'EOF'",
        'export const marker = "mirage";',
        "EOF",
      ].join("\n"),
    });
    expect(writeLib.status).toBe(200);
    expect(((await writeLib.json()) as { exitCode: number }).exitCode).toBe(0);

    const run = await postBash(app, {
      sessionId,
      tenantId: "tenant-a",
      mountIds: ["demo-mount"],
      command: `npx tsx -e "console.log('mirage runtime')"`,
    });
    expect(run.status).toBe(200);
    const runBody = (await run.json()) as { stdout: string; exitCode: number };
    expect(runBody.exitCode).toBe(0);
    expect(runBody.stdout).toContain("captured:console.log('mirage runtime')");
    expect(runtime.last?.source).toBe("console.log('mirage runtime')");
    expect(runtime.last?.sessionCtx.tenantId).toBe("tenant-a");

    const writeScratch = await postBash(app, {
      sessionId,
      tenantId: "tenant-a",
      mountIds: ["demo-mount"],
      command: [
        "cat > /tmp/scratch.ts <<'EOF'",
        "export const cwdMarker = true;",
        "EOF",
      ].join("\n"),
    });
    expect(writeScratch.status).toBe(200);
    expect(((await writeScratch.json()) as { exitCode: number }).exitCode).toBe(0);

    const runFromCwd = await postBash(app, {
      sessionId,
      tenantId: "tenant-a",
      mountIds: ["demo-mount"],
      command: "cd /tmp && npx tsx scratch.ts",
    });
    expect(runFromCwd.status).toBe(200);
    const runFromCwdBody = (await runFromCwd.json()) as {
      stdout: string;
      exitCode: number;
    };
    expect(runFromCwdBody.exitCode).toBe(0);
    expect(runtime.last?.source).toContain("cwdMarker");

    const flushed = await readFile(
      path.join(baseDir, "lib", "tenant-a", "mirageOnly.ts"),
      "utf8",
    );
    expect(flushed).toContain('marker = "mirage"');
  });
});

class RecordingSnippetRuntime implements SnippetRuntime {
  last:
    | {
        source: string;
        sessionCtx: SessionCtx;
      }
    | null = null;

  async run(args: {
    source: string;
    sessionCtx: SessionCtx;
  }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    this.last = { source: args.source, sessionCtx: args.sessionCtx };
    return {
      stdout: `captured:${args.source}\n`,
      stderr: "",
      exitCode: 0,
    };
  }
}
