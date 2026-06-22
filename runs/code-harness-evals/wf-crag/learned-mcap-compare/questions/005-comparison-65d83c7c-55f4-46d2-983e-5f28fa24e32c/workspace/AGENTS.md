# Workspace orientation (CRAG finance)

You are answering one finance question. The full question is in your prompt.

## Mounted data
- `df.db.records` (mount id: `crag-finance-companies`) — the full company directory. Each record: id (the ticker symbol), label (company name), attributes.name, attributes.symbol.
- `await df.db.records.search("Apple")` fuzzy-matches a company name to its record(s); read `.id` or `.attributes.symbol` for the ticker.
- `await df.db.records.findExact({ symbol: "AAPL" })` looks a ticker up exactly.

## Tools (df.tool.cragFinance)
Each takes a single ticker (or company name for the name tools) and returns live finance data:
- `get_ticker_by_name({ name })` — resolve a company name to its ticker.
- `get_company_name({ query })` — fuzzy company-name matches.
- `get_pe_ratio({ ticker })` — price/earnings ratio.
- `get_market_capitalization({ ticker })` — market cap.
- `get_eps({ ticker })` — earnings per share.
- `get_price_history({ ticker })` — 1yr daily OHLCV (object keyed by date).
- `get_dividends_history({ ticker })` — dividend history (object keyed by date -> amount).
- `get_info({ ticker })` — full metadata object.
Example: `const pe = await df.tool.cragFinance.get_pe_ratio({ ticker: "AAPL" });`

## Library (df.lib)
- Helpers from prior questions are hydrated into `df.lib` and visible in /df.d.ts. When one fits your question's intent, call it instead of re-deriving.
- `df.lib.recordToolLookup(...)` is available.

## Committing your answer
```ts
return df.answer({
  status: "answered",          // or "unsupported" if you cannot determine the answer
  value: "...",                // the concise factual answer (string or number)
  evidence: [{ recordKey: "crag-finance:AAPL", reason: "..." }],
});
```
If the question rests on a false premise, set `value: "invalid question"`.
If you cannot determine the answer, use `status: "unsupported"` (scored as an abstention, not a wrong answer).