// CRAG-aware MountAdapter — exposes CRAG records' search_results pages as
// a substrate db.* collection so the agent's snippet can call
// `df.db.cragWeb.search(query, {limit})` to retrieve evidence from the
// 5 cached pages per question.
//
// Stays generic: this adapter has NO substrate-side observer/template/render
// changes. It only adapts CRAG records onto the existing MountAdapter
// interface. All learning behaviour comes from the substrate as-is.
//
// Trade-off: by using the per-question 5-page search_results bundle as the
// substrate "collection", the agent gets a focused retrieval surface but
// loses access to the full CRAG mock-KG. Iter5+ can add a richer
// `df.db.crag<domain>.*` collection for the mock-API equivalents (the
// recordToolLookup shape that recordToolFanout's render function expects).

import type {
  CollectionHandle,
  MountAdapter,
  MountInventory,
  SampleOpts,
  SourceCapabilities,
} from "../sdk/index.js";

export interface CragPage {
  pageName: string;
  pageUrl: string;
  pageSnippet: string;
  pageResult: string; // full HTML
  pageLastModified: string;
}

export interface CragRecord {
  interactionId: string;
  queryTime: string;
  domain: string;
  questionType: string;
  staticOrDynamic: string;
  query: string;
  answer: string;
  altAns: string[];
  split: number;
  searchResults: CragPage[];
}

/**
 * Parse one line of CRAG jsonl into a typed CragRecord.
 * Tolerates field naming (snake_case from source).
 */
export function parseCragRecord(line: string): CragRecord {
  const r = JSON.parse(line) as Record<string, unknown>;
  const pagesRaw = (r["search_results"] as Array<Record<string, unknown>>) ?? [];
  const pages: CragPage[] = pagesRaw.map((p) => ({
    pageName: (p["page_name"] as string) ?? "",
    pageUrl: (p["page_url"] as string) ?? "",
    pageSnippet: (p["page_snippet"] as string) ?? "",
    pageResult: (p["page_result"] as string) ?? "",
    pageLastModified: (p["page_last_modified"] as string) ?? "",
  }));
  return {
    interactionId: (r["interaction_id"] as string) ?? "",
    queryTime: (r["query_time"] as string) ?? "",
    domain: (r["domain"] as string) ?? "",
    questionType: (r["question_type"] as string) ?? "",
    staticOrDynamic: (r["static_or_dynamic"] as string) ?? "",
    query: (r["query"] as string) ?? "",
    answer: (r["answer"] as string) ?? "",
    altAns: (r["alt_ans"] as string[]) ?? [],
    split: (r["split"] as number) ?? 0,
    searchResults: pages,
  };
}

// Tokenise for the bag-of-words BM25-lite scoring in search().
function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length > 1);
}

/**
 * CollectionHandle backed by one CRAG record's 5 search_results pages.
 * Agent calls `df.db.cragWeb.search("query")` and gets back ranked pages.
 */
class CragWebCollection implements CollectionHandle<CragPage> {
  constructor(
    readonly mountId: string,
    readonly resourceId: string,
    private readonly pages: CragPage[],
  ) {}

  async search(query: string, opts?: { limit?: number }): Promise<CragPage[]> {
    const limit = Math.max(1, Math.min(opts?.limit ?? 5, this.pages.length));
    const tokens = tokenize(query);
    if (tokens.length === 0) return this.pages.slice(0, limit);
    const ranked = this.pages
      .map((page) => {
        const haystack = `${page.pageName} ${page.pageSnippet} ${page.pageUrl}`.toLowerCase();
        const score = tokens.reduce((s, t) => s + (haystack.includes(t) ? 1 : 0), 0);
        return { page, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => r.page);
    return ranked;
  }

  async findExact(filter: Partial<CragPage>, limit?: number): Promise<CragPage[]> {
    const lim = limit ?? this.pages.length;
    return this.pages
      .filter((page) => {
        return Object.entries(filter).every(([k, v]) => {
          if (v === undefined) return true;
          const cellValue = (page as unknown as Record<string, unknown>)[k];
          return cellValue === v;
        });
      })
      .slice(0, lim);
  }

  async findSimilar(query: string, limit?: number): Promise<CragPage[]> {
    return this.search(query, { limit });
  }

  async hybrid(query: string, opts?: { limit?: number }): Promise<CragPage[]> {
    return this.search(query, opts);
  }
}

/**
 * MountAdapter that exposes one CRAG record's pages under collection
 * name `cragWeb`. Per-question mount — each question gets its own mount
 * with its own 5 pages.
 */
export class CragWebMount implements MountAdapter {
  readonly id: string;
  readonly typedCollections: ReadonlyMap<string, CragWebCollection>;
  private readonly pageCount: number;

  constructor(id: string, record: CragRecord) {
    this.id = id;
    this.typedCollections = new Map([
      ["cragWeb", new CragWebCollection(id, "cragWeb", record.searchResults)],
    ]);
    this.pageCount = record.searchResults.length;
  }

  capabilities(): SourceCapabilities {
    return { vector: false, lex: true, stream: false, compile: false };
  }

  async probe(): Promise<MountInventory> {
    return {
      collections: [{ name: "cragWeb", rows: this.pageCount }],
    };
  }

  async sample(_collection: string, _opts: SampleOpts): Promise<unknown[]> {
    return [];
  }

  collection<T>(name: string): CollectionHandle<T> {
    const h = this.typedCollections.get(name);
    if (!h) throw new Error(`CragWebMount: unknown collection ${name}`);
    return h as unknown as CollectionHandle<T>;
  }
}

/**
 * Compute tri-state correctness score per CRAG's grader rubric.
 *   +1 = correct (exact-string or alt-string match, case-insensitive)
 *    0 = abstained / "I don't know" / unsupported
 *   -1 = incorrect (any other answer)
 *
 * Rule-based only. LLM-as-judge augmentation is iter5+.
 */
export type TriStateScore = 1 | 0 | -1;

export function scoreTriState(
  agentAnswer: string,
  record: CragRecord,
): { score: TriStateScore; matched: string | null; reason: string } {
  const norm = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const answer = norm(agentAnswer);

  // Detect abstention. CRAG's abstention patterns: "i don't know",
  // "invalid question", "cannot answer", "no information", "unsupported",
  // explicit empty / null.
  const ABSTAIN_PATTERNS = [
    /^i don.?t know$/,
    /^i do not know$/,
    /^idk$/,
    /^invalid question$/,
    /^cannot answer$/,
    /^no information$/,
    /^unsupported$/,
    /^unknown$/,
    /^null$/,
    /^none$/,
    /^n\/?a$/,
    /^$/,
  ];
  if (ABSTAIN_PATTERNS.some((p) => p.test(answer))) {
    return { score: 0, matched: null, reason: "abstained" };
  }

  // Exact / fuzzy match against gold.
  const gold = norm(record.answer);
  if (answer === gold) return { score: 1, matched: record.answer, reason: "exact match (gold)" };
  if (answer.includes(gold) || gold.includes(answer)) {
    return { score: 1, matched: record.answer, reason: "substring match (gold)" };
  }
  for (const alt of record.altAns) {
    const a = norm(alt);
    if (answer === a) return { score: 1, matched: alt, reason: "exact match (alt)" };
    if (answer.includes(a) || a.includes(answer)) {
      return { score: 1, matched: alt, reason: "substring match (alt)" };
    }
  }

  // False-premise: if gold answer is "invalid question" / "no", expected
  // abstention. Penalise false-positive.
  if (record.questionType === "false_premise") {
    return { score: -1, matched: null, reason: "false-premise: answered when abstention expected" };
  }
  return { score: -1, matched: null, reason: "incorrect" };
}
