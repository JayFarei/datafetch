// Compare substrate-on vs substrate-off arm results from
// runProductFlowMicroEval.ts and emit comparison.md + the P2 evidence
// bundle. Reads two `results.json` files and a defensive-evidence
// output directory.
//
// Usage:
//   pnpm tsx src/eval/productFlow/compareArms.ts \
//     --on eval/productFlow/results/p2-substrate-on-20260517 \
//     --off eval/productFlow/results/p2-substrate-off-20260517 \
//     --bundle-dir eval/productFlow/results/p2-defensive-evidence-20260517

import { promises as fsp } from "node:fs";
import path from "node:path";

interface EpisodeRow {
  id: string;
  promptBytes?: number;
  agentInputTokens?: number;
  agentCachedInputTokens?: number;
  agentOutputTokens?: number;
  effectiveTokens?: number;
  agentElapsedMs?: number;
  agentExitCode?: number;
  snippetExitCode?: number;
  trajectoryPrimitives?: string[];
  libCallsInTrajectory?: string[];
  answerCorrect?: boolean;
  answerExpected?: unknown;
  answerGot?: unknown;
  crystallisedHelperFiles?: string[];
}

interface ArmResults {
  arm: string;
  model: string;
  convergenceN?: number;
  tenantId: string;
  episodes: EpisodeRow[];
  outDir: string;
}

function parseArgs(argv: string[]): {
  onDir: string;
  offDir: string;
  bundleDir: string;
} {
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

async function readArm(dir: string): Promise<ArmResults> {
  const raw = await fsp.readFile(path.join(dir, "results.json"), "utf8");
  const parsed = JSON.parse(raw) as Omit<ArmResults, "outDir">;
  return { ...parsed, outDir: dir };
}

function sum(xs: Array<number | undefined>): number {
  return xs.reduce<number>((s, v) => s + (v ?? 0), 0);
}

function pct(num: number, den: number): string {
  if (den === 0) return "n/a";
  const v = ((num - den) / den) * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

async function main(): Promise<void> {
  const { onDir, offDir, bundleDir } = parseArgs(process.argv.slice(2));
  await fsp.mkdir(bundleDir, { recursive: true });

  const on = await readArm(onDir);
  const off = await readArm(offDir);

  const e = (arm: ArmResults, id: string): EpisodeRow | undefined =>
    arm.episodes.find((ep) => ep.id === id);

  const ids = ["e1", "e2", "e3"];
  const rows = ids.map((id) => {
    const a = e(on, id);
    const b = e(off, id);
    return { id, on: a, off: b };
  });

  const onWarmTokens = sum([
    e(on, "e2")?.effectiveTokens,
    e(on, "e3")?.effectiveTokens,
  ]);
  const offWarmTokens = sum([
    e(off, "e2")?.effectiveTokens,
    e(off, "e3")?.effectiveTokens,
  ]);

  const onCrystallised = new Set<string>();
  for (const ep of on.episodes) {
    for (const f of ep.crystallisedHelperFiles ?? []) onCrystallised.add(f);
  }
  const onWarmLibCalls = (e(on, "e2")?.libCallsInTrajectory ?? []).concat(
    e(on, "e3")?.libCallsInTrajectory ?? [],
  );

  const claim1 = onCrystallised.size >= 1;
  const claim3 = onWarmLibCalls.length >= 1;
  const claim4Delta = pct(onWarmTokens, offWarmTokens);
  const claim4Pass = onWarmTokens < offWarmTokens;
  const onCorrect = on.episodes.filter((ep) => ep.answerCorrect).length;
  const offCorrect = off.episodes.filter((ep) => ep.answerCorrect).length;
  const claim5OnOk = onCorrect >= 2;
  const claim5OffOk = offCorrect >= 2;

  const md: string[] = [];
  md.push(`# P2 — Cross-eval product-flow proof (jsonplaceholder)`);
  md.push(``);
  md.push(`Generated ${new Date().toISOString()}.`);
  md.push(``);
  md.push(`Substrate-on dir: \`${path.relative(process.cwd(), onDir)}\``);
  md.push(`Substrate-off dir: \`${path.relative(process.cwd(), offDir)}\``);
  md.push(`Model: \`${on.model}\`. Convergence N: ${on.convergenceN ?? "?"}.`);
  md.push(``);
  md.push(`## Headline (5 claims)`);
  md.push(``);
  md.push(`| Claim | Status | Evidence |`);
  md.push(`| --- | --- | --- |`);
  md.push(
    `| 1. Crystallisation (≥1 helper from e1 substrate-on) | ${
      claim1 ? "PASS" : "FAIL"
    } | files: ${[...onCrystallised].join(", ") || "(none)"} |`,
  );
  md.push(
    `| 2. Discovery (warm prompts free of helper names) | see Phase-4 verification.txt | warm e2/e3 prompts in this bundle |`,
  );
  md.push(
    `| 3. Reuse (≥1 \`df.lib.*\` call in warm trajectory) | ${
      claim3 ? "PASS" : "FAIL"
    } | warm calls: ${onWarmLibCalls.join(", ") || "(none)"} |`,
  );
  md.push(
    `| 4. Performance (warm cost on < off) | ${
      claim4Pass ? "PASS" : "FAIL/NEUTRAL"
    } | warm effective tokens: on=${onWarmTokens}, off=${offWarmTokens} (${claim4Delta}) |`,
  );
  md.push(
    `| 5. Correctness (both arms ≥ 2/3) | on=${onCorrect}/3 ${
      claim5OnOk ? "PASS" : "FAIL"
    }, off=${offCorrect}/3 ${claim5OffOk ? "PASS" : "FAIL"} | per-episode below |`,
  );
  md.push(``);
  md.push(`## Per-episode comparison`);
  md.push(``);
  md.push(
    `| ep | arm | effTokens | inTok | cachedIn | outTok | wallMs | correct | trajectory primitives | df.lib calls |`,
  );
  md.push(
    `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
  );
  for (const r of rows) {
    for (const [label, ep] of [
      ["on", r.on],
      ["off", r.off],
    ] as const) {
      if (!ep) {
        md.push(`| ${r.id} | ${label} | (missing) | | | | | | | |`);
        continue;
      }
      md.push(
        `| ${r.id} | ${label} | ${ep.effectiveTokens ?? "?"} | ${
          ep.agentInputTokens ?? "?"
        } | ${ep.agentCachedInputTokens ?? "?"} | ${
          ep.agentOutputTokens ?? "?"
        } | ${ep.agentElapsedMs ?? "?"} | ${
          ep.answerCorrect ? "yes" : "no"
        } | ${(ep.trajectoryPrimitives ?? []).join(", ")} | ${
          (ep.libCallsInTrajectory ?? []).join(", ") || "—"
        } |`,
      );
    }
  }
  md.push(``);
  md.push(`## Crystallised helpers (substrate-on)`);
  md.push(``);
  if (onCrystallised.size === 0) {
    md.push(`_no helpers crystallised_`);
  } else {
    for (const f of onCrystallised) {
      md.push(`- \`${f}\``);
    }
  }
  md.push(``);
  md.push(`## Per-episode answers`);
  md.push(``);
  for (const r of rows) {
    md.push(`### ${r.id}`);
    md.push(``);
    md.push(`**substrate-on** got: \`${JSON.stringify(r.on?.answerGot ?? null)}\``);
    md.push(`**substrate-off** got: \`${JSON.stringify(r.off?.answerGot ?? null)}\``);
    md.push(`**expected**: \`${JSON.stringify(r.on?.answerExpected ?? r.off?.answerExpected ?? null)}\``);
    md.push(``);
  }
  md.push(`## How to replay`);
  md.push(``);
  md.push("```");
  md.push(`pnpm tsx src/eval/productFlow/runProductFlowMicroEval.ts \\`);
  md.push(`  --arm substrate-on \\`);
  md.push(`  --out-dir ${path.relative(process.cwd(), onDir)}`);
  md.push(``);
  md.push(`pnpm tsx src/eval/productFlow/runProductFlowMicroEval.ts \\`);
  md.push(`  --arm substrate-off \\`);
  md.push(`  --out-dir ${path.relative(process.cwd(), offDir)}`);
  md.push(``);
  md.push(`pnpm tsx src/eval/productFlow/compareArms.ts \\`);
  md.push(`  --on ${path.relative(process.cwd(), onDir)} \\`);
  md.push(`  --off ${path.relative(process.cwd(), offDir)} \\`);
  md.push(`  --bundle-dir ${path.relative(process.cwd(), bundleDir)}`);
  md.push("```");

  await fsp.writeFile(path.join(bundleDir, "comparison.md"), `${md.join("\n")}\n`);
  console.log(`wrote ${path.join(bundleDir, "comparison.md")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
