// Build a markdown report from analysis.json + r1-r9-scorecard.json +
// (optional) finchain-scorecard.json. Mirrors
// eval/skillcraft/scripts/build-report.ts shape.

import { promises as fsp } from "node:fs";
import path from "node:path";

interface Args {
  runBase: string;
  out?: string;
}

function parseArgs(argv: string[]): Args {
  let runBase = "";
  let out: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (a === "--run-base") runBase = path.resolve(argv[++i]!);
    else if (a.startsWith("--run-base=")) runBase = path.resolve(a.slice("--run-base=".length));
    else if (a === "--out") out = path.resolve(argv[++i]!);
    else if (a.startsWith("--out=")) out = path.resolve(a.slice("--out=".length));
    else throw new Error(`unknown arg: ${a}`);
  }
  if (!runBase) throw new Error("required: --run-base <eval/finchain/results/datafetch/<label>>");
  return { runBase, out };
}

async function tryRead(p: string): Promise<unknown> {
  try {
    const raw = await fsp.readFile(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function fmtNum(v: unknown, digits = 4): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

function fmtPct(v: unknown): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function fmtMs(v: unknown): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return `${(v / 1000).toFixed(1)}s`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const analysis = (await tryRead(path.join(args.runBase, "analysis.json"))) as Record<string, any> | null;
  const scorecard = (await tryRead(path.join(args.runBase, "r1-r9-scorecard.json"))) as Record<string, any> | null;
  const finchainScorecard = (await tryRead(path.join(args.runBase, "finchain-scorecard.json"))) as Record<string, any> | null;

  const lines: string[] = [];
  lines.push(`# FinChain run report — \`${path.basename(args.runBase)}\``);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  if (analysis) {
    lines.push("## Arm aggregates");
    lines.push("");
    lines.push("| arm | episodes | passRate | avgEffectiveTokens | avgWallClock | runtimeErrorRate |");
    lines.push("|---|---|---|---|---|---|");
    for (const armId of ["datafetch-learned", "datafetch-control"] as const) {
      const a = analysis["arms"]?.[armId] ?? {};
      lines.push(
        `| ${armId} | ${a.episodes ?? "—"} | ${fmtPct(a.passRate)} | ${fmtNum(a.avgEffectiveTokens, 0)} | ${fmtMs(a.avgWallClockMs)} | ${fmtPct(a.runtimeErrorRate)} |`,
      );
    }
    lines.push("");
    const learned = analysis["arms"]?.["datafetch-learned"];
    if (learned?.perDifficulty) {
      lines.push("### Per-difficulty (datafetch-learned arm)");
      lines.push("");
      lines.push("| difficulty | episodes | passRate | avgEffectiveTokens |");
      lines.push("|---|---|---|---|");
      for (const [diff, agg] of Object.entries(learned.perDifficulty)) {
        const a = agg as any;
        lines.push(`| ${diff} | ${a.episodes ?? "—"} | ${fmtPct(a.passRate)} | ${fmtNum(a.avgEffectiveTokens, 0)} |`);
      }
      lines.push("");
    }
    if (learned?.perTier) {
      lines.push("### Per-level / tier (datafetch-learned arm)");
      lines.push("");
      lines.push("| level | episodes | passRate | avgEffectiveTokens | avgWallClock |");
      lines.push("|---|---|---|---|---|");
      for (const [tier, agg] of Object.entries(learned.perTier)) {
        const a = agg as any;
        lines.push(`| ${tier} | ${a.episodes ?? "—"} | ${fmtPct(a.passRate)} | ${fmtNum(a.avgEffectiveTokens, 0)} | ${fmtMs(a.avgWallClockMs)} |`);
      }
      lines.push("");
    }
  } else {
    lines.push("> analysis.json not present — run `pnpm eval:finchain:analyze --run-base <...>` first");
    lines.push("");
  }

  if (scorecard) {
    lines.push("## R1-R9 scorecard (from r1-r9-scorecard.json)");
    lines.push("");
    lines.push("| gate | value | threshold | pass |");
    lines.push("|---|---|---|---|");
    const r1 = scorecard["R1"]; lines.push(`| R1 passRate | ${fmtPct(r1?.passRate)} | ≥ ${fmtPct(r1?.threshold)} | ${r1?.pass ?? "—"} |`);
    const r2 = scorecard["R2"]; lines.push(`| R2 avgEffectiveTokens | ${fmtNum(r2?.avgEffectiveTokens, 0)} | ≤ ${r2?.threshold ?? "—"} | ${r2?.pass ?? "—"} |`);
    const r3 = scorecard["R3"]; lines.push(`| R3 runtimeErrorRate | ${fmtPct(r3?.runtimeErrorRate)} | ≤ ${fmtPct(r3?.threshold)} | ${r3?.pass ?? "—"} |`);
    const r4 = scorecard["R4"]; lines.push(`| R4 quarantineRate | ${fmtPct(r4?.quarantineRate)} | ≤ ${fmtPct(r4?.threshold)} | ${r4?.pass ?? "—"} |`);
    const r5 = scorecard["R5"]; lines.push(`| R5 novel-tenant smoke | ${r5?.novelTenantSmoke ?? "—"} | green | ${r5?.pass ?? "—"} |`);
    const r6 = scorecard["R6"]; lines.push(`| R6 convergence | ${fmtPct(r6?.convergenceRate)} | ≥ ${fmtPct(r6?.threshold)} | ${r6?.pass ?? "—"} |`);
    const r7 = scorecard["R7"]; lines.push(`| R7 conditional reuse | ${fmtPct(r7?.conditionalReuseRate)} | ≥ ${fmtPct(r7?.threshold)} | ${r7?.pass ?? "—"} |`);
    const r8 = scorecard["R8"]; lines.push(`| R8 mean / per-pair | ${fmtNum(r8?.meanPairedRatio)} / ${fmtPct(r8?.perPairPassFraction)} | ≤ 0.70 / ≥ 70% | ${r8?.pass ?? "—"} |`);
    const r9 = scorecard["R9"]; lines.push(`| R9 cross-shape | ${r9?.crossShapeTransfer ?? "—"} | ≥ 2 fams | ${r9?.pass ?? "—"} |`);
    lines.push("");
    lines.push(`**allPass:** ${scorecard["allPass"] ?? "—"}; **cacheBoundedByFramework:** ${scorecard["cacheBoundedByFramework"] ?? "—"}`);
    lines.push("");
  }

  if (finchainScorecard) {
    lines.push("## FinChain scorecard (FC1-FC5)");
    lines.push("");
    lines.push("See finchain-scorecard.json for the per-tier breakdown. Summary:");
    lines.push("");
    lines.push("| gate | pass |");
    lines.push("|---|---|");
    for (const k of ["fc1", "fc2", "fc3", "fc4", "fc5"]) {
      const v = finchainScorecard[k];
      lines.push(`| ${k.toUpperCase()} | ${v?.passes ?? v?.allPass ?? "—"} |`);
    }
    lines.push("");
  } else {
    lines.push("> finchain-scorecard.json not present — run `pnpm eval:finchain:score` (when score-finchain.ts lands in iter 3) to produce FC1-FC5.");
    lines.push("");
  }

  const out = args.out ?? path.join(args.runBase, "report.md");
  await fsp.writeFile(out, lines.join("\n"));
  console.log(`[report] wrote ${out}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
