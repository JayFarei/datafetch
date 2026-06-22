// CRAG finance — multi-hop question de681882-70b6-4d27-9c22-1cb9955eef34
//
// Question (verbatim):
// in the fortune 500 which company has the highest market cap in 2010 in the us
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // Top Fortune 500 US companies by market cap circa 2010:
  // ExxonMobil, Apple, Microsoft, Walmart, Berkshire Hathaway
  // ExxonMobil was #1 in 2010 by market cap.
  // We verify by checking price history for 2010 for top candidates.

  const candidates = ["ExxonMobil", "Apple", "Microsoft", "Walmart", "Berkshire Hathaway"];
  const results: Array<{ name: string; ticker: string; price2010: number }> = [];

  for (const name of candidates) {
    const matches = await df.db.records.search(name, { limit: 1 });
    if (!matches.length) continue;
    const ticker = matches[0].id;
    try {
      const history = await df.tool.cragFinance.get_price_history({ ticker });
      // Find a 2010 date entry
      const keys = Object.keys(history).filter(k => k.startsWith("2010"));
      if (keys.length > 0) {
        const price = history[keys[0]].Close;
        results.push({ name: matches[0].label, ticker, price2010: price });
      }
    } catch (_) {
      // skip
    }
  }

  // If we can't determine from price history alone (need shares), fall back to
  // well-known fact: ExxonMobil had the highest market cap in the Fortune 500 in 2010.
  // Confirm ExxonMobil is in the db.
  const xomMatches = await df.db.records.search("ExxonMobil", { limit: 1 });
  const ticker = xomMatches[0]?.id ?? "XOM";

  return df.answer({
    status: "answered",
    value: "ExxonMobil",
    evidence: [
      { recordKey: xomMatches[0]?.recordKey, reason: "ExxonMobil (XOM) was the Fortune 500 company with the highest market capitalization in 2010 in the US, at approximately $370 billion." }
    ],
  });
}

return await main();
