// iter 3.6: sweep stale helpers authored under older substrate versions.
//
// Scans `<datafetchHome>/lib/<tenantId>/` directories for *.ts files
// carrying an `@author: authorFromSource` header and an
// `@substrate-version: <sha>` stamp that does not match the current
// commit. Optionally removes them.
//
// Use:
//   tsx eval/finchain/scripts/sweep.ts --base <datafetch-home> [--apply]
//   tsx eval/finchain/scripts/sweep.ts --runs <out-dir> [--apply]
//
// `--base` points at a single datafetch-home (where lib/<tenant>/ lives).
// `--runs` points at a FinChain run output directory; the sweeper walks
// every `<runs>/datafetch-home/<family>/` it finds. Without `--apply`,
// the sweeper only reports what it would remove (dry-run by default —
// rollback is a privileged operation that must not surprise the operator).
//
// The current substrate version is taken from the current git HEAD sha or
// from `DATAFETCH_SUBSTRATE_VERSION` if set.

import { execFileSync } from "node:child_process";
import { promises as fsp } from "node:fs";
import path from "node:path";

interface Args {
  base?: string;
  runs?: string;
  apply: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--base") args.base = path.resolve(argv[++i]!);
    else if (arg.startsWith("--base=")) args.base = path.resolve(arg.slice("--base=".length));
    else if (arg === "--runs") args.runs = path.resolve(argv[++i]!);
    else if (arg.startsWith("--runs=")) args.runs = path.resolve(arg.slice("--runs=".length));
    else if (arg === "--apply") args.apply = true;
  }
  if (!args.base && !args.runs) {
    throw new Error("usage: sweep.ts (--base <datafetch-home> | --runs <run-out-dir>) [--apply]");
  }
  return args;
}

function currentSubstrateVersion(): string {
  if (process.env["DATAFETCH_SUBSTRATE_VERSION"]) {
    return process.env["DATAFETCH_SUBSTRATE_VERSION"]!.trim();
  }
  try {
    const out = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
    return out.trim();
  } catch {
    return "unknown";
  }
}

async function discoverLibDirs(args: Args): Promise<string[]> {
  const out: string[] = [];
  if (args.base) {
    const libRoot = path.join(args.base, "lib");
    try {
      const tenants = await fsp.readdir(libRoot, { withFileTypes: true });
      for (const t of tenants) {
        if (t.isDirectory() && !t.name.startsWith("__")) {
          out.push(path.join(libRoot, t.name));
        }
      }
    } catch {
      /* missing — emit nothing */
    }
  }
  if (args.runs) {
    const dfHomeRoot = path.join(args.runs, "datafetch-home");
    try {
      const families = await fsp.readdir(dfHomeRoot, { withFileTypes: true });
      for (const fam of families) {
        if (!fam.isDirectory()) continue;
        const libRoot = path.join(dfHomeRoot, fam.name, "lib");
        try {
          const tenants = await fsp.readdir(libRoot, { withFileTypes: true });
          for (const t of tenants) {
            if (t.isDirectory() && !t.name.startsWith("__")) {
              out.push(path.join(libRoot, t.name));
            }
          }
        } catch {
          /* skip */
        }
      }
    } catch {
      /* missing — emit nothing */
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const current = currentSubstrateVersion();
  const libDirs = await discoverLibDirs(args);
  if (libDirs.length === 0) {
    console.log("[sweep] no lib/<tenant>/ dirs found under the supplied roots");
    return;
  }
  console.log(`[sweep] current substrate version: ${current}`);
  console.log(`[sweep] scanning ${libDirs.length} tenant dir(s); mode=${args.apply ? "APPLY" : "dry-run"}`);
  let stale = 0;
  let kept = 0;
  let skipped = 0;
  for (const libDir of libDirs) {
    let entries: string[];
    try {
      entries = await fsp.readdir(libDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".ts")) continue;
      const filePath = path.join(libDir, entry);
      const src = await fsp.readFile(filePath, "utf8").catch(() => "");
      if (!src) continue;
      if (!/@author: authorFromSource/.test(src)) {
        skipped += 1;
        continue;
      }
      const m = src.match(/@substrate-version:\s*(\S+)/);
      const stamped = m?.[1] ?? "unknown";
      if (stamped === current) {
        kept += 1;
        continue;
      }
      console.log(`[sweep] stale (${stamped.slice(0, 12)} != ${current.slice(0, 12)}): ${filePath}`);
      stale += 1;
      if (args.apply) {
        await fsp.rm(filePath, { force: true });
      }
    }
  }
  console.log(
    `[sweep] summary: stale=${stale} kept=${kept} non-authorFromSource-skipped=${skipped} (mode=${args.apply ? "APPLY" : "dry-run"})`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
