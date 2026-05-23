import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { serve } from "@hono/node-server";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { closeAllMounts } from "../src/adapter/runtime.js";
import { locateRepoRoot } from "../src/paths.js";
import { createServer as createDatafetchServer } from "../src/server/server.js";

type CapturedBody = {
  sessionId?: string;
  source?: string;
  phase?: string;
  sourcePath?: string;
};

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function makeBaseDir(): Promise<string> {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "df-cli-phase-"));
  tempDirs.push(baseDir);
  await writeFile(path.join(baseDir, "active-session"), "sess_cli\n", "utf8");
  return baseDir;
}

async function withSnippetServer<T>(
  fn: (serverUrl: string, bodies: CapturedBody[]) => Promise<T>,
): Promise<T> {
  const bodies: CapturedBody[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const body = raw ? (JSON.parse(raw) as CapturedBody) : {};
      bodies.push(body);
      const commitCount = bodies.filter((b) => b.phase === "commit").length;
      const trajectoryId = `traj_${body.phase}_${bodies.length}`;
      const rejectedCommit =
        body.phase === "commit" && body.source?.includes("plain rejection") === true;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          stdout: "",
          stderr: "",
          exitCode: rejectedCommit ? 1 : 0,
          trajectoryId,
          phase: body.phase,
          crystallisable: body.phase === "execute" || body.phase === "commit",
          artifactDir: `/tmp/${body.phase}`,
          mode: body.phase === "execute" ? "novel" : "interpreted",
          callPrimitives: [],
          ...(body.phase === "commit"
            ? {
                answer: {
                  intent: {
                    name: `countRows${commitCount}`,
                    parent: "count rows",
                    relation: commitCount === 1 ? "same" : "derived",
                  },
                  status: "answered",
                  value: commitCount,
                  evidence: [{ ref: `x-${commitCount}` }],
                  derivation: { operation: "count" },
                },
                validation: rejectedCommit
                  ? { accepted: false, learnable: false, blockers: ["plain rejection"] }
                  : { accepted: true, learnable: true, blockers: [] },
              }
            : {}),
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected TCP server address");
  }
  try {
    return await fn(`http://127.0.0.1:${address.port}`, bodies);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

async function withDatafetchServer<T>(
  baseDir: string,
  fn: (serverUrl: string) => Promise<T>,
): Promise<T> {
  const { app } = await createDatafetchServer({ baseDir });
  const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise<void>((resolve) => {
    if (server.listening) {
      resolve();
      return;
    }
    server.once("listening", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("expected TCP server address");
  }
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await closeAllMounts();
  }
}

async function runCli(args: string[], env: NodeJS.ProcessEnv, cwd?: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const repoRoot = await locateRepoRoot();
  return new Promise((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const child = spawn("node", [path.join(repoRoot, "bin", "datafetch.mjs"), ...args], {
      cwd: cwd ?? repoRoot,
      env,
    });
    child.stdout.on("data", (b: Buffer) => stdoutChunks.push(b));
    child.stderr.on("data", (b: Buffer) => stderrChunks.push(b));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        exitCode: code ?? -1,
      });
    });
  });
}

function parseEnvelope(stdout: string): Record<string, unknown> {
  const marker = "--- envelope ---\n";
  const idx = stdout.indexOf(marker);
  if (idx === -1) throw new Error(`missing envelope in stdout:\n${stdout}`);
  return JSON.parse(stdout.slice(idx + marker.length)) as Record<string, unknown>;
}

describe("datafetch plan/execute CLI", () => {
  it("mounts a fallback intent workspace with code-mode guidance", async () => {
    const baseDir = await makeBaseDir();
    const parent = await mkdtemp(path.join(os.tmpdir(), "df-fallback-mount-"));
    tempDirs.push(parent);
    const workspace = path.join(parent, "workspace");

    const server = http.createServer((req, res) => {
      if (req.method === "GET" && req.url?.startsWith("/v1/catalog/sources/")) {
        res.statusCode = 404;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "not_found" }));
        return;
      }
      if (req.method === "POST" && req.url === "/v1/connect") {
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            sessionId: "sess_fallback_mount",
            tenantId: "tenant-a",
            mountIds: ["fallback"],
          }),
        );
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") {
      server.close();
      throw new Error("expected TCP server address");
    }

    try {
      const env = {
        ...process.env,
        DATAFETCH_SESSION: "",
        DATAFETCH_HOME: baseDir,
      };
      const mount = await runCli(
        [
          "mount",
          "fallback",
          "--tenant",
          "tenant-a",
          "--intent",
          "count rows",
          "--server",
          `http://127.0.0.1:${address.port}`,
          "--base-dir",
          baseDir,
          "--path",
          workspace,
        ],
        env,
      );
      expect(mount.exitCode).toBe(0);

      const agents = await readFile(path.join(workspace, "AGENTS.md"), "utf8");
      expect(agents).toContain("Code-native discovery");
      expect(agents).toContain("Namespace boundaries");
      expect(agents).toContain("df.db.*` is the mounted system/provider data surface");
      expect(agents).toContain("df.lib.*` is tenant-local TypeScript");
      expect(agents).toContain("scripts/helpers.ts");
      expect(agents).toContain("do not create nested `lib/<tenant>/...` paths");
      expect(agents).toContain("validated observer promotion");
      expect(agents).toContain("df.answer(...)` is the typed commit boundary");
      await expect(
        readFile(path.join(workspace, "scripts", "scratch.ts"), "utf8"),
      ).resolves.toMatch(/^\/\/\/ <reference path="\.\.\/df\.d\.ts" \/>/);
      await expect(
        readFile(path.join(workspace, "scripts", "answer.ts"), "utf8"),
      ).resolves.toMatch(/^\/\/\/ <reference path="\.\.\/df\.d\.ts" \/>/);
      await expect(
        readFile(path.join(workspace, "scripts", "helpers.ts"), "utf8"),
      ).resolves.toMatch(/^\/\/\/ <reference path="\.\.\/df\.d\.ts" \/>/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  }, 30_000);

  it("sends explicit phase metadata through the snippets API", async () => {
    const baseDir = await makeBaseDir();
    await withSnippetServer(async (serverUrl, bodies) => {
      const env = {
        ...process.env,
        DATAFETCH_SESSION: "",
        DATAFETCH_HOME: baseDir,
      };

      const plan = await runCli(
        [
          "plan",
          "-e",
          "console.log('draft')",
          "--server",
          serverUrl,
          "--base-dir",
          baseDir,
        ],
        env,
      );
      expect(plan.exitCode).toBe(0);
      expect(plan.stdout).toContain('"phase": "plan"');

      const execute = await runCli(
        [
          "execute",
          "-e",
          "console.log('final')",
          "--server",
          serverUrl,
          "--base-dir",
          baseDir,
        ],
        env,
      );
      expect(execute.exitCode).toBe(0);
      expect(execute.stdout).toContain('"phase": "execute"');

      expect(bodies).toMatchObject([
        {
          sessionId: "sess_cli",
          source: "console.log('draft')",
          phase: "plan",
        },
        {
          sessionId: "sess_cli",
          source: "console.log('final')",
          phase: "execute",
        },
      ]);
    });
  }, 30_000);

  it("drives the intent workspace run/commit facade and writes workspace artifacts", async () => {
    const baseDir = await makeBaseDir();
    const workspace = await mkdtemp(path.join(os.tmpdir(), "df-intent-workspace-"));
    tempDirs.push(workspace);

    await withSnippetServer(async (serverUrl, bodies) => {
      await mkdir(path.join(workspace, ".datafetch"), { recursive: true });
      await mkdir(path.join(workspace, "lib", "skills"), { recursive: true });
      await mkdir(path.join(workspace, "scripts"), { recursive: true });
      await mkdir(path.join(workspace, "tmp"), { recursive: true });
      await writeFile(
        path.join(workspace, ".datafetch", "workspace.json"),
        `${JSON.stringify(
          {
            version: 1,
            sessionId: "sess_workspace",
            tenantId: "tenant-a",
            mountIds: ["finqa"],
            dataset: "finqa",
            intent: "count rows",
            baseDir,
            serverUrl,
            createdAt: "2026-05-06T00:00:00.000Z",
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await writeFile(
        path.join(workspace, "scripts", "scratch.ts"),
        "console.log('scratch')\n",
        "utf8",
      );
      await writeFile(
        path.join(workspace, "lib", "localHelper.ts"),
        "export const localHelper = 1;\n",
        "utf8",
      );
      await writeFile(
        path.join(workspace, "lib", "skills", "pick_evidence.md"),
        "# Pick Evidence\n\nReturn JSON only.\n",
        "utf8",
      );
      await writeFile(path.join(workspace, "tmp", "debug.txt"), "ignored\n", "utf8");
      await writeFile(path.join(workspace, ".env"), "SECRET=ignored\n", "utf8");
      const firstSource =
        "return df.answer({ status: 'answered', value: 1, evidence: [{ ref: 'x' }], derivation: { operation: 'count' } })\n";
      await writeFile(path.join(workspace, "scripts", "answer.ts"), firstSource, "utf8");

      const env = {
        ...process.env,
        DATAFETCH_SESSION: "",
        DATAFETCH_HOME: baseDir,
      };
      const run = await runCli(["run", "scripts/scratch.ts"], env, workspace);
      expect(run.exitCode).toBe(0);
      expect(run.stdout).toContain('"phase": "run"');
      await expect(
        readFile(path.join(workspace, "tmp", "runs", "001", "source.ts"), "utf8"),
      ).resolves.toContain("scratch");
      await expect(
        readFile(path.join(workspace, "tmp", "runs", "001", "result.json"), "utf8"),
      ).resolves.toContain('"phase": "run"');

      const commit = await runCli(["commit", "scripts/answer.ts"], env, workspace);
      expect(commit.exitCode).toBe(0);
      expect(commit.stdout).toContain('"phase": "commit"');
      await expect(
        readFile(path.join(workspace, "result", "answer.json"), "utf8"),
      ).resolves.toContain('"status": "answered"');
      await expect(
        readFile(path.join(workspace, "result", "validation.json"), "utf8"),
      ).resolves.toContain('"accepted": true');

      expect(bodies).toMatchObject([
        {
          sessionId: "sess_workspace",
          phase: "run",
        },
        {
          sessionId: "sess_workspace",
          phase: "commit",
        },
      ]);
      expect(bodies[0]?.sourcePath).toMatch(/scripts\/scratch\.ts$/);
      expect(bodies[1]?.sourcePath).toMatch(/scripts\/answer\.ts$/);
    });
  }, 30_000);

  it("records commit history, mirrors the current HEAD, and emits a replay test", async () => {
    const baseDir = await makeBaseDir();
    const workspace = await mkdtemp(path.join(os.tmpdir(), "df-intent-head-"));
    tempDirs.push(workspace);

    await withSnippetServer(async (serverUrl) => {
      await mkdir(path.join(workspace, ".datafetch"), { recursive: true });
      await mkdir(path.join(workspace, "lib", "skills"), { recursive: true });
      await mkdir(path.join(workspace, "scripts"), { recursive: true });
      await mkdir(path.join(workspace, "tmp"), { recursive: true });
      await writeFile(
        path.join(workspace, ".datafetch", "workspace.json"),
        `${JSON.stringify(
          {
            version: 1,
            sessionId: "sess_workspace_head",
            tenantId: "tenant-a",
            mountIds: ["finqa"],
            dataset: "finqa",
            intent: "count rows",
            baseDir,
            serverUrl,
            createdAt: "2026-05-06T00:00:00.000Z",
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await writeFile(
        path.join(workspace, "lib", "localHelper.ts"),
        "export const localHelper = 1;\n",
        "utf8",
      );
      await writeFile(
        path.join(workspace, "lib", "skills", "pick_evidence.md"),
        "# Pick Evidence\n\nReturn JSON only.\n",
        "utf8",
      );
      await writeFile(path.join(workspace, "tmp", "debug.txt"), "ignored\n", "utf8");
      await writeFile(path.join(workspace, ".env"), "SECRET=ignored\n", "utf8");
      await writeFile(
        path.join(workspace, "scripts", "answer.ts"),
        "return df.answer({ status: 'answered', value: 1, evidence: [{ ref: 'x' }], derivation: { operation: 'count' } })\n",
        "utf8",
      );

      const env = {
        ...process.env,
        DATAFETCH_SESSION: "",
        DATAFETCH_HOME: baseDir,
      };

      const first = await runCli(["commit", "scripts/answer.ts"], env, workspace);
      expect(first.exitCode).toBe(0);

      const secondSource =
        "return df.answer({ status: 'answered', value: 2, evidence: [{ ref: 'x' }], derivation: { operation: 'count' } })\n";
      await writeFile(path.join(workspace, "scripts", "answer.ts"), secondSource, "utf8");
      const second = await runCli(["commit", "scripts/answer.ts"], env, workspace);
      expect(second.exitCode).toBe(0);

      const commits = await readdir(path.join(workspace, "result", "commits"));
      expect(commits.sort()).toEqual(["001", "002"]);

      const head = JSON.parse(
        await readFile(path.join(workspace, "result", "HEAD.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(head).toMatchObject({
        commit: "002",
        trajectoryId: "traj_commit_2",
        intent: "count rows",
        sourceSnapshotPath: "source.ts",
        sourceHash: sha256Text(secondSource),
        reportPath: "report.md",
        observerDecisionLogPath: "observer/tenant-a/decisions.jsonl",
        replaySummaryPath: "tests/replay.txt",
        committedIntent: {
          name: "countRows2",
          parent: "count rows",
          relation: "derived",
        },
      });

      await expect(
        readFile(path.join(workspace, "result", "answer.json"), "utf8"),
      ).resolves.toContain('"value": 2');
      await expect(
        readFile(
          path.join(workspace, "result", "commits", "001", "answer.json"),
          "utf8",
        ),
      ).resolves.toContain('"value": 1');

      const replay = JSON.parse(
        await readFile(path.join(workspace, "result", "tests", "replay.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(replay).toMatchObject({
        kind: "workspace-head-replay",
        trajectoryId: "traj_commit_2",
        intent: "count rows",
        committedIntent: {
          name: "countRows2",
          parent: "count rows",
          relation: "derived",
        },
        sourceSnapshotPath: "source.ts",
        sourceHash: sha256Text(secondSource),
        expected: {
          intent: {
            name: "countRows2",
            parent: "count rows",
            relation: "derived",
          },
          status: "answered",
          value: 2,
          evidencePresent: true,
          derivationPresent: true,
          assumptionsPresent: false,
        },
        learning: {
          phase: "commit",
          crystallisable: true,
          mode: "interpreted",
          eligible: true,
          observerDecision: "not-recorded-in-workspace-response",
          observerDecisionLogPath: "observer/tenant-a/decisions.jsonl",
          callabilityAuthority: "hook-manifest",
        },
      });
      await expect(
        readFile(
          path.join(workspace, "result", "commits", "002", "tests", "replay.json"),
          "utf8",
        ),
      ).resolves.toContain('"trajectoryId": "traj_commit_2"');
      await expect(
        readFile(path.join(workspace, "result", "tests", "replay.txt"), "utf8"),
      ).resolves.toContain(`sourceHash: ${sha256Text(secondSource)}`);
      await expect(
        readFile(path.join(workspace, "result", "tests", "replay.txt"), "utf8"),
      ).resolves.toContain("observerDecision: not-recorded-in-workspace-response");
      await expect(
        readFile(path.join(workspace, "result", "tests", "replay.txt"), "utf8"),
      ).resolves.toContain("observerDecisionLog: observer/tenant-a/decisions.jsonl");
      await expect(
        readFile(path.join(workspace, "result", "report.md"), "utf8"),
      ).resolves.toContain("datafetch workspace report");
      await expect(
        readFile(path.join(workspace, "result", "report.md"), "utf8"),
      ).resolves.toContain(`sourceHash: ${sha256Text(secondSource)}`);
      await expect(
        readFile(path.join(workspace, "result", "report.md"), "utf8"),
      ).resolves.toContain("## Graph");
      await expect(
        readFile(path.join(workspace, "result", "report.md"), "utf8"),
      ).resolves.toContain("## Learning");
      await expect(
        readFile(path.join(workspace, "result", "report.md"), "utf8"),
      ).resolves.toContain("crystallisable: true");
      await expect(
        readFile(path.join(workspace, "result", "report.md"), "utf8"),
      ).resolves.toContain("observerDecision: not-recorded-in-workspace-response");
      await expect(
        readFile(path.join(workspace, "result", "report.md"), "utf8"),
      ).resolves.toContain("observerDecisionLog: observer/tenant-a/decisions.jsonl");
      await expect(
        readFile(path.join(workspace, "result", "report.md"), "utf8"),
      ).resolves.toContain("callabilityAuthority: hook-manifest");
      await expect(
        readFile(
          path.join(workspace, "result", "commits", "002", "tests", "replay.txt"),
          "utf8",
        ),
      ).resolves.toContain("sourceSnapshot: source.ts");
      await expect(
        readFile(path.join(workspace, "result", "commits", "002", "report.md"), "utf8"),
      ).resolves.toContain("accepted: true");

      const snapshot = JSON.parse(
        await readFile(path.join(workspace, "result", "workspace", "manifest.json"), "utf8"),
      ) as { files: Array<{ path: string }>; ignored?: unknown };
      const snapshotPaths = snapshot.files.map((f) => f.path);
      expect(snapshotPaths).toContain(".datafetchignore");
      expect(snapshotPaths).toContain("scripts/answer.ts");
      expect(snapshotPaths).toContain("lib/localHelper.ts");
      expect(snapshotPaths).toContain("lib/skills/pick_evidence.md");
      expect(snapshotPaths).not.toContain("tmp/debug.txt");
      expect(snapshotPaths).not.toContain(".env");
      expect(snapshotPaths).not.toContain("result/answer.json");
      await expect(
        readFile(
          path.join(workspace, "result", "workspace", "files", "lib", "localHelper.ts"),
          "utf8",
        ),
      ).resolves.toContain("localHelper");
      await expect(
        readFile(
          path.join(
            workspace,
            "result",
            "commits",
            "002",
            "workspace",
            "manifest.json",
          ),
          "utf8",
        ),
      ).resolves.toContain('"scripts/answer.ts"');

      await writeFile(
        path.join(workspace, "scripts", "answer.ts"),
        "console.log('plain rejection')\n",
        "utf8",
      );
      const rejected = await runCli(["commit", "scripts/answer.ts"], env, workspace);
      expect(rejected.exitCode).toBe(1);
      const afterRejectedHead = JSON.parse(
        await readFile(path.join(workspace, "result", "HEAD.json"), "utf8"),
      ) as Record<string, unknown>;
      expect(afterRejectedHead).toMatchObject({
        commit: "002",
        trajectoryId: "traj_commit_2",
      });
      await expect(
        readFile(path.join(workspace, "result", "answer.json"), "utf8"),
      ).resolves.toContain('"value": 2');
      await expect(
        readFile(path.join(workspace, "result", "validation.json"), "utf8"),
      ).resolves.toContain('"accepted": true');
      await expect(
        readFile(
          path.join(workspace, "result", "commits", "003", "validation.json"),
          "utf8",
        ),
      ).resolves.toContain('"accepted": false');
    });
  }, 30_000);

  it("creates real plan and execute artifacts through the server-backed CLI flow", async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), "df-cli-real-phase-"));
    tempDirs.push(baseDir);

    await withDatafetchServer(baseDir, async (serverUrl) => {
      const env = {
        ...process.env,
        DATAFETCH_SESSION: "",
        DATAFETCH_HOME: baseDir,
        DATAFETCH_SKIP_ENV_FILE: "1",
      };

      const session = await runCli(
        [
          "session",
          "new",
          "--tenant",
          "tenant-a",
          "--server",
          serverUrl,
          "--base-dir",
          baseDir,
          "--json",
        ],
        env,
      );
      expect(session.exitCode).toBe(0);

      const plan = await runCli(
        [
          "plan",
          "-e",
          "console.log('draft path')",
          "--server",
          serverUrl,
          "--base-dir",
          baseDir,
        ],
        env,
      );
      expect(plan.exitCode).toBe(0);
      const planEnvelope = parseEnvelope(plan.stdout);
      expect(planEnvelope).toMatchObject({
        phase: "plan",
        crystallisable: false,
        exitCode: 0,
      });
      const planDir = String(planEnvelope["artifactDir"]);
      await expect(readFile(path.join(planDir, "source.ts"), "utf8")).resolves.toContain(
        "draft path",
      );
      await expect(readFile(path.join(planDir, "result.json"), "utf8")).resolves.toContain(
        '"crystallisable": false',
      );

      const execute = await runCli(
        [
          "execute",
          "-e",
          "console.log('committed path')",
          "--server",
          serverUrl,
          "--base-dir",
          baseDir,
        ],
        env,
      );
      expect(execute.exitCode).toBe(0);
      const executeEnvelope = parseEnvelope(execute.stdout);
      expect(executeEnvelope).toMatchObject({
        phase: "execute",
        crystallisable: true,
        exitCode: 0,
      });
      const executeDir = String(executeEnvelope["artifactDir"]);
      await expect(readFile(path.join(executeDir, "execute.ts"), "utf8")).resolves.toContain(
        "committed path",
      );
      await expect(readFile(path.join(executeDir, "result.json"), "utf8")).resolves.toContain(
        '"crystallisable": true',
      );
    });
  }, 30_000);
});

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
