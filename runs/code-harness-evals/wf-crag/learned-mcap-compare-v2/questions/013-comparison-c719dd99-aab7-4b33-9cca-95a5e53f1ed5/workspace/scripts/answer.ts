// CRAG finance — comparison question c719dd99-aab7-4b33-9cca-95a5e53f1ed5
//
// Question (verbatim):
// which company had higher market cap now, chmg or htcr?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const [chmpMatches, htcrMatches] = await Promise.all([
    df.db.records.search("chmg"),
    df.db.records.search("htcr"),
  ]);

  const chmpTicker = chmpMatches[0]?.id ?? "CHMG";
  const htcrTicker = htcrMatches[0]?.id ?? "HTCR";

  const [chmpMcap, htcrMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: chmpTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: htcrTicker }),
  ]);

  const winner = chmpMcap >= htcrMcap ? chmpTicker : htcrTicker;

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { reason: `${chmpTicker} market cap: ${chmpMcap}` },
      { reason: `${htcrTicker} market cap: ${htcrMcap}` },
    ],
  });
}

return await main();
