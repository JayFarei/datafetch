// CRAG Task-3 rule-based 3-way (tri-state) scorer for the SaC PoC C4 track.
//
// Ported faithfully (pure scoring core only — no CLI/IO) from the CRAG harness
// in the sibling worktree (.claude/worktrees/code-harness-evals/eval/crag/
// scripts/score-crag.ts). Kept byte-equivalent in logic so the C4
// governance-under-staleness endpoint scores on the SAME +1/0/-1 protocol the
// research verified is unsaturated on frontier models. This is the metric under
// which a GOVERNED arm that ABSTAINS beats an UNGOVERNED arm that returns a
// confidently-wrong stale value (binary pass/fail cannot represent it).
//
//   +1 accurate / 0 missing / -1 incorrect
//   accuracyPct      = accurate / total
//   hallucinationPct = incorrect / total
//   truthfulnessPct  = accuracyPct - hallucinationPct   (the C4 headline)
//
// answer_type is DERIVED by the corpus loader (cragCorpus.ts) since the raw
// dev_v4 file omits it: false-premise rows ("invalid question" gold) -> "invalid".

export interface CragResultRow {
  interaction_id: string;
  question_type: string;
  // "invalid" (false-premise), "no_answer", or "valid" (derived in cragCorpus).
  answer_type: string;
  gold: string;
  // null/missing => abstention.
  predicted: string | null;
}

export type CragVerdict = "accurate" | "missing" | "incorrect";

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
const NUMERIC_TOLERANCE = 0.01; // ±1%, matching the substrate answerEquals FAC

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[$£€]/g, "")
    .replace(/%/g, " percent ")
    .replace(/[,]/g, "")
    .replace(/['"`’]/g, "")
    .replace(/[^\p{L}\p{N}\s.]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAbstention(predNorm: string): boolean {
  if (predNorm.length === 0) return true;
  return ABSTAIN_PHRASES.has(predNorm);
}

function parseNumber(value: string): number | null {
  const cleaned = value.replace(/[$£€,%\s]/g, "");
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

// The tri-state verdict for one (predicted, gold, answer_type) triple.
export function scoreCragRow(row: CragResultRow): CragVerdict {
  const predNorm = normalize(row.predicted ?? "");
  const goldNorm = normalize(row.gold ?? "");
  const isFalsePremise = row.answer_type === "invalid";

  if (isFalsePremise) {
    // Gold is "invalid question": accurate iff the prediction says so; an
    // abstention is missing; a substantive (wrong) answer is incorrect.
    if (predNorm.includes(INVALID_PHRASE)) return "accurate";
    if (isAbstention(predNorm)) return "missing";
    return "incorrect";
  }

  // A confident "invalid question" on a VALID question is a hallucination.
  if (predNorm.includes(INVALID_PHRASE) && !goldNorm.includes(INVALID_PHRASE)) {
    return "incorrect";
  }
  if (isAbstention(predNorm)) return "missing";
  if (row.answer_type === "no_answer") return "incorrect";
  if (goldNorm.length === 0) return "incorrect";

  if (predNorm === goldNorm) return "accurate";
  if (predNorm.includes(goldNorm)) return "accurate";
  if (goldNorm.includes(predNorm) && predNorm.length >= 2) return "accurate";
  if (numericMatch(goldNorm, predNorm)) return "accurate";

  return "incorrect";
}

export interface CragTally {
  total: number;
  accurate: number;
  missing: number;
  incorrect: number;
}

export interface CragMetrics {
  accuracyPct: number;
  hallucinationPct: number;
  truthfulnessPct: number;
}

function emptyTally(): CragTally {
  return { total: 0, accurate: 0, missing: 0, incorrect: 0 };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function cragMetrics(tally: CragTally): CragMetrics {
  const t = tally.total || 1;
  const accuracyPct = (tally.accurate / t) * 100;
  const hallucinationPct = (tally.incorrect / t) * 100;
  return {
    accuracyPct: round(accuracyPct),
    hallucinationPct: round(hallucinationPct),
    // Truthfulness = Accuracy - Hallucination: the C4 governance endpoint.
    truthfulnessPct: round(accuracyPct - hallucinationPct),
  };
}

export interface CragScoreReport {
  total: number;
  overall: CragTally & CragMetrics;
  byType: Record<string, CragTally & CragMetrics>;
  byAnswerType: Record<string, CragTally & CragMetrics>;
  rows: Array<CragResultRow & { verdict: CragVerdict }>;
}

export function scoreCragRows(rows: CragResultRow[]): CragScoreReport {
  const overall = emptyTally();
  const byType: Record<string, CragTally> = {};
  const byAnswerType: Record<string, CragTally> = {};
  const scored: Array<CragResultRow & { verdict: CragVerdict }> = [];
  for (const row of rows) {
    const verdict = scoreCragRow(row);
    overall.total += 1;
    overall[verdict] += 1;
    const bt = (byType[row.question_type] ??= emptyTally());
    bt.total += 1;
    bt[verdict] += 1;
    const ba = (byAnswerType[row.answer_type] ??= emptyTally());
    ba.total += 1;
    ba[verdict] += 1;
    scored.push({ ...row, verdict });
  }
  const finalize = (m: Record<string, CragTally>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v, ...cragMetrics(v) }]));
  return {
    total: overall.total,
    overall: { ...overall, ...cragMetrics(overall) },
    byType: finalize(byType),
    byAnswerType: finalize(byAnswerType),
    rows: scored,
  };
}
