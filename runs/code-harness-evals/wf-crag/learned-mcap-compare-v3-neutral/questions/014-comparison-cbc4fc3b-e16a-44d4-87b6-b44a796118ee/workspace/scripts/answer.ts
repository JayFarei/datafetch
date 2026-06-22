// CRAG finance — comparison question cbc4fc3b-e16a-44d4-87b6-b44a796118ee
//
// Question (verbatim):
// which company has a higher market capitalization, walmart or broadcom?
//
// Replace the body below. Inspect /df.d.ts for every available surface
// (df.db data, df.tool adapters, and any df.lib learned helpers), pick
// whatever fits this question best, compute, then RETURN df.answer(...).

async function main() {
  const [walmartRec, broadcomRec] = await Promise.all([
    df.db.records.search("Walmart", { limit: 1 }),
    df.db.records.search("Broadcom", { limit: 1 }),
  ]);

  const walmartTicker = walmartRec[0]?.id;
  const broadcomTicker = broadcomRec[0]?.id;

  const [walmartMcap, broadcomMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: walmartTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: broadcomTicker }),
  ]);

  const winner = walmartMcap > broadcomMcap ? "Walmart" : "Broadcom";

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { recordKey: walmartRec[0]?.recordKey, reason: `Walmart mcap: ${walmartMcap}` },
      { recordKey: broadcomRec[0]?.recordKey, reason: `Broadcom mcap: ${broadcomMcap}` },
    ],
  });
}

return await main();