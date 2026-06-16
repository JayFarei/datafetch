import { createHash } from "node:crypto";
import { promises as fsp } from "node:fs";
import path from "node:path";

type Arm = "armN" | "armR" | "armL";

type Row = {
  suite: string;
  label: string;
  status: "completed";
  rowId: string;
  templateId: string;
  persona: string;
  difficulty: string;
  answerType: string;
  seed: number;
  arm: Arm;
  tokens: number;
  turns: number;
  correctVsGold: boolean | null;
};

type SliceScore = {
  name: string;
  rows: number;
  episodeCorrectRate: Record<Arm, number>;
  majorityCorrectRate: Record<Arm, number | null>;
  meanTokens: Record<Arm, number>;
  meanTurns: Record<Arm, number>;
  armLMinusArmN: number | null;
  armLMinusArmR: number | null;
};

const ARMS: Arm[] = ["armN", "armR", "armL"];

function parseArgs(argv: string[]) {
  const get = (name: string): string | null => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] ?? null : null;
  };
  const input = get("--input");
  if (!input) throw new Error("--input is required");
  return {
    input: path.resolve(input),
    out: path.resolve(get("--out") ?? path.dirname(input)),
    label: get("--label") ?? "ANALYSIS",
    expected: get("--expected") ? Number(get("--expected")) : null,
  };
}

async function readRows(input: string): Promise<Row[]> {
  return (await fsp.readFile(input, "utf8")).split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Row);
}

function correct(row: Row): number {
  return row.correctVsGold === true ? 1 : 0;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function byArm<T>(rows: Row[], fn: (rows: Row[]) => T): Record<Arm, T> {
  return Object.fromEntries(ARMS.map((arm) => [arm, fn(rows.filter((row) => row.arm === arm))])) as Record<Arm, T>;
}

function questionArmMajority(rows: Row[]): Map<string, number | null> {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = `${row.rowId}\t${row.arm}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const out = new Map<string, number | null>();
  for (const [key, group] of groups) {
    const positives = group.filter((row) => row.correctVsGold === true).length;
    if (positives > group.length / 2) out.set(key, 1);
    else if (positives === group.length / 2) out.set(key, null);
    else out.set(key, 0);
  }
  return out;
}

function majorityRate(rows: Row[], arm: Arm): number | null {
  const majority = questionArmMajority(rows.filter((row) => row.arm === arm));
  const values = [...majority.values()].filter((value): value is number => value !== null);
  return mean(values);
}

function pairedDiffs(rows: Row[], left: Arm, right: Arm): Array<{ rowId: string; templateId: string; diff: number }> {
  const majority = questionArmMajority(rows);
  const byQuestion = new Map<string, Row>();
  for (const row of rows) if (!byQuestion.has(row.rowId)) byQuestion.set(row.rowId, row);
  const out: Array<{ rowId: string; templateId: string; diff: number }> = [];
  for (const [rowId, sample] of byQuestion) {
    const l = majority.get(`${rowId}\t${left}`);
    const r = majority.get(`${rowId}\t${right}`);
    if (l === undefined || r === undefined || l === null || r === null) continue;
    out.push({ rowId, templateId: sample.templateId, diff: l - r });
  }
  return out.sort((a, b) => a.rowId.localeCompare(b.rowId));
}

function hashUnit(text: string): number {
  const hex = createHash("sha256").update(text).digest("hex").slice(0, 12);
  return Number.parseInt(hex, 16) / 0xffffffffffff;
}

function clusterBootstrapCi(diffs: Array<{ templateId: string; diff: number }>, seed: string): { mean: number | null; low: number | null; high: number | null; n: number } {
  if (diffs.length === 0) return { mean: null, low: null, high: null, n: 0 };
  const clusters = [...new Set(diffs.map((row) => row.templateId))].sort();
  const byCluster = new Map(clusters.map((cluster) => [cluster, diffs.filter((row) => row.templateId === cluster)]));
  const observed = mean(diffs.map((row) => row.diff));
  const draws: number[] = [];
  for (let i = 0; i < 2000; i++) {
    const sampled: number[] = [];
    for (let j = 0; j < clusters.length; j++) {
      const index = Math.floor(hashUnit(`${seed}:${i}:${j}`) * clusters.length) % clusters.length;
      sampled.push(...(byCluster.get(clusters[index]) ?? []).map((row) => row.diff));
    }
    const value = mean(sampled);
    if (value !== null) draws.push(value);
  }
  draws.sort((a, b) => a - b);
  return {
    mean: observed,
    low: draws[Math.floor(0.025 * (draws.length - 1))] ?? null,
    high: draws[Math.floor(0.975 * (draws.length - 1))] ?? null,
    n: diffs.length,
  };
}

function sliceScore(name: string, rows: Row[]): SliceScore {
  const majorityRates = byArm(rows, (armRows) => majorityRate(armRows, armRows[0]?.arm ?? "armN"));
  return {
    name,
    rows: rows.length,
    episodeCorrectRate: byArm(rows, (armRows) => mean(armRows.map(correct)) ?? 0),
    majorityCorrectRate: {
      armN: majorityRate(rows, "armN"),
      armR: majorityRate(rows, "armR"),
      armL: majorityRate(rows, "armL"),
    },
    meanTokens: byArm(rows, (armRows) => mean(armRows.map((row) => row.tokens)) ?? 0),
    meanTurns: byArm(rows, (armRows) => mean(armRows.map((row) => row.turns)) ?? 0),
    armLMinusArmN: majorityRates.armL !== null && majorityRates.armN !== null ? majorityRates.armL - majorityRates.armN : null,
    armLMinusArmR: majorityRates.armL !== null && majorityRates.armR !== null ? majorityRates.armL - majorityRates.armR : null,
  };
}

function allSlices(rows: Row[]): SliceScore[] {
  const slices: SliceScore[] = [sliceScore("all", rows)];
  slices.push(sliceScore("abstention rows", rows.filter((row) => row.answerType === "abstain")));
  for (const persona of [...new Set(rows.map((row) => row.persona))].sort()) {
    slices.push(sliceScore(`persona ${persona}`, rows.filter((row) => row.persona === persona)));
  }
  for (const difficulty of [...new Set(rows.map((row) => row.difficulty))].sort()) {
    slices.push(sliceScore(`difficulty ${difficulty}`, rows.filter((row) => row.difficulty === difficulty)));
  }
  return slices;
}

function fmt(value: number | null): string {
  return value === null ? "NA" : value.toFixed(4);
}

function renderReport(label: string, rows: Row[], summary: Record<string, unknown>, slices: SliceScore[]): string {
  const lines = [
    `# ${label} Score Report`,
    "",
    `Rows: ${rows.length}`,
    `Unique questions: ${new Set(rows.map((row) => row.rowId)).size}`,
    `Suites: ${[...new Set(rows.map((row) => row.suite))].join(", ")}`,
    "",
    "## Endpoints",
    "",
    `PRIMARY armL-armN majority diff: ${fmt(summary.primaryDiff as number | null)} CI [${fmt(summary.primaryCiLow as number | null)}, ${fmt(summary.primaryCiHigh as number | null)}]`,
    `CO-PRIMARY armL tokens below armN: ${summary.armLTokensBelowArmN}`,
    `CO-PRIMARY armL turns below armN: ${summary.armLTurnsBelowArmN}`,
    `CO-PRIMARY correctness non-inferior margin met: ${summary.nonInferiorCorrectness}`,
    `ATTRIBUTION armL-armR majority diff: ${fmt(summary.attributionDiff as number | null)} CI [${fmt(summary.attributionCiLow as number | null)}, ${fmt(summary.attributionCiHigh as number | null)}]`,
    `Callable-interface claim made: ${summary.callableInterfaceClaimMade}`,
    "",
    "## Slices",
    "",
    "| slice | rows | armN majority | armR majority | armL majority | L-N | L-R | armN tokens | armR tokens | armL tokens | armN turns | armR turns | armL turns |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...slices.map((slice) => [
      slice.name,
      String(slice.rows),
      fmt(slice.majorityCorrectRate.armN),
      fmt(slice.majorityCorrectRate.armR),
      fmt(slice.majorityCorrectRate.armL),
      fmt(slice.armLMinusArmN),
      fmt(slice.armLMinusArmR),
      fmt(slice.meanTokens.armN),
      fmt(slice.meanTokens.armR),
      fmt(slice.meanTokens.armL),
      fmt(slice.meanTurns.armN),
      fmt(slice.meanTurns.armR),
      fmt(slice.meanTurns.armL),
    ].join(" | ")).map((line) => `| ${line} |`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rows = await readRows(args.input);
  if (args.expected !== null && rows.length !== args.expected) {
    throw new Error(`expected ${args.expected} normalized rows, found ${rows.length}`);
  }
  const bad = rows.filter((row) => row.status !== "completed");
  if (bad.length > 0) throw new Error(`analysis set contains ${bad.length} incomplete/non-completed rows`);

  const primary = clusterBootstrapCi(pairedDiffs(rows, "armL", "armN"), "plan012-primary-ci-v1");
  const attribution = clusterBootstrapCi(pairedDiffs(rows, "armL", "armR"), "plan012-attribution-ci-v1");
  const meanTokens = byArm(rows, (armRows) => mean(armRows.map((row) => row.tokens)) ?? 0);
  const meanTurns = byArm(rows, (armRows) => mean(armRows.map((row) => row.turns)) ?? 0);
  const correctnessDiff = (majorityRate(rows, "armL") ?? 0) - (majorityRate(rows, "armN") ?? 0);
  const summary = {
    label: args.label,
    rows: rows.length,
    uniqueQuestions: new Set(rows.map((row) => row.rowId)).size,
    primaryDiff: primary.mean,
    primaryCiLow: primary.low,
    primaryCiHigh: primary.high,
    primaryCiExcludesZeroPositive: primary.low !== null && primary.low > 0,
    attributionDiff: attribution.mean,
    attributionCiLow: attribution.low,
    attributionCiHigh: attribution.high,
    attributionBeatsArmR: attribution.mean !== null && attribution.mean > 0,
    armLTokensBelowArmN: meanTokens.armL < meanTokens.armN,
    armLTurnsBelowArmN: meanTurns.armL < meanTurns.armN,
    correctnessDiff,
    nonInferiorCorrectness: correctnessDiff >= -0.05,
    callableInterfaceClaimMade:
      primary.low !== null && primary.low > 0 &&
      meanTokens.armL < meanTokens.armN &&
      meanTurns.armL < meanTurns.armN &&
      correctnessDiff >= -0.05 &&
      attribution.mean !== null && attribution.mean > 0,
    meanTokens,
    meanTurns,
  };
  const slices = allSlices(rows);
  await fsp.mkdir(args.out, { recursive: true });
  await fsp.writeFile(path.join(args.out, "score-summary.json"), JSON.stringify({ summary, slices }, null, 2) + "\n", "utf8");
  await fsp.writeFile(path.join(args.out, "score-report.md"), renderReport(args.label, rows, summary, slices), "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

await main();
