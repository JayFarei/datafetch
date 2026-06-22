// CRAG Task-3 rule-based 3-way scorer.
//
// Faithful to the CRAG scoring protocol (HARD CONSTRAINTS):
//   +1 accurate / 0 missing / -1 incorrect
//   accuracyPct      = accurate / total
//   hallucinationPct = incorrect / total
//   truthfulnessPct  = accuracyPct - hallucinationPct
//
// Rule-based primary matcher:
//   - normalise (lowercase, strip currency/percent/punctuation, collapse ws).
//   - false-premise (answer_type === "invalid"): accurate ONLY if the
//     prediction is exactly / contains "invalid question".
//   - abstention (prediction empty, or "i don't know" / "i dont know" /
//     "unknown" / "n/a", OR a wrong false-premise "invalid question" on a
//     VALID question): MISSING (0).
//   - valid question: accurate if the normalised gold is an exact or
//     substring match of the normalised prediction (case-insensitive), OR
//     numeric equality within ±1% when both sides parse to a number.
//   - otherwise INCORRECT (-1).
//
// No threshold / scorer weakening: an abstention is never scored as correct,
// and a wrong substantive answer is always -1.
//
// Input: a results JSONL of objects with at least
//   { interaction_id, question_type, answer_type, gold, predicted }
// (predicted may be null/missing => abstention). Extra fields are ignored.
//
// Usage:
//   tsx eval/crag/scripts/score-crag.ts --in <results.jsonl> [--out <report.json>]

import { promises as fsp } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

interface ResultRow {
  interaction_id: string;
  question_type: string;
  answer_type: string;
  gold: string;
  predicted: string | null;
}

type Verdict = "accurate" | "missing" | "incorrect";

const INVALID_PHRASE = "invalid question";
const ABSTAIN_PHRASES = new Set([
  "i don't know",
  "i dont know",
  "i do not know",
  "idk",
  "unknown",
  "n/a",
  "na",
  "none",
  "no answer",
]);
const NUMERIC_TOLERANCE = 0.01; // ±1%

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[$£€]/g, "")
    .replace(/%/g, " percent ")
    .replace(/[,]/g, "")
    // Drop apostrophes/quotes to nothing so contractions stay intact
    // ("don't" -> "dont"), then map remaining punctuation to spaces.
    .replace(/['"`’]/g, "")
    .replace(/[^\p{L}\p{N}\s.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAbstention(predNorm: string): boolean {
  if (predNorm.length === 0) return true;
  if (ABSTAIN_PHRASES.has(predNorm)) return true;
  return false;
}

function parseNumber(value: string): number | null {
  const cleaned = value.replace(/[$£€,%\s]/g, "");
  // Match the first numeric token (handles "4", "0.29", "2.78e12").
  const m = cleaned.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/i);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function numericMatch(goldNorm: string, predNorm: string): boolean {
  const g = parseNumber(goldNorm);
  const p = parseNumber(predNorm);
  if (g === null || p === null) return false;
  const denom = Math.max(Math.abs(g), Math.abs(p), 1);
  return Math.abs(g - p) / denom <= NUMERIC_TOLERANCE;
}

export function scoreRow(row: ResultRow): Verdict {
  const predRaw = row.predicted ?? "";
  const predNorm = normalize(predRaw);
  const goldNorm = normalize(row.gold ?? "");
  const isFalsePremise = row.answer_type === "invalid";

  if (isFalsePremise) {
    // Gold answer is "invalid question". Accurate iff prediction says so.
    if (predNorm.includes(INVALID_PHRASE)) return "accurate";
    if (isAbstention(predNorm)) return "missing";
    return "incorrect";
  }

  // Valid (or no_answer) question.
  // A prediction that claims "invalid question" on a valid question is a
  // false-premise hallucination => incorrect. But if it also abstains, the
  // abstention check below would have caught it; an explicit "invalid
  // question" is a substantive (wrong) claim, so it is incorrect.
  if (predNorm.includes(INVALID_PHRASE) && !goldNorm.includes(INVALID_PHRASE)) {
    return "incorrect";
  }

  if (isAbstention(predNorm)) return "missing";

  // no_answer gold ("i don't know"): the only accurate response is an
  // abstention, already returned missing above; a substantive answer here is
  // a hallucination. CRAG treats the gold abstention as "no answer expected",
  // so a confident answer is incorrect.
  if (row.answer_type === "no_answer") {
    return "incorrect";
  }

  if (goldNorm.length === 0) return "incorrect";

  // Exact or substring match (either direction).
  if (predNorm === goldNorm) return "accurate";
  if (predNorm.includes(goldNorm)) return "accurate";
  // Gold is often a single token (e.g. "microsoft", "casi", "4") while the
  // prediction may be a fuller sentence; the includes() above covers that.
  // Also allow the reverse for short golds embedding the prediction.
  if (goldNorm.includes(predNorm) && predNorm.length >= 2) return "accurate";

  if (numericMatch(goldNorm, predNorm)) return "accurate";

  return "incorrect";
}

interface Tally {
  total: number;
  accurate: number;
  missing: number;
  incorrect: number;
}

function emptyTally(): Tally {
  return { total: 0, accurate: 0, missing: 0, incorrect: 0 };
}

function add(tally: Tally, verdict: Verdict): void {
  tally.total += 1;
  tally[verdict] += 1;
}

function metrics(tally: Tally): {
  accuracyPct: number;
  hallucinationPct: number;
  truthfulnessPct: number;
} {
  const t = tally.total || 1;
  const accuracyPct = (tally.accurate / t) * 100;
  const hallucinationPct = (tally.incorrect / t) * 100;
  return {
    accuracyPct: round(accuracyPct),
    hallucinationPct: round(hallucinationPct),
    truthfulnessPct: round(accuracyPct - hallucinationPct),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

interface ScoreReport {
  total: number;
  overall: Tally & ReturnType<typeof metrics>;
  byType: Record<string, Tally & ReturnType<typeof metrics>>;
  byAnswerType: Record<string, Tally & ReturnType<typeof metrics>>;
  rows: Array<ResultRow & { verdict: Verdict }>;
}

export function scoreRows(rows: ResultRow[]): ScoreReport {
  const overall = emptyTally();
  const byType: Record<string, Tally> = {};
  const byAnswerType: Record<string, Tally> = {};
  const scored: Array<ResultRow & { verdict: Verdict }> = [];
  for (const row of rows) {
    const verdict = scoreRow(row);
    add(overall, verdict);
    (byType[row.question_type] ??= emptyTally());
    add(byType[row.question_type]!, verdict);
    (byAnswerType[row.answer_type] ??= emptyTally());
    add(byAnswerType[row.answer_type]!, verdict);
    scored.push({ ...row, verdict });
  }
  const finalizeMap = (m: Record<string, Tally>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v, ...metrics(v) }]));
  return {
    total: overall.total,
    overall: { ...overall, ...metrics(overall) },
    byType: finalizeMap(byType),
    byAnswerType: finalizeMap(byAnswerType),
    rows: scored,
  };
}

async function readJsonl(filePath: string): Promise<ResultRow[]> {
  const raw = await fsp.readFile(filePath, "utf8");
  const rows: ResultRow[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || !s.startsWith("{")) continue;
    const obj = JSON.parse(s) as Record<string, unknown>;
    rows.push({
      interaction_id: String(obj["interaction_id"] ?? ""),
      question_type: String(obj["question_type"] ?? "unknown"),
      answer_type: String(obj["answer_type"] ?? "valid"),
      gold: String(obj["gold"] ?? ""),
      predicted: obj["predicted"] == null ? null : String(obj["predicted"]),
    });
  }
  return rows;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let inPath = "";
  let outPath = "";
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (a === "--in") inPath = path.resolve(argv[++i]!);
    else if (a.startsWith("--in=")) inPath = path.resolve(a.slice("--in=".length));
    else if (a === "--out") outPath = path.resolve(argv[++i]!);
    else if (a.startsWith("--out=")) outPath = path.resolve(a.slice("--out=".length));
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!inPath) throw new Error("--in <results.jsonl> is required");
  const rows = await readJsonl(inPath);
  const report = scoreRows(rows);

  // Console summary.
  const o = report.overall;
  console.log(`CRAG 3-way score (n=${report.total})`);
  console.log(`  accurate=${o.accurate} missing=${o.missing} incorrect=${o.incorrect}`);
  console.log(`  accuracy=${o.accuracyPct}%  hallucination=${o.hallucinationPct}%  truthfulness=${o.truthfulnessPct}%`);
  console.log(`  by question_type:`);
  for (const [t, m] of Object.entries(report.byType)) {
    console.log(`    ${t}: acc=${m.accurate} miss=${m.missing} inc=${m.incorrect} | accuracy=${m.accuracyPct}% truthfulness=${m.truthfulnessPct}%`);
  }
  console.log(`  by answer_type:`);
  for (const [t, m] of Object.entries(report.byAnswerType)) {
    console.log(`    ${t}: acc=${m.accurate} miss=${m.missing} inc=${m.incorrect} | accuracy=${m.accuracyPct}% truthfulness=${m.truthfulnessPct}%`);
  }

  if (outPath) {
    await fsp.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`wrote ${outPath}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
