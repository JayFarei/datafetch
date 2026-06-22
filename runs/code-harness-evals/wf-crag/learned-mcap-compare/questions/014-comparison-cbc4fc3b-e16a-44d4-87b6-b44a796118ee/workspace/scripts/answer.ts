// CRAG finance — comparison question cbc4fc3b-e16a-44d4-87b6-b44a796118ee
//
// Question (verbatim):
// which company has a higher market capitalization, walmart or broadcom?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const [walmartResults, broadcomResults] = await Promise.all([
    df.db.records.search("Walmart"),
    df.db.records.search("Broadcom"),
  ]);

  const walmartTicker = walmartResults[0]?.id;
  const broadcomTicker = broadcomResults[0]?.id;

  const [walmartMcap, broadcomMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: walmartTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: broadcomTicker }),
  ]);

  const winner = walmartMcap > broadcomMcap ? "Walmart" : "Broadcom";

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { reason: `Walmart (${walmartTicker}) market cap: ${walmartMcap}` },
      { reason: `Broadcom (${broadcomTicker}) market cap: ${broadcomMcap}` },
    ],
  });
}

return await main();
