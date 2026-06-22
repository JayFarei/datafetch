// CRAG finance — comparison question 2713f555-59b0-44d2-8f5e-6290c7b585e3
//
// Question (verbatim):
// which company have larger market cap, tirx or gdo?
//
// Replace the body below. Inspect /df.d.ts for every available surface
// (df.db data, df.tool adapters, and any df.lib learned helpers), pick
// whatever fits this question best, compute, then RETURN df.answer(...).

async function main() {
  const [tirxRecords, gdoRecords] = await Promise.all([
    df.db.records.findExact({ symbol: "TIRX" }),
    df.db.records.findExact({ symbol: "GDO" }),
  ]);

  const [tirxMcap, gdoMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: "TIRX" }),
    df.tool.cragFinance.get_market_capitalization({ ticker: "GDO" }),
  ]);

  const winner = tirxMcap > gdoMcap ? "TIRX" : "GDO";

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { reason: `TIRX market cap: ${tirxMcap}` },
      { reason: `GDO market cap: ${gdoMcap}` },
    ],
  });
}

return await main();
