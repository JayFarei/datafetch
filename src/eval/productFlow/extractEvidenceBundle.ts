// Copy the per-episode artifacts from a substrate-on + substrate-off arm
// run into the defensive-evidence bundle laid out in the P2 spec.
//
// Inputs:
//   --on <on-arm out dir> --off <off-arm out dir> --bundle-dir <target>
//
// Reads:
//   <on>/episodes/eN/{prompt.txt, trajectory.json}
//   <on>/datafetch-home/df.d.ts (renamed before/after via a side-effect)
//   <on>/datafetch-home/lib/<tenantId>/*.ts
//
// Writes (into bundle-dir):
//   cold-prompt.md, warm-prompt-similar.md, warm-prompt-multihop.md
//   learned-helper.ts
//   df.d.ts.after
//   trajectory-arm-on-e{1,2,3}.json, trajectory-arm-off-e{1,2,3}.json

import { promises as fsp } from "node:fs";
import path from "node:path";

function parseArgs(argv: string[]): { onDir: string; offDir: string; bundleDir: string } {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    if (k === "--on") args.on = argv[++i];
    else if (k === "--off") args.off = argv[++i];
    else if (k === "--bundle-dir") args.bundleDir = argv[++i];
  }
  if (!args.on || !args.off || !args.bundleDir) {
    throw new Error("usage: --on <dir> --off <dir> --bundle-dir <dir>");
  }
  return {
    onDir: path.resolve(args.on),
    offDir: path.resolve(args.off),
    bundleDir: path.resolve(args.bundleDir),
  };
}

async function exists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyIfExists(src: string, dst: string): Promise<boolean> {
  if (!(await exists(src))) return false;
  await fsp.mkdir(path.dirname(dst), { recursive: true });
  await fsp.copyFile(src, dst);
  return true;
}

async function readJsonOrNull(p: string): Promise<unknown> {
  try {
    return JSON.parse(await fsp.readFile(p, "utf8")) as unknown;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const { onDir, offDir, bundleDir } = parseArgs(process.argv.slice(2));
  await fsp.mkdir(bundleDir, { recursive: true });

  // Prompts (from on arm; off arm differs only in the learned-interfaces
  // section, which is documented in comparison.md).
  const promptTargets: Array<[string, string]> = [
    ["e1", "cold-prompt.md"],
    ["e2", "warm-prompt-similar.md"],
    ["e3", "warm-prompt-multihop.md"],
  ];
  for (const [ep, dstName] of promptTargets) {
    const src = path.join(onDir, "episodes", ep, "prompt.txt");
    const dst = path.join(bundleDir, dstName);
    const ok = await copyIfExists(src, dst);
    if (!ok) console.warn(`[bundle] missing prompt: ${src}`);
  }

  // Also copy the substrate-off variants for full transparency
  for (const [ep, dstName] of [
    ["e1", "cold-prompt-arm-off.md"],
    ["e2", "warm-prompt-similar-arm-off.md"],
    ["e3", "warm-prompt-multihop-arm-off.md"],
  ] as const) {
    const src = path.join(offDir, "episodes", ep, "prompt.txt");
    const dst = path.join(bundleDir, dstName);
    await copyIfExists(src, dst);
  }

  // df.d.ts after (from datafetch-home root)
  const dtsSrc = path.join(onDir, "datafetch-home", "df.d.ts");
  await copyIfExists(dtsSrc, path.join(bundleDir, "df.d.ts.after"));

  // Learned helper(s) under <baseDir>/lib/<tenantId>/
  const tenantId = "productflow-jsonplaceholder";
  const libDir = path.join(onDir, "datafetch-home", "lib", tenantId);
  if (await exists(libDir)) {
    const entries = await fsp.readdir(libDir);
    const tsFiles = entries.filter((n) => n.endsWith(".ts"));
    if (tsFiles.length === 0) {
      await fsp.writeFile(
        path.join(bundleDir, "learned-helper.ts"),
        "// no helpers crystallised in this run\n",
      );
    } else {
      for (const [i, name] of tsFiles.entries()) {
        const dstName = tsFiles.length === 1 ? "learned-helper.ts" : `learned-helper-${i + 1}.ts`;
        await fsp.copyFile(path.join(libDir, name), path.join(bundleDir, dstName));
      }
    }
  } else {
    await fsp.writeFile(
      path.join(bundleDir, "learned-helper.ts"),
      `// lib/${tenantId}/ did not exist; substrate-on arm did not crystallise\n`,
    );
  }

  // Trajectories per episode per arm. Prefer the per-episode copy if present,
  // else find the latest in <baseDir>/trajectories/.
  for (const arm of ["on", "off"] as const) {
    const armDir = arm === "on" ? onDir : offDir;
    for (const ep of ["e1", "e2", "e3"]) {
      const candidate = path.join(armDir, "episodes", ep, "trajectory.json");
      const dst = path.join(bundleDir, `trajectory-arm-${arm}-${ep}.json`);
      const ok = await copyIfExists(candidate, dst);
      if (!ok) console.warn(`[bundle] missing trajectory: ${candidate}`);
    }
  }

  // Per-episode results summary (for inclusion in the bundle).
  const onRes = await readJsonOrNull(path.join(onDir, "results.json"));
  const offRes = await readJsonOrNull(path.join(offDir, "results.json"));
  await fsp.writeFile(
    path.join(bundleDir, "results-arm-on.json"),
    `${JSON.stringify(onRes, null, 2)}\n`,
  );
  await fsp.writeFile(
    path.join(bundleDir, "results-arm-off.json"),
    `${JSON.stringify(offRes, null, 2)}\n`,
  );

  console.log(`extracted evidence into ${bundleDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
