import { promises as fsp } from "node:fs";
import path from "node:path";

import {
  MountMode,
  RAMResource,
  Workspace,
  shlexSplit,
  type FileStat,
} from "@struktoai/mirage-node";

import {
  searchLibrary,
  describeLibraryFunction,
  renderManPage,
  type RankedFunction,
} from "../discovery/librarySearch.js";
import { defaultBaseDir } from "../paths.js";
import type { LibraryResolver } from "../sdk/index.js";
import {
  renderAgentsMd,
  renderPackageJson,
  renderRootReadme,
  renderSkillMd,
  type OrientationContext,
} from "./orientation.js";
import type { MountReader } from "./mountReader.js";
import type { SessionCtx, SnippetRuntime } from "./snippetRuntime.js";
import type { BashExecResult, BashLikeSession } from "./types.js";

export type MirageSessionInit = {
  tenantId: string;
  mountIds: string[];
  mountReader: MountReader;
  snippetRuntime: SnippetRuntime;
  libraryResolver: LibraryResolver | null;
  baseDir?: string;
  trajectoryId?: string;
};

type LoadedLib = {
  resource: RAMResource;
  libDir: string;
  initialMtimes: Map<string, string>;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class MirageSession implements BashLikeSession {
  readonly tenantId: string;
  readonly mountIds: string[];
  readonly baseDir: string;
  readonly trajectoryId?: string;

  private readonly mountReader: MountReader;
  private readonly snippetRuntime: SnippetRuntime;
  private readonly libraryResolver: LibraryResolver | null;
  private workspace: Workspace | null = null;
  private libResource: RAMResource | null = null;
  private libDir: string | null = null;
  private flushedMtimes = new Map<string, string>();
  private ready: Promise<void>;

  constructor(init: MirageSessionInit) {
    this.tenantId = init.tenantId;
    this.mountIds = init.mountIds;
    this.baseDir = init.baseDir ?? defaultBaseDir();
    if (init.trajectoryId !== undefined) this.trajectoryId = init.trajectoryId;
    this.mountReader = init.mountReader;
    this.snippetRuntime = init.snippetRuntime;
    this.libraryResolver = init.libraryResolver;
    this.ready = this.initialise();
  }

  async exec(command: string): Promise<BashExecResult> {
    await this.ready;
    const intercepted = await this.tryIntercept(command);
    if (intercepted) return intercepted;

    if (!this.workspace) {
      throw new Error("MirageSession: not initialised");
    }
    try {
      const result = await this.workspace.execute(`cd / && ${command}`);
      return {
        stdout: result.stdoutText,
        stderr: result.stderrText,
        exitCode: result.exitCode,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { stdout: "", stderr: `${message}\n`, exitCode: 1 };
    }
  }

  async flushLib(): Promise<void> {
    await this.ready;
    if (!this.workspace || !this.libResource || !this.libDir) return;
    const files = await this.listFiles("/lib");
    const toWrite: Array<{ vfsPath: string; onDisk: string; mtime: string }> = [];
    for (const file of files) {
      if (!file.endsWith(".ts") && !file.endsWith(".md")) continue;
      const st = await this.workspace.fs.stat(file);
      const mtime = st.modified ?? "";
      const last = this.flushedMtimes.get(file);
      if (last !== undefined && last >= mtime) continue;
      const rel = file.replace(/^\/lib\/?/, "");
      toWrite.push({ vfsPath: file, onDisk: path.join(this.libDir, rel), mtime });
    }
    if (toWrite.length === 0) return;
    await fsp.mkdir(this.libDir, { recursive: true });
    for (const job of toWrite) {
      const bytes = await this.workspace.fs.readFile(job.vfsPath);
      await fsp.mkdir(path.dirname(job.onDisk), { recursive: true });
      await fsp.writeFile(job.onDisk, bytes);
      this.flushedMtimes.set(job.vfsPath, job.mtime);
    }
  }

  sessionCtx(): SessionCtx {
    const ctx: SessionCtx = {
      tenantId: this.tenantId,
      mountIds: this.mountIds,
      baseDir: this.baseDir,
    };
    if (this.trajectoryId !== undefined) ctx.trajectoryId = this.trajectoryId;
    return ctx;
  }

  private async initialise(): Promise<void> {
    const root = new RAMResource();
    const lib = await this.buildLibResource();
    this.libResource = lib.resource;
    this.libDir = lib.libDir;
    for (const [vfsPath, mtime] of lib.initialMtimes) {
      this.flushedMtimes.set(vfsPath, mtime);
    }

    const ws = new Workspace({ "/": root, "/lib": lib.resource }, { mode: MountMode.WRITE });
    this.workspace = ws;
    await this.mkdirp("/db");
    await this.mkdirp("/tmp");
    await this.mkdirp("/usr/share/datafetch/skill");

    for (const mountId of this.mountIds) {
      await this.materialiseDbMount(ws, mountId);
    }

    const orientationCtx: OrientationContext = {
      tenantId: this.tenantId,
      mountIds: this.mountIds,
      libFunctions: await this.snapshotLibFunctions(),
    };
    const agentsMd = await this.readWorkspaceAgentsMd(orientationCtx);
    await this.writeText("/AGENTS.md", agentsMd);
    await this.writeText("/CLAUDE.md", agentsMd);
    await this.writeText("/README.md", renderRootReadme());
    await this.writeText("/package.json", renderPackageJson(orientationCtx));
    await this.writeText("/usr/share/datafetch/skill/SKILL.md", renderSkillMd());
  }

  private async buildLibResource(): Promise<LoadedLib> {
    const libDir = path.join(this.baseDir, "lib", this.tenantId);
    const resource = new RAMResource();
    const ws = new Workspace({ "/lib": resource }, { mode: MountMode.WRITE });
    const initialMtimes = new Map<string, string>();

    async function loadInto(vfsPath: string, diskPath: string): Promise<void> {
      const contents = await fsp.readFile(diskPath);
      await writeBytes(ws, vfsPath, contents);
      const st = await ws.fs.stat(vfsPath);
      initialMtimes.set(vfsPath, st.modified ?? "");
    }

    try {
      const entries = await fsp.readdir(libDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".ts")) {
          await loadInto(`/lib/${entry.name}`, path.join(libDir, entry.name));
        } else if (entry.isDirectory() && entry.name === "skills") {
          const skillsDir = path.join(libDir, "skills");
          const skills = await fsp.readdir(skillsDir, { withFileTypes: true });
          for (const skill of skills) {
            if (skill.isFile() && skill.name.endsWith(".md")) {
              await loadInto(
                `/lib/skills/${skill.name}`,
                path.join(skillsDir, skill.name),
              );
            }
          }
        }
      }
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== "ENOENT") throw err;
    } finally {
      await ws.close();
    }

    return { resource, libDir, initialMtimes };
  }

  private async materialiseDbMount(ws: Workspace, mountId: string): Promise<void> {
    const resource = new RAMResource();
    ws.addMount(`/db/${mountId}`, resource, MountMode.WRITE);

    try {
      await this.writeText(`/db/${mountId}/README.md`, await this.mountReader.readReadme(mountId));
    } catch {
      // No README. Continue.
    }

    let collections: string[];
    try {
      collections = await this.mountReader.listCollections(mountId);
    } catch {
      collections = [];
    }

    for (const coll of collections) {
      try {
        await this.writeText(
          `/db/${mountId}/${coll}.ts`,
          await this.mountReader.readModule(mountId, coll),
        );
      } catch {
        // No module. Continue.
      }
      try {
        await this.writeJson(
          `/db/${mountId}/${coll}/_descriptor.json`,
          await this.mountReader.readDescriptor(mountId, coll),
        );
      } catch {
        // No descriptor. Continue.
      }
      try {
        await this.writeJson(
          `/db/${mountId}/${coll}/_samples.json`,
          await this.mountReader.readSamples(mountId, coll),
        );
      } catch {
        // No samples. Continue.
      }
      try {
        await this.writeJson(
          `/db/${mountId}/${coll}/_stats.json`,
          await this.mountReader.readStats(mountId, coll),
        );
      } catch {
        // No stats. Continue.
      }
    }

    await ws.unmount(`/db/${mountId}`);
    ws.addMount(`/db/${mountId}`, resource, MountMode.READ);
  }

  private async tryIntercept(command: string): Promise<BashExecResult | null> {
    let args: string[];
    try {
      args = shlexSplit(command.trim());
    } catch {
      return null;
    }
    if (args.length === 0) return null;

    let cwd = "/";
    let commandArgs = args;
    if (args[0] === "cd" && args[2] === "&&" && args[1]) {
      cwd = args[1].startsWith("/") ? args[1] : path.posix.resolve("/", args[1]);
      commandArgs = args.slice(3);
      if (commandArgs.length === 0) return null;
    }

    if (commandArgs[0] === "npx" && (commandArgs[1] === "tsx" || commandArgs[1] === "ts-node")) {
      return this.runTsx(commandArgs.slice(2), cwd);
    }
    if (
      commandArgs[0] === "pnpm" &&
      commandArgs[1] === "exec" &&
      (commandArgs[2] === "tsx" || commandArgs[2] === "ts-node")
    ) {
      return this.runTsx(commandArgs.slice(3), cwd);
    }
    if (commandArgs[0] === "yarn" && (commandArgs[1] === "tsx" || commandArgs[1] === "ts-node")) {
      return this.runTsx(commandArgs.slice(2), cwd);
    }
    if (
      commandArgs[0] === "ls" &&
      commandArgs.slice(1).filter((arg) => !arg.startsWith("-")).length > 1
    ) {
      return this.runSplitLs(commandArgs.slice(1), cwd);
    }
    if (commandArgs[0] === "apropos") {
      return this.runApropos(commandArgs.slice(1));
    }
    if (commandArgs[0] === "man") {
      return this.runMan(commandArgs.slice(1));
    }
    return null;
  }

  private async runSplitLs(args: string[], cwd: string): Promise<BashExecResult> {
    if (!this.workspace) throw new Error("MirageSession: not initialised");
    const options = args.filter((arg) => arg.startsWith("-"));
    const paths = args.filter((arg) => !arg.startsWith("-"));
    let stdout = "";
    let stderr = "";
    let exitCode = 0;
    for (const [index, target] of paths.entries()) {
      const result = await this.workspace.execute(
        `cd ${shellQuote(cwd)} && ls ${[...options, target].map(shellQuote).join(" ")}`,
      );
      if (paths.length > 1) {
        if (index > 0) stdout += "\n";
        stdout += `${target}:\n`;
      }
      stdout += result.stdoutText;
      stderr += result.stderrText;
      if (result.exitCode !== 0) exitCode = result.exitCode;
    }
    return { stdout, stderr, exitCode };
  }

  private async runTsx(args: string[], cwd: string): Promise<BashExecResult> {
    if (args.length === 0) return { stdout: "", stderr: "tsx: no script provided\n", exitCode: 1 };
    const first = args[0]!;
    let source: string;
    if (first === "-e") {
      if (args.length < 2) return { stdout: "", stderr: "tsx -e: missing snippet\n", exitCode: 1 };
      source = args.slice(1).join(" ");
    } else if (first === "-") {
      return {
        stdout: "",
        stderr: "tsx -: stdin is not supported by the Mirage runtime yet\n",
        exitCode: 1,
      };
    } else {
      const file = first.startsWith("/") ? first : path.posix.resolve(cwd, first);
      try {
        source = await this.readText(file);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { stdout: "", stderr: `tsx: cannot read ${file}: ${msg}\n`, exitCode: 1 };
      }
    }

    try {
      await this.flushLib();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { stdout: "", stderr: `tsx: failed to flush /lib/ before snippet: ${msg}\n`, exitCode: 1 };
    }
    return this.snippetRuntime.run({ source, sessionCtx: this.sessionCtx() });
  }

  private async runApropos(args: string[]): Promise<BashExecResult> {
    if (args.length === 0) return { stdout: "", stderr: "apropos what?\n", exitCode: 1 };
    if (!this.libraryResolver) return { stdout: "(no matches above 0.5)\n", stderr: "", exitCode: 0 };
    try {
      const scored = await searchLibrary({
        baseDir: this.baseDir,
        tenantId: this.tenantId,
        resolver: this.libraryResolver,
        query: args.join(" "),
      });
      return { stdout: renderMatches(scored), stderr: "", exitCode: 0 };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { stdout: "", stderr: `apropos: error listing /lib/: ${msg}\n`, exitCode: 1 };
    }
  }

  private async runMan(args: string[]): Promise<BashExecResult> {
    const name = args[0];
    if (!name) {
      return {
        stdout: "",
        stderr: "What manual page do you want?\nFor example, try 'man man'.\n",
        exitCode: 1,
      };
    }
    if (!this.libraryResolver) return { stdout: "", stderr: `No manual entry for ${name}\n`, exitCode: 1 };
    try {
      const entry = await describeLibraryFunction({
        baseDir: this.baseDir,
        tenantId: this.tenantId,
        resolver: this.libraryResolver,
        name,
      });
      if (!entry) return { stdout: "", stderr: `No manual entry for ${name}\n`, exitCode: 1 };
      return { stdout: renderManPage(entry), stderr: "", exitCode: 0 };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { stdout: "", stderr: `man: error resolving ${name}: ${msg}\n`, exitCode: 1 };
    }
  }

  private async listFiles(root: string): Promise<string[]> {
    if (!this.workspace) return [];
    const files: string[] = [];
    const entries = await this.workspace.fs.readdir(root);
    for (const entry of entries) {
      const st = await this.workspace.fs.stat(entry);
      if (isDirectory(st)) {
        files.push(...(await this.listFiles(entry)));
      } else {
        files.push(entry);
      }
    }
    return files;
  }

  private async snapshotLibFunctions(): Promise<string[]> {
    if (!this.workspace) return [];
    try {
      const entries = await this.workspace.fs.readdir("/lib");
      return entries
        .map((p) => path.basename(p))
        .filter((n) => n.endsWith(".ts"))
        .map((n) => n.slice(0, -3))
        .sort();
    } catch {
      return [];
    }
  }

  private async readWorkspaceAgentsMd(ctx: OrientationContext): Promise<string> {
    try {
      return await fsp.readFile(path.join(this.baseDir, "AGENTS.md"), "utf8");
    } catch {
      return renderAgentsMd(ctx);
    }
  }

  private async mkdirp(filePath: string): Promise<void> {
    if (!this.workspace) throw new Error("MirageSession: workspace not initialised");
    const result = await this.workspace.execute(`mkdir -p ${shellQuote(filePath)}`);
    if (result.exitCode !== 0) throw new Error(result.stderrText || result.stdoutText);
  }

  private async writeText(filePath: string, content: string): Promise<void> {
    if (!this.workspace) throw new Error("MirageSession: workspace not initialised");
    await writeBytes(this.workspace, filePath, textEncoder.encode(content));
  }

  private async writeJson(filePath: string, value: unknown): Promise<void> {
    await this.writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
  }

  private async readText(filePath: string): Promise<string> {
    if (!this.workspace) throw new Error("MirageSession: workspace not initialised");
    return textDecoder.decode(await this.workspace.fs.readFile(filePath));
  }
}

async function writeBytes(ws: Workspace, filePath: string, bytes: Uint8Array): Promise<void> {
  const dir = path.posix.dirname(filePath);
  if (dir !== "/" && dir !== ".") {
    const result = await ws.execute(`mkdir -p ${shellQuote(dir)}`);
    if (result.exitCode !== 0) throw new Error(result.stderrText || result.stdoutText);
  }
  await ws.fs.writeFile(filePath, bytes);
}

function isDirectory(st: FileStat): boolean {
  return st.type === "directory";
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function renderMatches(matches: RankedFunction[]): string {
  if (matches.length === 0) return "(no matches above 0.5)\n";
  const maxName = Math.min(
    24,
    matches.reduce((m, x) => Math.max(m, x.name.length), 0),
  );
  return `${matches
    .map((m) => `${m.name.padEnd(maxName, " ")} (${m.kind}) - ${m.intent}`)
    .join("\n")}\n`;
}
