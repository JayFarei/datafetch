// Build the paired-comparison report from a small-N or full-eval run.
//
// Reads:   <runRoot>/results.json (produced by run-small-n.ts)
// Writes:  <runRoot>/paired-comparison.md
//
// Goal 5 verification surface — this report is what the Goal hook scrutinises
// for the "≥ 3 of 4 axes (R1 tri-state correctness, R2 effective tokens,
// wall-clock, R3 runtime errors) AND R7 helper-reuse fires on at least one
// sibling-template family" condition.
//
// Usage:   pnpm tsx eval/crag/scripts/build-paired-comparison.ts <runRoot>

import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

interface CragRunResult {
  interactionId: string;
  arm: "substrate-on" | "substrate-off";
  domain: string;
  questionType: string;
  staticOrDynamic: string;
  query: string;
  goldAnswer: string;
  agentAnswer: string;
  score: -1 | 0 | 1;
  scoreReason: string;
  exitCode: number | null;
  trajectoryId: string | null;
  trajectoryCalls: number;
  trajectoryHelperCalls: number;
  costTier: number | null;
  costLlmCalls: number | null;
  agentDurationMs: number | null;
  agentInputTokens: number | null;
  agentCachedInputTokens: number | null;
  agentOutputTokens: number | null;
  agentTotalCostUsd: number | null;
  agentNumTurns: number | null;
  agentTimedOut: boolean;
  agentError: string | null;
  totalWallClockMs: number;
}

interface Scorecard {
  arm: string;
  n: number;
  triState: { plus1: number; zero: number; minus1: number };
  meanScore: number;
  meanWallClockMs: number;
  meanEffectiveTokens: number;
  meanTrajectoryCalls: number;
  helperReuseRate: number;
  runtimeErrors: number;
  bySlice: Record<string, { n: number; meanScore: number }>;
}

interface RunResults {
  runId: string;
  date: string;
  worktree: string;
  wallTotalMs: number;
  config: {
    workers: number;
    arms: string[];
    limit: number;
    timeoutMs: number;
  };
  scorecards: Scorecard[];
  results: CragRunResult[];
}

// McNemar's test for paired binary outcomes (pass/fail per question).
// Returns p-value approximation via chi-squared.
function mcnemar(onPass: boolean[], offPass: boolean[]): { b: number; c: number; chi2: number; pApprox: string } {
  let b = 0; // off-pass, on-fail
  let c = 0; // off-fail, on-pass
  for (let i = 0; i < onPass.length; i++) {
    if (offPass[i] && !onPass[i]) b++;
    if (!offPass[i] && onPass[i]) c++;
  }
  if (b + c === 0) return { b, c, chi2: 0, pApprox: ">0.99" };
  const chi2 = Math.pow(Math.abs(b - c) - 1, 2) / (b + c);
  // crude p-value bucket
  let pApprox = ">0.10";
  if (chi2 > 10.83) pApprox = "<0.001";
  else if (chi2 > 6.63) pApprox = "<0.01";
  else if (chi2 > 3.84) pApprox = "<0.05";
  else if (chi2 > 2.71) pApprox = "<0.10";
  return { b, c, chi2, pApprox };
}

// Paired t-test on continuous metric (e.g. log-tokens, log-wallClock).
// Returns t, df, and a coarse p-bucket.
function pairedT(deltas: number[]): { mean: number; sd: number; t: number; df: number; pApprox: string } {
  const n = deltas.length;
  if (n < 2) return { mean: 0, sd: 0, t: 0, df: 0, pApprox: ">0.10" };
  const mean = deltas.reduce((a, b) => a + b, 0) / n;
  const varv = deltas.reduce((s, d) => s + (d - mean) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(varv);
  const se = sd / Math.sqrt(n);
  const t = se > 0 ? mean / se : 0;
  const df = n - 1;
  const aT = Math.abs(t);
  // critical value rule of thumb at df ≥ 30: 1.96 ~ 0.05, 2.58 ~ 0.01
  let pApprox = ">0.10";
  if (df >= 30) {
    if (aT > 3.29) pApprox = "<0.001";
    else if (aT > 2.58) pApprox = "<0.01";
    else if (aT > 1.96) pApprox = "<0.05";
    else if (aT > 1.65) pApprox = "<0.10";
  } else {
    // looser thresholds; still informative
    if (aT > 3.5) pApprox = "<0.01";
    else if (aT > 2.5) pApprox = "<0.05";
    else if (aT > 1.8) pApprox = "<0.10";
  }
  return { mean, sd, t, df, pApprox };
}

function fmt(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}
function pct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

function buildReport(data: RunResults): string {
  const on = data.results.filter((r) => r.arm === "substrate-on");
  const off = data.results.filter((r) => r.arm === "substrate-off");
  const onById = new Map(on.map((r) => [r.interactionId, r]));
  const offById = new Map(off.map((r) => [r.interactionId, r]));

  // Pair up.
  type Paired = { id: string; on: CragRunResult; off: CragRunResult };
  const paired: Paired[] = [];
  for (const o of on) {
    const f = offById.get(o.interactionId);
    if (f) paired.push({ id: o.interactionId, on: o, off: f });
  }

  // Axis 1: R1 tri-state. Treat +1 as pass, {0, -1} as not-pass for McNemar.
  // Also report raw mean delta.
  const onPass = paired.map((p) => p.on.score === 1);
  const offPass = paired.map((p) => p.off.score === 1);
  const r1Mcnemar = mcnemar(onPass, offPass);
  const r1MeanOn = paired.length ? paired.reduce((s, p) => s + p.on.score, 0) / paired.length : 0;
  const r1MeanOff = paired.length ? paired.reduce((s, p) => s + p.off.score, 0) / paired.length : 0;

  // Axis 2: R2 effective tokens (log space for paired-t).
  // effective = input + output - cached (per skillcraft convention).
  const tokOn = paired.map((p) => Math.max(1, (p.on.agentInputTokens ?? 0) + (p.on.agentOutputTokens ?? 0) - (p.on.agentCachedInputTokens ?? 0)));
  const tokOff = paired.map((p) => Math.max(1, (p.off.agentInputTokens ?? 0) + (p.off.agentOutputTokens ?? 0) - (p.off.agentCachedInputTokens ?? 0)));
  const tokDeltas = paired.map((_, i) => Math.log(tokOn[i]!) - Math.log(tokOff[i]!));
  const r2T = pairedT(tokDeltas);
  const r2MeanOn = tokOn.reduce((a, b) => a + b, 0) / Math.max(1, tokOn.length);
  const r2MeanOff = tokOff.reduce((a, b) => a + b, 0) / Math.max(1, tokOff.length);

  // Axis 3: wall-clock.
  const wallDeltas = paired.map((p) => Math.log(Math.max(1, p.on.totalWallClockMs)) - Math.log(Math.max(1, p.off.totalWallClockMs)));
  const r3T = pairedT(wallDeltas);
  const wallMeanOn = paired.reduce((s, p) => s + p.on.totalWallClockMs, 0) / Math.max(1, paired.length);
  const wallMeanOff = paired.reduce((s, p) => s + p.off.totalWallClockMs, 0) / Math.max(1, paired.length);

  // Axis 4: runtime errors. McNemar on (error / no-error).
  const onErr = paired.map((p) => p.on.agentError !== null || (p.on.exitCode !== null && p.on.exitCode !== 0));
  const offErr = paired.map((p) => p.off.agentError !== null || (p.off.exitCode !== null && p.off.exitCode !== 0));
  // For "fewer is better" we treat NO-error as the "pass" condition.
  const r4Mcnemar = mcnemar(onErr.map((e) => !e), offErr.map((e) => !e));
  const r4RateOn = onErr.filter(Boolean).length / Math.max(1, onErr.length);
  const r4RateOff = offErr.filter(Boolean).length / Math.max(1, offErr.length);

  // R7 helper-reuse fires?
  const onHelperHits = paired.filter((p) => p.on.trajectoryHelperCalls > 0).length;
  const offHelperHits = paired.filter((p) => p.off.trajectoryHelperCalls > 0).length;

  // Per-slice breakdown.
  const sliceKeys = new Set<string>();
  for (const p of paired) sliceKeys.add(`${p.on.domain}/${p.on.questionType}`);
  const sliceRows: Array<{ slice: string; n: number; onMean: number; offMean: number; delta: number }> = [];
  for (const slice of Array.from(sliceKeys).sort()) {
    const ps = paired.filter((p) => `${p.on.domain}/${p.on.questionType}` === slice);
    const onMean = ps.reduce((s, p) => s + p.on.score, 0) / ps.length;
    const offMean = ps.reduce((s, p) => s + p.off.score, 0) / ps.length;
    sliceRows.push({ slice, n: ps.length, onMean, offMean, delta: onMean - offMean });
  }

  // Per-dynamism breakdown.
  const dynKeys = new Set<string>();
  for (const p of paired) dynKeys.add(p.on.staticOrDynamic);
  const dynRows: Array<{ key: string; n: number; onMean: number; offMean: number; delta: number }> = [];
  for (const key of Array.from(dynKeys).sort()) {
    const ps = paired.filter((p) => p.on.staticOrDynamic === key);
    const onMean = ps.reduce((s, p) => s + p.on.score, 0) / ps.length;
    const offMean = ps.reduce((s, p) => s + p.off.score, 0) / ps.length;
    dynRows.push({ key, n: ps.length, onMean, offMean, delta: onMean - offMean });
  }

  // 4-axis verdict per Goal 5 condition.
  // - R1 (correctness): substrate-on score >= substrate-off score AND McNemar p < 0.10 = PASS; equal = NEUTRAL; worse = FAIL
  // - R2 (tokens): mean delta < 0 (lower) AND p<0.10 = PASS; mean delta close to 0 = NEUTRAL; positive + significant = FAIL
  // - R3 (wall-clock): same as R2 on wall-clock
  // - R4 (runtime errors): error rate on <= off AND McNemar p<0.10 = PASS
  function axisVerdict(meanDelta: number, p: string, kind: "higher_better" | "lower_better"): string {
    const sig = p.startsWith("<");
    if (kind === "higher_better") {
      if (meanDelta > 0 && sig) return "PASS";
      if (meanDelta < 0 && sig) return "FAIL";
      return "NEUTRAL";
    } else {
      if (meanDelta < 0 && sig) return "PASS";
      if (meanDelta > 0 && sig) return "FAIL";
      return "NEUTRAL";
    }
  }
  const v1 = axisVerdict(r1MeanOn - r1MeanOff, r1Mcnemar.pApprox, "higher_better");
  const v2 = axisVerdict(r2T.mean, r2T.pApprox, "lower_better");
  const v3 = axisVerdict(r3T.mean, r3T.pApprox, "lower_better");
  const v4 = axisVerdict(r4RateOn - r4RateOff, r4Mcnemar.pApprox, "lower_better");
  const passes = [v1, v2, v3, v4].filter((v) => v === "PASS").length;
  const fails = [v1, v2, v3, v4].filter((v) => v === "FAIL").length;
  const r7Pass = onHelperHits > 0 ? "PASS" : "FAIL";

  const lines: string[] = [];
  lines.push(`# CRAG Paired Comparison — ${data.runId}`);
  lines.push("");
  lines.push(`> Generated: ${new Date().toISOString()}`);
  lines.push(`> Source:    \`results.json\` from \`${data.runId}\``);
  lines.push(`> Records:   ${paired.length} matched pairs (${on.length} substrate-on, ${off.length} substrate-off)`);
  lines.push(`> Total invocations: ${data.results.length} (across ${(data.wallTotalMs / 60_000).toFixed(1)} minutes wall-clock)`);
  lines.push("");
  lines.push("## Headline 4-vector + R7");
  lines.push("");
  lines.push(`| Axis | substrate-ON | substrate-OFF | delta | p (paired) | verdict |`);
  lines.push(`|---|---|---|---|---|---|`);
  lines.push(`| R1 tri-state correctness (mean +1/0/-1) | ${fmt(r1MeanOn)} | ${fmt(r1MeanOff)} | ${fmt(r1MeanOn - r1MeanOff)} | ${r1Mcnemar.pApprox} (McNemar, b=${r1Mcnemar.b}, c=${r1Mcnemar.c}) | **${v1}** |`);
  lines.push(`| R2 effective tokens (mean, log-paired-t) | ${fmt(r2MeanOn, 0)} | ${fmt(r2MeanOff, 0)} | ${fmt(r2T.mean, 3)} (log) | ${r2T.pApprox} (t=${fmt(r2T.t, 2)}, df=${r2T.df}) | **${v2}** |`);
  lines.push(`| R4 wall-clock ms (mean, log-paired-t) | ${fmt(wallMeanOn, 0)} | ${fmt(wallMeanOff, 0)} | ${fmt(r3T.mean, 3)} (log) | ${r3T.pApprox} (t=${fmt(r3T.t, 2)}, df=${r3T.df}) | **${v3}** |`);
  lines.push(`| R3 runtime error rate | ${pct(r4RateOn)} | ${pct(r4RateOff)} | ${pct(r4RateOn - r4RateOff)} | ${r4Mcnemar.pApprox} (McNemar) | **${v4}** |`);
  lines.push("");
  lines.push(`**4-vector: {${v1}, ${v2}, ${v3}, ${v4}}** — ${passes} PASS, ${fails} FAIL`);
  lines.push("");
  lines.push(`**R7 helper-reuse: ${r7Pass}** — substrate-on: ${onHelperHits}/${paired.length} questions hit a learned helper at least once. substrate-off: ${offHelperHits}/${paired.length}.`);
  lines.push("");
  lines.push("## Goal 5 threshold");
  lines.push("");
  lines.push(`> substrate-ON beats substrate-OFF on **≥ 3 of 4 axes** AND helper-reuse (R7) fires on at least one sibling-template family.`);
  lines.push("");
  const passesNeeded = passes >= 3 ? "✓" : "✗";
  const r7Needed = r7Pass === "PASS" ? "✓" : "✗";
  lines.push(`- ≥ 3 of 4 axes PASS: ${passes}/4 ${passesNeeded}`);
  lines.push(`- R7 fires on ≥ 1 family:  ${r7Needed}`);
  lines.push("");
  if (passes >= 3 && r7Pass === "PASS") {
    lines.push("**THRESHOLD MET on this run.**");
  } else {
    lines.push("**THRESHOLD NOT MET on this run.** Specific gap(s) above.");
  }
  lines.push("");

  // Per-slice rollup.
  lines.push("## Per-slice tri-state (domain × question_type)");
  lines.push("");
  lines.push("| slice | n | ON mean | OFF mean | delta |");
  lines.push("|---|---|---|---|---|");
  for (const row of sliceRows) {
    lines.push(`| ${row.slice} | ${row.n} | ${fmt(row.onMean)} | ${fmt(row.offMean)} | ${fmt(row.delta)} |`);
  }
  lines.push("");

  // Per-dynamism rollup.
  lines.push("## Per-dynamism tri-state");
  lines.push("");
  lines.push("| static_or_dynamic | n | ON mean | OFF mean | delta |");
  lines.push("|---|---|---|---|---|");
  for (const row of dynRows) {
    lines.push(`| ${row.key} | ${row.n} | ${fmt(row.onMean)} | ${fmt(row.offMean)} | ${fmt(row.delta)} |`);
  }
  lines.push("");

  // Per-question table.
  lines.push("## Per-question (paired)");
  lines.push("");
  lines.push("| id | domain/type | dyn | ON score | OFF score | ON ans | OFF ans | gold |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const p of paired) {
    const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "…" : s);
    lines.push(
      `| ${p.id.slice(0, 8)} | ${p.on.domain}/${p.on.questionType} | ${p.on.staticOrDynamic} | ${p.on.score} | ${p.off.score} | ${trunc(p.on.agentAnswer, 30)} | ${trunc(p.off.agentAnswer, 30)} | ${trunc(p.on.goldAnswer, 30)} |`,
    );
  }
  lines.push("");

  // Methodology footnote.
  lines.push("## Methodology");
  lines.push("");
  lines.push("- **Arms:** substrate-on (defaults), substrate-off (`DATAFETCH_DISABLE_LEARNING=1`). All other inputs identical.");
  lines.push("- **Agent backend:** claude-p (PTY-driven `claude --print` drop-in) → `claude-sonnet-4-6` at effort `low`.");
  lines.push("- **Scoring:** rule-based tri-state (+1 exact-or-substring-match / 0 abstention / -1 incorrect). LLM-judge augmentation is iter6+.");
  lines.push("- **Tests:** McNemar for binary axes (R1, R3), paired-t on log-transformed continuous axes (R2, R4 wall-clock). p-values are approximate buckets, not exact.");
  lines.push(`- **Substrate hash:** see worktree HEAD at run time.`);
  lines.push("- **CRAG version:** task 1+2 dev split (validation + public test = 2,706 records); this run is a stratified slice.");
  lines.push("");

  return lines.join("\n");
}

async function main(): Promise<void> {
  const runRoot = process.argv[2];
  if (!runRoot) {
    process.stderr.write("usage: pnpm tsx eval/crag/scripts/build-paired-comparison.ts <runRoot>\n");
    process.exit(1);
  }
  const resultsPath = resolve(runRoot, "results.json");
  const raw = await readFile(resultsPath, "utf8");
  const data = JSON.parse(raw) as RunResults;
  const report = buildReport(data);
  const outPath = join(runRoot, "paired-comparison.md");
  await writeFile(outPath, report);
  process.stdout.write(`✓ ${outPath}\n`);
}

main().catch((err) => {
  process.stderr.write(`crashed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
