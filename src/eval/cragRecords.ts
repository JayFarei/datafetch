// CRAG finance company corpus mount. A thin consumer of the generic
// EvalRecordsMount (src/eval/evalRecords.ts): it loads the CRAG finance
// COMPANY dictionary (Name,Symbol CSV) into EvalRecord rows and hands them
// to the benchmark-agnostic EvalRecordsMount. Nothing here branches on CRAG
// task / question-type / template identity beyond reading this one file —
// the substrate sees a plain records mount of {id, entity, label, attributes}
// just like the SkillCraft / FinChain consumers.
//
// Each company row:
//   id      = Symbol (the ticker, tool-callable: pass straight to df.tool)
//   entity  = Symbol (duplicate of id; back-compat with answer.ts patterns)
//   label   = Name (the human-readable company name)
//   attributes = { name: Name, symbol: Symbol }
//
// The records mount gives the agent a substrate-rooted chain: it can
// df.db.records.search("Apple") to resolve a name -> ticker, then fan the
// ticker out over df.tool.cragFinance.* — the same db-first then tool/lib
// shape the observer's crystallisation gate expects.

import { promises as fsp } from "node:fs";
import path from "node:path";

import { type EvalRecord, EvalRecordsMount } from "./evalRecords.js";

export const DEFAULT_COMPANY_DICT_PATH = path.resolve(
  "eval/crag/vendor/CRAG/mock_api/cragkg/finance/company_name.dict",
);

export const CRAG_COMPANY_MOUNT_ID = "crag-finance-companies";

// Parse one CSV row honouring simple double-quote quoting (company names
// contain commas, e.g. "Armada Acquisition Corp. I, ..."). Returns the raw
// cell strings. Deliberately small — the CRAG dict is well-formed RFC4180.
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

/**
 * Read the CRAG finance company dictionary and return one EvalRecord per
 * company. The file is a CSV with a header row `,Name,Symbol` (an unnamed
 * index column first). Rows whose Symbol is empty are skipped.
 */
export async function loadCragCompanyRecords(
  dictPath: string = DEFAULT_COMPANY_DICT_PATH,
): Promise<EvalRecord[]> {
  const raw = await fsp.readFile(dictPath, "utf8");
  const lines = raw.split(/\r?\n/);
  const records: EvalRecord[] = [];
  const seenSymbols = new Set<string>();
  let headerSkipped = false;
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    if (!headerSkipped) {
      headerSkipped = true;
      // Header looks like ",Name,Symbol"; skip it.
      if (/(^|,)\s*Name\s*,/.test(line)) continue;
    }
    const cells = parseCsvLine(line);
    // Layout: [index, Name, Symbol]
    if (cells.length < 3) continue;
    const name = cells[cells.length - 2]!.trim();
    const symbol = cells[cells.length - 1]!.trim();
    if (!symbol || !name) continue;
    if (seenSymbols.has(symbol)) continue;
    seenSymbols.add(symbol);
    records.push({
      id: symbol,
      recordKey: `crag-finance:${symbol}`,
      family: "crag-finance",
      entity: symbol,
      label: name,
      attributes: {
        name,
        symbol,
      },
    });
  }
  return records;
}

/**
 * Build the records mount for the CRAG finance company corpus. Returns a
 * ready-to-register EvalRecordsMount whose `records` collection contains
 * every company in the dictionary.
 */
export async function buildCragCompanyMount(input: {
  dictPath?: string;
  mountId?: string;
} = {}): Promise<EvalRecordsMount> {
  const records = await loadCragCompanyRecords(input.dictPath ?? DEFAULT_COMPANY_DICT_PATH);
  return new EvalRecordsMount(input.mountId ?? CRAG_COMPANY_MOUNT_ID, records);
}
