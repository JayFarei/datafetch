// CRAG corpus loader + answer_type ETL for the SaC PoC C4 track.
//
// Reads the in-env CRAG Task-1+2 dev_v4 JSONL (research-verified: 2,706 rows,
// not an LFS pointer) and emits typed rows the C4 harness mounts as a df.db
// collection and grades with the tri-state scorer (cragGrader.ts). STREAMS line
// by line so the ~5GB file is never read whole.
//
// THE ETL (research finding): the raw dev_v4 omits `answer_type` entirely
// (0/2706 rows), but the tri-state grader keys false-premise on
// answer_type === "invalid". We derive it: a false_premise question (gold
// "invalid question") -> "invalid"; an abstention gold -> "no_answer"; else
// "valid". Without this the 309 false-premise governance cells silently
// mis-score.
//
// The data lives in a sibling worktree (read-only); the path is configurable
// (DATAFETCH_CRAG_JSONL) and a local vendor copy is preferred if present, so
// the loader is portable and skips gracefully when the corpus is absent.

import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";

export interface CragRow {
  interactionId: string;
  query: string;
  // The CRAG `answer` (gold). For false-premise rows this is "invalid question".
  gold: string;
  questionType: string;
  // static | slow-changing | fast-changing | real-time — the drift axis C4 uses.
  staticOrDynamic: string;
  domain: string;
  queryTime: string;
  // DERIVED (the ETL): "invalid" (false-premise) | "no_answer" | "valid".
  answerType: "invalid" | "no_answer" | "valid";
}

const LOCAL_DEFAULT = "eval/crag/vendor/raw/crag_task_1_and_2_dev_v4.jsonl";
const WORKTREE_DEFAULT =
  ".claude/worktrees/crag-harness/eval/crag/vendor/raw/crag_task_1_and_2_dev_v4.jsonl";

// Resolve the corpus path: explicit env > local vendor copy > sibling worktree.
// Returns null when none exists (caller skips — like the finchain smoke).
export function resolveCragJsonlPath(repoRoot: string = process.cwd()): string | null {
  const candidates = [
    process.env["DATAFETCH_CRAG_JSONL"],
    path.join(repoRoot, LOCAL_DEFAULT),
    path.join(repoRoot, WORKTREE_DEFAULT),
  ].filter((c): c is string => Boolean(c));
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

const ABSTAIN_GOLD = new Set([
  "i don't know",
  "i dont know",
  "i do not know",
  "unknown",
  "n/a",
  "none",
  "no answer",
]);

// The ETL: derive the grader's answer_type from question_type + gold.
export function deriveAnswerType(
  questionType: string,
  gold: string,
): "invalid" | "no_answer" | "valid" {
  const g = (gold ?? "").trim().toLowerCase();
  if (questionType === "false_premise" || g === "invalid question") return "invalid";
  if (ABSTAIN_GOLD.has(g)) return "no_answer";
  return "valid";
}

export interface LoadCragOpts {
  path?: string;
  // Stop after this many MATCHING rows (default: all). The file is huge — pass
  // a limit for probes/pilots.
  limit?: number;
  // Filter by question_type and/or drift class (static_or_dynamic).
  types?: readonly string[];
  staticOrDynamic?: readonly string[];
  // Safety bound on lines SCANNED (not matched), so a restrictive filter does
  // not stream the whole 5GB. Default: limit * 200 when a limit is set, else no
  // bound.
  maxScan?: number;
}

export async function loadCragRows(opts: LoadCragOpts = {}): Promise<CragRow[]> {
  const file = opts.path ?? resolveCragJsonlPath();
  if (!file || !existsSync(file)) return [];

  const limit = opts.limit ?? Number.POSITIVE_INFINITY;
  const maxScan =
    opts.maxScan ?? (Number.isFinite(limit) ? (limit as number) * 200 : Number.POSITIVE_INFINITY);
  const types = opts.types ? new Set(opts.types) : null;
  const drift = opts.staticOrDynamic ? new Set(opts.staticOrDynamic) : null;

  const out: CragRow[] = [];
  const rl = createInterface({
    input: createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  let scanned = 0;
  try {
    for await (const line of rl) {
      if (out.length >= limit || scanned >= maxScan) break;
      const s = line.trim();
      if (!s || !s.startsWith("{")) continue;
      scanned += 1;
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(s) as Record<string, unknown>;
      } catch {
        continue;
      }
      const questionType = String(obj["question_type"] ?? "unknown");
      if (types && !types.has(questionType)) continue;
      const staticOrDynamic = String(obj["static_or_dynamic"] ?? "");
      if (drift && !drift.has(staticOrDynamic)) continue;
      const gold = String(obj["answer"] ?? "");
      out.push({
        interactionId: String(obj["interaction_id"] ?? ""),
        query: String(obj["query"] ?? ""),
        gold,
        questionType,
        staticOrDynamic,
        domain: String(obj["domain"] ?? ""),
        queryTime: String(obj["query_time"] ?? ""),
        answerType: deriveAnswerType(questionType, gold),
      });
    }
  } finally {
    rl.close();
  }
  return out;
}
