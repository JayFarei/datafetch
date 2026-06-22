// CRAG finance — comparison question 10db2c9d-8d19-4690-b069-cf383ec9d8ed
//
// Question (verbatim):
// which day did asana have the highest price in jan?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const matches = await df.db.records.search("Asana");
  const ticker = matches[0]?.id;
  const priceHistory = await df.tool.cragFinance.get_price_history({ ticker });

  // Filter to January entries and find the day with highest High price
  const janEntries = Object.entries(priceHistory).filter(([date]) => date.startsWith("2024-01"));
  if (janEntries.length === 0) {
    return df.answer({ status: "unsupported", value: null, evidence: [] });
  }

  const best = janEntries.reduce((max, curr) => curr[1].High > max[1].High ? curr : max);

  return df.answer({
    status: "answered",
    value: best[0],
    evidence: [{ recordKey: matches[0]?.recordKey, reason: `Highest High price in Jan 2024 was ${best[1].High} on ${best[0]}` }],
  });
}

return await main();
