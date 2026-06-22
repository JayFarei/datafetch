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

  // Filter January entries and find the day with highest High price
  const janEntries = Object.entries(priceHistory).filter(([date]) => {
    const d = new Date(date);
    return d.getMonth() === 0; // January
  });

  if (janEntries.length === 0) {
    return df.answer({ status: "unsupported", value: null, evidence: [] });
  }

  let maxDay = "";
  let maxPrice = -Infinity;
  for (const [date, ohlcv] of janEntries) {
    if (ohlcv.High > maxPrice) {
      maxPrice = ohlcv.High;
      maxDay = date;
    }
  }

  return df.answer({
    status: "answered",
    value: maxDay,
    evidence: [{ reason: `Asana (${ticker}) highest High price in January was ${maxPrice} on ${maxDay}` }],
  });
}

return await main();
