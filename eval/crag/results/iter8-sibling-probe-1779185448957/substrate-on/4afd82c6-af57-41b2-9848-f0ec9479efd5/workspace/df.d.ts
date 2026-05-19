// Auto-generated typed surface for this CRAG question.
// You can search the cached web pages via df.db.cragWeb.search(query, {limit}).
// Each page has: pageName, pageUrl, pageSnippet, pageResult (HTML), pageLastModified.

export interface CragPage {
  pageName: string;
  pageUrl: string;
  pageSnippet: string;
  pageResult: string;
  pageLastModified: string;
}

declare global {
  const df: {
    db: {
      cragWeb: {
        search(query: string, opts?: { limit?: number }): Promise<CragPage[]>;
        findExact(filter: Partial<CragPage>, limit?: number): Promise<CragPage[]>;
        findSimilar(query: string, limit?: number): Promise<CragPage[]>;
        hybrid(query: string, opts?: { limit?: number }): Promise<CragPage[]>;
      };
    };
    lib: Record<string, (input: unknown) => Promise<{ value: unknown }>> & {    };
    answer(envelope: {
      status: "answered" | "partial" | "unsupported";
      value?: unknown;
      evidence?: unknown;
      derivation?: unknown;
      reason?: string;
    }): {
      status: string;
      value?: unknown;
      evidence?: unknown;
    };
  };
}

export {};
