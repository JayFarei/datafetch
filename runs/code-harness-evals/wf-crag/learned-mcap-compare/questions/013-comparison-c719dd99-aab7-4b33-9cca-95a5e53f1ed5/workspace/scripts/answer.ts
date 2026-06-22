// CRAG finance — comparison question c719dd99-aab7-4b33-9cca-95a5e53f1ed5
//
// Question (verbatim):
// which company had higher market cap now, chmg or htcr?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const [chmgResults, htcrResults] = await Promise.all([
    df.db.records.search("CHMG"),
    df.db.records.search("HTCR"),
  ]);

  const chmgTicker = chmgResults[0]?.id ?? "CHMG";
  const htcrTicker = htcrResults[0]?.id ?? "HTCR";

  const [chmgMcap, htcrMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: chmgTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: htcrTicker }),
  ]);

  const higher = chmgMcap >= htcrMcap ? chmgTicker : htcrTicker;

  return df.answer({
    status: "answered",
    value: higher,
    evidence: [
      { reason: `${chmgTicker} market cap: ${chmgMcap}` },
      { reason: `${htcrTicker} market cap: ${htcrMcap}` },
    ],
  });
}

return await main();
