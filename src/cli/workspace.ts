import { promises as fsp } from "node:fs";
import path from "node:path";

import { defaultBaseDir } from "../paths.js";

import { jsonRequest, resolveServerUrl } from "./httpClient.js";
import { readClientConfigSync } from "./clientConfig.js";
import { ensureCatalogSourceMounted } from "./catalog.js";
import { writeActiveSession, type SessionRecord } from "./session.js";
import {
  buildWorkspaceHead,
  hashSourceText,
  validationAccepted,
  writeCommitSnapshot,
  writeRunSnapshot,
  type WorkspaceSnippetResponse,
} from "./workspaceArtifacts.js";
import type { Flags } from "./types.js";
import {
  DEFAULT_DATAFETCHIGNORE,
  ensureDatafetchIgnore,
} from "./workspaceSnapshot.js";

type WorkspaceConfig = {
  version: 1;
  sessionId: string;
  tenantId: string;
  mountIds: string[];
  dataset: string;
  intent: string;
  baseDir: string;
  serverUrl: string;
  createdAt: string;
};

type SnippetResponse = WorkspaceSnippetResponse;

const DF_DTS_REFERENCE = '/// <reference path="../df.d.ts" />';

function flagString(flags: Flags, key: string): string | undefined {
  const v = flags[key];
  return typeof v === "string" ? v : undefined;
}

function jsonFlag(flags: Flags): boolean {
  return flags["json"] === true;
}

function serverUrlFromFlags(flags: Flags): string {
  return resolveServerUrl(flagString(flags, "server")).baseUrl;
}

function baseDirFromFlags(flags: Flags): string {
  const flag = flagString(flags, "base-dir");
  if (flag) return path.resolve(flag);
  const client = readClientConfigSync();
  if (client?.serverBaseDir) return client.serverBaseDir;
  return defaultBaseDir();
}

export async function cmdMount(
  positionals: string[],
  flags: Flags,
): Promise<void> {
  const tenant =
    flagString(flags, "tenant") ??
    process.env["DATAFETCH_TENANT"] ??
    readClientConfigSync()?.tenantId ??
    "local";
  const dataset =
    flagString(flags, "dataset") ?? flagString(flags, "mount") ?? positionals[0];
  const intent = flagString(flags, "intent");
  if (!dataset) throw new Error("mount: --dataset <id> is required");
  if (!intent) throw new Error("mount: --intent <text> is required");

  const baseDir = baseDirFromFlags(flags);
  const serverUrl = serverUrlFromFlags(flags);
  const workspacePath = path.resolve(
    flagString(flags, "path") ?? slugWorkspaceName(dataset, intent),
  );

  if (await pathExists(workspacePath)) {
    throw new Error(`mount: workspace already exists at ${workspacePath}`);
  }

  await ensureCatalogSourceMounted({ datasetId: dataset, flags });

  const record = await jsonRequest<SessionRecord>({
    method: "POST",
    path: "/v1/connect",
    serverUrl,
    body: { tenantId: tenant, mountIds: [dataset] },
  });
  await writeActiveSession(baseDir, record.sessionId);

  const config: WorkspaceConfig = {
    version: 1,
    sessionId: record.sessionId,
    tenantId: record.tenantId,
    mountIds: record.mountIds,
    dataset,
    intent,
    baseDir,
    serverUrl,
    createdAt: new Date().toISOString(),
  };

  await materialiseWorkspace({ root: workspacePath, config });

  if (jsonFlag(flags)) {
    process.stdout.write(
      `${JSON.stringify({ workspace: workspacePath, ...config })}\n`,
    );
    return;
  }
  process.stdout.write(`${workspacePath}\n`);
}

export async function cmdRun(
  positionals: string[],
  flags: Flags,
): Promise<void> {
  await runWorkspaceSnippet({
    positionals,
    flags,
    phase: "run",
    defaultScript: path.join("scripts", "scratch.ts"),
  });
}

export async function cmdCommit(
  positionals: string[],
  flags: Flags,
): Promise<void> {
  await runWorkspaceSnippet({
    positionals,
    flags,
    phase: "commit",
    defaultScript: path.join("scripts", "answer.ts"),
  });
}

async function materialiseWorkspace(args: {
  root: string;
  config: WorkspaceConfig;
}): Promise<void> {
  const { root, config } = args;
  await fsp.mkdir(path.join(root, ".datafetch"), { recursive: true });
  await fsp.mkdir(path.join(root, "scripts"), { recursive: true });
  await fsp.mkdir(path.join(root, "tmp", "runs"), { recursive: true });
  await fsp.mkdir(path.join(root, "result"), { recursive: true });
  await fsp.mkdir(path.join(root, "result", "commits"), { recursive: true });
  await fsp.mkdir(path.join(root, "result", "tests"), { recursive: true });
  await fsp.mkdir(path.join(config.baseDir, "lib", config.tenantId), {
    recursive: true,
  });

  await fsp.writeFile(
    path.join(root, ".datafetch", "workspace.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
  await ensureDatafetchIgnore(root);
  await writeAgentMemory(root, config);
  await copyIfExists(
    path.join(config.baseDir, "df.d.ts"),
    path.join(root, "df.d.ts"),
    fallbackManifest(config),
  );
  await linkOrMakeDir(
    path.join(config.baseDir, "mounts", config.dataset),
    path.join(root, "db"),
    `# db\n\nDataset mount \`${config.dataset}\` has not been materialised on disk yet.\n`,
  );
  await linkOrMakeDir(
    path.join(config.baseDir, "lib", config.tenantId),
    path.join(root, "lib"),
    "# lib\n\nTenant-local learned interfaces appear here.\n",
  );
  await writeScriptTemplates(root, config);
}

async function writeAgentMemory(
  root: string,
  config: WorkspaceConfig,
): Promise<void> {
  const sourceTemplate = path.join(
    config.baseDir,
    "sources",
    config.dataset,
    "templates",
    "AGENTS.md",
  );
  try {
    const template = await fsp.readFile(sourceTemplate, "utf8");
    const text = [
      "# datafetch intent workspace",
      "",
      `Intent: ${config.intent}`,
      `Tenant: ${config.tenantId}`,
      "",
      template.trimEnd(),
      "",
    ].join("\n");
    const agents = path.join(root, "AGENTS.md");
    await fsp.writeFile(agents, text, "utf8");
    try {
      await fsp.symlink("AGENTS.md", path.join(root, "CLAUDE.md"));
    } catch {
      await fsp.writeFile(path.join(root, "CLAUDE.md"), text, "utf8");
    }
    return;
  } catch {
    // Fall through to the generic template.
  }

  const lines = [
    "# datafetch intent workspace",
    "",
    `Intent: ${config.intent}`,
    `Tenant: ${config.tenantId}`,
    `Dataset: ${config.dataset}`,
    "",
    "Use this folder like a small TypeScript worktree around the mounted dataset.",
    "",
    "Important paths:",
    "- `df.d.ts` is the typed executable surface.",
    "- `db/` is read-only dataset context, descriptors, samples, and stats.",
    "- `lib/` is the tenant learned-interface surface.",
    "- `scripts/scratch.ts` is for exploratory code.",
    "- `scripts/answer.ts` is the visible intent program to commit.",
    "- `tmp/runs/N/` contains notebook-style outputs from `datafetch run`.",
    "- `result/` contains the current accepted answer from `datafetch commit`.",
    "- `result/commits/N/` is append-only commit history for this intent worktree.",
    "- `result/HEAD.json` points at the current accepted commit that supersedes earlier attempts.",
    "- Rejected commit attempts stay in `result/commits/N/` and do not replace the accepted `result/` view.",
    "- `result/source.ts` is the exact TypeScript source snapshot for the current accepted commit.",
    "- `result/graph.txt` is the readable read/compute/tool/write trajectory graph for the current accepted commit.",
    "- `result/report.md` is the readable aggregate report for the current accepted commit.",
    "- `result/tests/replay.json` is the replay test generated from the current HEAD.",
    "- `result/tests/replay.txt` is the readable replay summary for the current HEAD.",
    "- Observer learning decisions are append-only under the datafetch home at `observer/<tenant>/decisions.jsonl`; hook manifests remain the final callability authority.",
    "",
    "Code-native discovery:",
    "- Treat this workspace like a small codebase: use `ls`, `find`, `rg`, `cat`, TypeScript symbols, and LSP/IDE references when available.",
    "- `df.d.ts` is the source of truth for callable `df.db.*`, `df.tool.*`, `df.lib.*`, and `df.answer(...)` shapes.",
    "- Prefer reusing a matching `df.lib.*` workflow; compose directly from `df.db.*` or `df.tool.*` when no helper fits.",
    "- For helper code needed only by the current answer, write `scripts/helpers.ts` and import it from `scripts/answer.ts`; do not create nested `lib/<tenant>/...` paths inside this workspace.",
    "- Treat `lib/` as the mounted tenant library root. New durable `df.lib.*` callability comes from validated observer promotion plus hook manifests, not from assuming a fresh file is immediately callable.",
    "",
    "Namespace boundaries:",
    "- `df.db.*` is the mounted system/provider data surface for cold reads, search, sampling, and fallback composition.",
    "- `df.lib.*` is tenant-local TypeScript and the warm path for learned workflows visible in `df.d.ts`.",
    "- `df.tool.*` is a governed adapter bridge for explicit external tool catalogs.",
    "- `df.answer(...)` is the typed commit boundary for the final answer, evidence, derivation, and assumptions.",
    "",
    "Intent discipline:",
    "- Treat this folder's `Intent:` line as the worktree purpose.",
    "- If exploration produces a narrower useful sub-intent, keep it in `scripts/answer.ts` and mark the committed answer with `intent: { name, description, parent, relation }`.",
    "- Use `relation: \"same\"` when the answer directly satisfies the worktree intent, `\"derived\"` or `\"sibling\"` for useful sub-trajectories inside it, and `\"drifted\"` or `\"unrelated\"` when the worktree purpose changed.",
    "- Do not silently change the worktree purpose by answering a different question without that `intent` marker.",
    "",
    "Workflow:",
    "1. Inspect `df.d.ts`, `db/`, `lib/`, `datafetch apropos`, and `datafetch man`.",
    "2. Use `datafetch run scripts/scratch.ts` to sample and test ideas.",
    "3. Put the repeatable answer logic in `scripts/answer.ts`.",
    "4. `scripts/answer.ts` must return `df.answer(...)` with status, evidence, coverage, derivation, and assumptions when any uncertainty remains.",
    "5. Run `datafetch commit scripts/answer.ts` and answer from `result/answer.json`.",
    "",
    "The system only learns from committed visible code that passes validation.",
    "",
  ];
  const agents = path.join(root, "AGENTS.md");
  await fsp.writeFile(agents, lines.join("\n"), "utf8");
  try {
    await fsp.symlink("AGENTS.md", path.join(root, "CLAUDE.md"));
  } catch {
    await fsp.writeFile(path.join(root, "CLAUDE.md"), lines.join("\n"), "utf8");
  }
}

async function writeScriptTemplates(
  root: string,
  config: WorkspaceConfig,
): Promise<void> {
  const defaultIdent = await firstCollectionIdent(config);
  const templateDir = path.join(
    config.baseDir,
    "sources",
    config.dataset,
    "templates",
    "scripts",
  );
  await fsp.writeFile(
    path.join(root, "scripts", "helpers.ts"),
    [
      DF_DTS_REFERENCE,
      "export function range(values: number[]) {",
      "  return Math.max(...values) - Math.min(...values);",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
  await copyIfExists(
    path.join(templateDir, "scratch.ts"),
    path.join(root, "scripts", "scratch.ts"),
    [
      DF_DTS_REFERENCE,
      `const candidates = await df.db.${defaultIdent}.search(${JSON.stringify(config.intent)}, { limit: 10 });`,
      "console.log(JSON.stringify({ candidates: candidates.length }, null, 2));",
      "",
    ].join("\n"),
  );
  await copyIfExists(
    path.join(templateDir, "answer.ts"),
    path.join(root, "scripts", "answer.ts"),
    [
      DF_DTS_REFERENCE,
      "// Replace this with the visible, repeatable trajectory for the intent.",
      "// Commit will reject answers that do not return df.answer(...).",
      "return df.answer({",
      '  status: "unsupported",',
      "  evidence: [],",
      '  reason: "answer.ts has not been implemented yet",',
      "});",
      "",
    ].join("\n"),
  );
}

async function runWorkspaceSnippet(args: {
  positionals: string[];
  flags: Flags;
  phase: "run" | "commit";
  defaultScript: string;
}): Promise<void> {
  const workspace = await readWorkspace();
  const eFlag = flagString(args.flags, "e");
  let source: string;
  let sourcePath: string | undefined;
  if (eFlag !== undefined) {
    source = eFlag;
  } else {
    const requested = args.positionals[0] ?? args.defaultScript;
    sourcePath = path.resolve(workspace.root, requested);
    source = await fsp.readFile(sourcePath, "utf8");
  }

  const res = await jsonRequest<SnippetResponse>({
    method: "POST",
    path: "/v1/snippets",
    serverUrl: workspace.config.serverUrl,
    body: {
      sessionId: workspace.config.sessionId,
      source,
      phase: args.phase,
      ...(args.flags["telemetry"] === true ? { telemetry: true } : {}),
      ...(sourcePath !== undefined ? { sourcePath } : {}),
    },
  });

  await writeWorkspaceResult({
    root: workspace.root,
    phase: args.phase,
    source,
    sourcePath,
    response: res,
  });

  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  if (res.stdout && !res.stdout.endsWith("\n")) process.stdout.write("\n");
  process.stdout.write("--- envelope ---\n");
  process.stdout.write(`${JSON.stringify(res, null, 2)}\n`);
  process.exitCode = res.exitCode;
}

async function writeWorkspaceResult(args: {
  root: string;
  phase: "run" | "commit";
  source: string;
  sourcePath?: string;
  response: SnippetResponse;
}): Promise<void> {
  if (args.phase === "run") {
    const dir = await nextRunDir(path.join(args.root, "tmp", "runs"));
    await writeRunSnapshot({
      dir,
      source: args.source,
      response: args.response,
    });
    return;
  }

  const workspace = await readWorkspaceConfig(args.root);
  const resultDir = path.join(args.root, "result");
  const commitsRoot = path.join(resultDir, "commits");
  const commitDir = await nextRunDir(commitsRoot);
  const commitId = path.basename(commitDir);
  const sourceLabel =
    args.sourcePath === undefined
      ? "<inline>"
      : path.relative(args.root, args.sourcePath);
  const sourceHash = hashSourceText(args.source);
  await writeCommitSnapshot({
    root: args.root,
    dir: commitDir,
    commitId,
    sourceLabel,
    sourceHash,
    source: args.source,
    response: args.response,
    workspace,
  });

  if (validationAccepted(args.response.validation)) {
    // Keep result/* as the easy-to-read accepted HEAD view for the client
    // agent. Rejected attempts remain in result/commits/* for inspection.
    await writeCommitSnapshot({
      root: args.root,
      dir: resultDir,
      commitId,
      sourceLabel,
      sourceHash,
      source: args.source,
      response: args.response,
      workspace,
    });
    const head = buildWorkspaceHead({
      commitId,
      sourceLabel,
      sourceHash,
      response: args.response,
      workspace,
    });
    await fsp.writeFile(
      path.join(resultDir, "HEAD.json"),
      `${JSON.stringify(head, null, 2)}\n`,
      "utf8",
    );
  }
}

async function readWorkspaceConfig(root: string): Promise<WorkspaceConfig> {
  const raw = await fsp.readFile(
    path.join(root, ".datafetch", "workspace.json"),
    "utf8",
  );
  return JSON.parse(raw) as WorkspaceConfig;
}

async function readWorkspace(): Promise<{
  root: string;
  config: WorkspaceConfig;
}> {
  let dir = process.cwd();
  while (true) {
    const file = path.join(dir, ".datafetch", "workspace.json");
    try {
      const raw = await fsp.readFile(file, "utf8");
      return {
        root: dir,
        config: JSON.parse(raw) as WorkspaceConfig,
      };
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== "ENOENT") throw err;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("no datafetch workspace found; run `datafetch mount ...` first");
}

async function nextRunDir(root: string): Promise<string> {
  await fsp.mkdir(root, { recursive: true });
  let max = 0;
  for (const entry of await fsp.readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const n = Number(entry.name);
    if (Number.isInteger(n) && n > max) max = n;
  }
  return path.join(root, String(max + 1).padStart(3, "0"));
}

async function copyIfExists(
  source: string,
  target: string,
  fallback: string,
): Promise<void> {
  try {
    await fsp.copyFile(source, target);
  } catch {
    await fsp.writeFile(target, fallback, "utf8");
  }
}

// Re-exported for tests and for keeping the workspace template colocated with
// the rest of the mounted-folder materialisation contract.
export { DEFAULT_DATAFETCHIGNORE };

async function linkOrMakeDir(
  source: string,
  target: string,
  fallbackReadme: string,
): Promise<void> {
  if (await pathExists(source)) {
    try {
      await fsp.symlink(source, target, "dir");
      return;
    } catch {
      // Symlink may be unavailable on some filesystems; fall through.
    }
  }
  await fsp.mkdir(target, { recursive: true });
  await fsp.writeFile(path.join(target, "README.md"), fallbackReadme, "utf8");
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.stat(p);
    return true;
  } catch {
    return false;
  }
}

function slugWorkspaceName(dataset: string, intent: string): string {
  const stop = new Set(["what", "is", "the", "of", "a", "an", "between"]);
  const intentPart = intent
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0 && !stop.has(token))
    .slice(0, 8)
    .join("-");
  return `${dataset}-${intentPart || "intent"}`;
}

async function firstCollectionIdent(config: WorkspaceConfig): Promise<string> {
  const sourceManifest = await readJsonIfExists(
    path.join(config.baseDir, "sources", config.dataset, "manifest.json"),
  );
  const sourceIdent = collectionIdentFromRecord(sourceManifest);
  if (sourceIdent !== null) return sourceIdent;

  const mountInventory = await readJsonIfExists(
    path.join(config.baseDir, "mounts", config.dataset, "_inventory.json"),
  );
  const mountIdent = collectionIdentFromRecord(mountInventory);
  if (mountIdent !== null) return mountIdent;

  return "collection";
}

function collectionIdentFromRecord(value: unknown): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const collections = (value as { collections?: unknown }).collections;
  if (!Array.isArray(collections)) return null;
  for (const collection of collections) {
    if (
      collection !== null &&
      typeof collection === "object" &&
      !Array.isArray(collection)
    ) {
      const ident = (collection as { ident?: unknown }).ident;
      if (typeof ident === "string" && /^[A-Za-z_$][\w$]*$/.test(ident)) {
        return ident;
      }
    }
  }
  return null;
}

async function readJsonIfExists(file: string): Promise<unknown> {
  try {
    return JSON.parse(await fsp.readFile(file, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function fallbackManifest(config: WorkspaceConfig): string {
  return [
    "// datafetch manifest was not available when this workspace was mounted.",
    `// Tenant: ${config.tenantId}`,
    "declare const df: {",
    "  db: Record<string, unknown>;",
    "  lib: Record<string, (input: unknown) => Promise<unknown>>;",
    "  answer(input: unknown): unknown;",
    "};",
    "",
  ].join("\n");
}
