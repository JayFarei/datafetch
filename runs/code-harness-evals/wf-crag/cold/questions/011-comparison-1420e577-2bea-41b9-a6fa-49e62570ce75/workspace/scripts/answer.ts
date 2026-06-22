// CRAG finance — comparison question 1420e577-2bea-41b9-a6fa-49e62570ce75
//
// Question (verbatim):
// which etf is traded more the day before yesterday, macau or inaq?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // Resolve both ETFs via db
  const [macauMatches, inaqMatches] = await Promise.all([
    df.db.records.search("macau"),
    df.db.records.search("inaq"),
  ]);

  const macauTicker = macauMatches[0]?.id ?? "MCAU";
  const inaqTicker = inaqMatches[0]?.id ?? "INAQ";

  // Fetch price history for both
  const [macauHistory, inaqHistory] = await Promise.all([
    df.tool.cragFinance.get_price_history({ ticker: macauTicker }),
    df.tool.cragFinance.get_price_history({ ticker: inaqTicker }),
  ]);

  // Day before yesterday relative to 02/23/2024 is 02/21/2024
  // (02/22/2024 is yesterday, 02/21/2024 is day before yesterday)
  const targetDate = "2024-02-21";

  const macauVol = macauHistory[targetDate]?.Volume ?? 0;
  const inaqVol = inaqHistory[targetDate]?.Volume ?? 0;

  const winner = macauVol > inaqVol ? macauTicker : inaqTicker;

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { reason: `${macauTicker} volume on ${targetDate}: ${macauVol}` },
      { reason: `${inaqTicker} volume on ${targetDate}: ${inaqVol}` },
    ],
  });
}

return await main();
