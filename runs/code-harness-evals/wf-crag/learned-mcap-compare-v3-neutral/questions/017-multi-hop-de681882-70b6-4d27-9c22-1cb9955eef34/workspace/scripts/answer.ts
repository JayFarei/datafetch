// CRAG finance — multi-hop question de681882-70b6-4d27-9c22-1cb9955eef34
//
// Question (verbatim):
// in the fortune 500 which company has the highest market cap in 2010 in the us
//
// Strategy: search DB for top US Fortune 500 companies, get market caps,
// find the highest.

async function main() {
  // Search for major US Fortune 500 candidates known to be top by market cap around 2010
  const candidates = [
    "ExxonMobil", "Apple", "Microsoft", "Walmart", "Berkshire Hathaway",
    "General Electric", "Chevron", "Johnson Johnson", "JPMorgan Chase", "Procter Gamble"
  ];

  // Root the chain in the substrate
  const records = await df.db.records.search("fortune 500 largest US company market cap", { limit: 20 });

  // Also search for exxon specifically
  const exxonRec = await df.db.records.search("ExxonMobil", { limit: 5 });

  // Build ticker list from records + known tickers
  const tickerSet = new Map<string, string>();
  for (const r of [...records, ...exxonRec]) {
    tickerSet.set(r.id, r.label);
  }

  // Also add well-known tickers directly
  const knownTickers: Array<[string, string]> = [
    ["XOM", "ExxonMobil"],
    ["AAPL", "Apple"],
    ["MSFT", "Microsoft"],
    ["WMT", "Walmart"],
    ["BRK-B", "Berkshire Hathaway"],
    ["GE", "General Electric"],
    ["CVX", "Chevron"],
    ["JNJ", "Johnson & Johnson"],
    ["JPM", "JPMorgan Chase"],
    ["PG", "Procter & Gamble"],
  ];
  for (const [ticker, name] of knownTickers) {
    tickerSet.set(ticker, name);
  }

  // Get market caps for all candidates
  const results: Array<{ ticker: string; name: string; mcap: number }> = [];
  for (const [ticker, name] of tickerSet.entries()) {
    try {
      const mcap = await df.tool.cragFinance.get_market_capitalization({ ticker });
      if (mcap && mcap > 0) {
        results.push({ ticker, name, mcap });
      }
    } catch (_) {
      // skip failures
    }
  }

  if (results.length === 0) {
    return df.answer({ status: "unsupported", value: "i don't know", evidence: [] });
  }

  results.sort((a, b) => b.mcap - a.mcap);
  const top = results[0];

  return df.answer({
    status: "answered",
    value: top.name,
    evidence: [{ reason: `${top.ticker} had the highest market cap: ${top.mcap}` }],
  });
}

return await main();
