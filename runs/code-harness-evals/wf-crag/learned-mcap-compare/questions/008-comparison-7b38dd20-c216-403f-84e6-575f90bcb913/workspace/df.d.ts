// Auto-generated type surface for this CRAG finance question.
declare const df: {
  db: {
    records: {
      search(query: string, opts?: { limit?: number }): Promise<Array<{
        id: string;            // ticker symbol
        recordKey: string;
        family: string;
        label: string;         // company name
        attributes: { name: string; symbol: string };
      }>>;
      findExact(filter: Record<string, unknown>, limit?: number): Promise<Array<{
        id: string;
        recordKey: string;
        family: string;
        label: string;
        attributes: { name: string; symbol: string };
      }>>;
      findSimilar(query: string, limit?: number): Promise<unknown[]>;
    };
  };
  lib: {
    recordToolLookup: (input: Record<string, unknown>) => Promise<{ value: unknown }>;
    [name: string]: unknown;
  };
  tool: {
    cragFinance: {
      get_ticker_by_name(input: { name: string }): Promise<string>;
      get_company_name(input: { query: string }): Promise<string[]>;
      get_pe_ratio(input: { ticker: string }): Promise<number>;
      get_market_capitalization(input: { ticker: string }): Promise<number>;
      get_eps(input: { ticker: string }): Promise<number>;
      get_price_history(input: { ticker: string }): Promise<Record<string, { Open: number; High: number; Low: number; Close: number; Volume: number }>>;
      get_dividends_history(input: { ticker: string }): Promise<Record<string, number>>;
      get_info(input: { ticker: string }): Promise<Record<string, unknown>>;
    };
  };
  answer(input: {
    status: "answered" | "partial" | "unsupported";
    value: unknown;
    evidence?: Array<{ recordKey?: string; reason?: string }>;
    reason?: string;
  }): Promise<void>;
};

export {};