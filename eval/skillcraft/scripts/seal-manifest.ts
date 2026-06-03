// SaC-PoC B-1 — the sealed run-manifest emitter + dirty-tree gate.
//
// Build item B-1 from experiments/2026-06-sac-poc/KICKOFF.md. Written BEFORE the
// seed loop by run-sac-poc.sh. It is the foundation of the new verifier's
// process-validity predicates (RESEARCH-STRATEGY.md P1/P2/P3): a run is only
// verifiable if its code state was pinned to a clean git commit before any
// artifact was produced.
//
// Emits <out-root>/run-manifest.json with the git head, the working-tree
// cleanliness (scoped to CODE paths — run artifacts under runs/ etc. do not
// affect reproducibility), a config_hash single-sourced through
// armConfig+stableStringify, and the content SHAs of every code file that
// determines the run (runner, wrapper, arms module, scorer, normalizer).
//
// REFUSES to launch (exit 3) when the code tree is dirty, unless
// DATAFETCH_ALLOW_DIRTY=1 (local iteration only — the manifest then records
// dirtyTree=true and the verifier will reject the run). exit 2 on usage error.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { armConfig, stableStringify, SAC_ARMS, type SacArm } from "../../../src/eval/sacArms.js";

// Untracked files under these prefixes are CODE and make a run unreproducible.
// Untracked artifacts elsewhere (runs/, results/, experiments/, kb/) do not.
const CODE_PREFIXES = [
  "src/",
  "src/eval/",
  "eval/skillcraft/scripts/",
  "eval/skillcraft/probes/",
];

interface Args {
  outRoot: string | null;
  arms: string;
  seeds: number;
  families: string;
  reuseLevel: string;
  m0: string | null;
  model: string | null;
  live: boolean;
  prereg: string | null;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    outRoot: null,
    arms: "arm0,arm1,arm2,arm3,arm4,arm5a,arm5b",
    seeds: 5,
    families: "",
    reuseLevel: "h1",
    m0: null,
    model: null,
    live: false,
    prereg: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    const next = (): string => argv[++i] ?? "";
    if (k === "--out-root") a.outRoot = next();
    else if (k === "--arms") a.arms = next();
    else if (k === "--seeds") a.seeds = Number(next());
    else if (k === "--families") a.families = next();
    else if (k === "--reuse-level") a.reuseLevel = next();
    else if (k === "--m0") a.m0 = next();
    else if (k === "--model") a.model = next();
    else if (k === "--prereg") a.prereg = next();
    else if (k === "--live") a.live = true;
  }
  return a;
}

function repoRoot(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
}

function sha256OfFile(root: string, rel: string): string {
  return createHash("sha256").update(readFileSync(path.join(root, rel))).digest("hex");
}

function gitHead(root: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

// `git status --porcelain` lines; "??" prefix = untracked, anything else = a
// tracked modification/staging/deletion/rename.
function porcelain(root: string): string[] {
  return execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.length > 0);
}

function isCodeDirty(lines: string[]): { codeDirty: boolean; offending: string[] } {
  const offending: string[] = [];
  for (const line of lines) {
    const untracked = line.startsWith("??");
    const filePath = line.slice(3).trim();
    if (!untracked) {
      // Any tracked-file change is a reproducibility risk regardless of path.
      offending.push(line);
    } else if (CODE_PREFIXES.some((p) => filePath.startsWith(p))) {
      offending.push(line);
    }
  }
  return { codeDirty: offending.length > 0, offending };
}

function preregSha(root: string, rel: string | null): string | null {
  if (!rel) return null;
  try {
    // git blob hash of the committed file (stable id used by the verifier P1).
    return execFileSync("git", ["hash-object", rel], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!args.outRoot) {
    console.error("seal-manifest: --out-root is required");
    process.exit(2);
  }
  if (!args.families) {
    console.error("seal-manifest: --families is required");
    process.exit(2);
  }
  const root = repoRoot();

  // Validate + canonicalise the arm set; config_hash is single-sourced through
  // armConfig so any change to an arm's derivation changes the hash.
  const armIds = args.arms.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = armIds.filter((x) => !(SAC_ARMS as readonly string[]).includes(x));
  if (unknown.length > 0) {
    console.error(`seal-manifest: unknown arm(s): ${unknown.join(", ")}`);
    process.exit(2);
  }
  const armConfigs: Record<string, unknown> = {};
  for (const arm of armIds) armConfigs[arm] = armConfig(arm as SacArm);

  const seedList = Array.from({ length: Math.max(0, args.seeds) }, (_, i) => i + 1);
  const runConfig = {
    arms: [...armIds].sort(),
    seeds: args.seeds,
    seedList,
    families: args.families,
    reuseLevel: args.reuseLevel,
    m0: args.m0,
    model: args.model,
    live: args.live,
    armConfigs,
  };
  const configHash = createHash("sha256").update(stableStringify(runConfig)).digest("hex");

  const lines = porcelain(root);
  const { codeDirty, offending } = isCodeDirty(lines);
  const allowDirty = process.env["DATAFETCH_ALLOW_DIRTY"] === "1";
  const dirtyTree = codeDirty && !allowDirty ? true : codeDirty;

  const manifest = {
    schema: "sac-run-manifest/v1",
    generatedAt: new Date().toISOString(),
    gitHead: gitHead(root),
    dirtyTree: codeDirty,
    allowDirtyOverride: allowDirty,
    porcelain: lines,
    codeOffending: offending,
    configHash,
    preregSha: preregSha(root, args.prereg),
    shas: {
      runner: sha256OfFile(root, "src/eval/skillcraftFullDatafetch.ts"),
      wrapper: sha256OfFile(root, "eval/skillcraft/scripts/run-sac-poc.sh"),
      armsModule: sha256OfFile(root, "src/eval/sacArms.ts"),
      scorer: sha256OfFile(root, "eval/skillcraft/scripts/score-cross-arm.ts"),
      normalizer: sha256OfFile(root, "eval/skillcraft/scripts/normalize-results.ts"),
    },
    run: {
      arms: armIds,
      seeds: args.seeds,
      families: args.families,
      reuseLevel: args.reuseLevel,
      m0: args.m0,
      model: args.model,
      live: args.live,
    },
    seedList,
    armConfigs,
    dropReasons: [] as string[],
  };

  mkdirSync(args.outRoot, { recursive: true });
  const out = path.join(args.outRoot, "run-manifest.json");
  writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  if (codeDirty) {
    console.error(
      `seal-manifest: CODE TREE DIRTY (${offending.length} entr${offending.length === 1 ? "y" : "ies"}):`,
    );
    for (const o of offending) console.error(`  ${o}`);
    if (!allowDirty) {
      console.error(
        "seal-manifest: refusing to launch (exit 3). Commit/stash the above, or set DATAFETCH_ALLOW_DIRTY=1 for a non-verifiable local run.",
      );
      console.error(`wrote ${out} (dirtyTree=true)`);
      process.exit(3);
    }
    console.warn("seal-manifest: DATAFETCH_ALLOW_DIRTY=1 — proceeding; manifest records dirtyTree=true (NOT verifier-valid).");
  }
  console.log(`seal-manifest: wrote ${out}`);
  console.log(`  gitHead=${manifest.gitHead.slice(0, 12)} configHash=${configHash.slice(0, 12)} dirtyTree=${codeDirty} seeds=${args.seeds} arms=${armIds.length}`);
}

main();
