// CRAG mount + grader glue for the SaC PoC C4 track (live-prep #2).
//
// Onboards the CRAG corpus as a df.db collection by reusing the existing
// in-memory EvalRecordsMount (no new MountAdapter, no substrate change) — the
// same public path the zero-src onboarding test (C1/C2) uses. Per the research
// recommendation, the QA rows are mounted with the gold answer in `attributes`
// (the substrate holds the data; the agent composes the retrieval), and the
// finance SQLite KG is the drift fixture the B-2 injector mutates.
//
// The agent's df.db.records.{findExact,search,findSimilar} surface lets it
// retrieve the answer for a query; the tri-state grader (cragGrader.ts) scores
// predicted-vs-gold on the +1/0/-1 protocol. SIBLING SELECTION (which questions
// form same-template families so a crystallised helper is reused — the C4 "#3"
// open call) is intentionally NOT decided here; this module just makes CRAG
// mountable + gradeable.

import { EvalRecordsMount, type EvalRecord } from "./evalRecords.js";
import { loadCragRows, type CragRow, type LoadCragOpts } from "./cragCorpus.js";
import type { CragResultRow } from "./cragGrader.js";

// Map one CRAG row to the substrate's EvalRecord shape. `family` = CRAG domain
// (finance/sports/movie/music/open) so domain slices are filterable; the gold +
// drift class live in `attributes`.
export function cragRowToEvalRecord(r: CragRow): EvalRecord {
  return {
    id: r.interactionId,
    recordKey: `crag:${r.interactionId}`,
    family: r.domain || "open",
    entity: r.interactionId,
    label: r.query,
    attributes: {
      query: r.query,
      gold: r.gold,
      questionType: r.questionType,
      staticOrDynamic: r.staticOrDynamic,
      domain: r.domain,
      queryTime: r.queryTime,
      answerType: r.answerType,
    },
  };
}

// Build a CRAG mount from already-loaded rows (tests / synthetic / a pre-sliced
// sibling stream).
export function cragMountFromRows(mountId: string, rows: readonly CragRow[]): EvalRecordsMount {
  return new EvalRecordsMount(mountId, rows.map(cragRowToEvalRecord));
}

// Build a CRAG mount by streaming the in-env corpus (returns an empty mount when
// the corpus is absent — caller decides whether to skip).
export async function buildCragMount(
  mountId: string,
  opts?: LoadCragOpts,
): Promise<EvalRecordsMount> {
  const rows = await loadCragRows(opts);
  return new EvalRecordsMount(mountId, rows.map(cragRowToEvalRecord));
}

// Grader glue: map a CRAG row + the agent's predicted answer (null = abstention)
// to the tri-state grader's input shape, carrying the DERIVED answer_type so
// false-premise cells score correctly.
export function toCragResultRow(r: CragRow, predicted: string | null): CragResultRow {
  return {
    interaction_id: r.interactionId,
    question_type: r.questionType,
    answer_type: r.answerType,
    gold: r.gold,
    predicted,
  };
}
