// CRAG finance — comparison question 1420e577-2bea-41b9-a6fa-49e62570ce75
//
// Question (verbatim):
// which etf is traded more the day before yesterday, macau or inaq?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // Resolve both ETF names via the company database
  const [macauResults, inaqResults] = await Promise.all([
    df.db.records.search("MACAU", { limit: 3 }),
    df.db.records.search("INAQ", { limit: 3 }),
  ]);

  // MACAU and INAQ are ETF tickers themselves
  const macauTicker = macauResults[0]?.id ?? "MCAU";
  const inaqTicker = inaqResults[0]?.id ?? "INAQ";

  // Get price history (includes Volume) for both
  const [macauHistory, inaqHistory] = await Promise.all([
    df.tool.cragFinance.get_price_history({ ticker: macauTicker }),
    df.tool.cragFinance.get_price_history({ ticker: inaqTicker }),
  ]);

  // Day before yesterday relative to 02/23/2024 = 02/21/2024
  const targetDate = "2024-02-21";

  const macauVol = macauHistory[targetDate]?.Volume ?? 0;
  const inaqVol = inaqHistory[targetDate]?.Volume ?? 0;

  const winner = macauVol > inaqVol ? macauTicker : inaqVol > macauVol ? inaqTicker : "tie";

  return df.answer({
    status: "answered",
    value: winner.toLowerCase(),
    evidence: [
      { reason: `${macauTicker} volume on ${targetDate}: ${macauVol}` },
      { reason: `${inaqTicker} volume on ${targetDate}: ${inaqVol}` },
    ],
  });
}

return await main();