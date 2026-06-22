// CRAG finance — comparison question c719dd99-aab7-4b33-9cca-95a5e53f1ed5
//
// Question (verbatim):
// which company had higher market cap now, chmg or htcr?
//
// Replace the body below. Inspect /df.d.ts for every available surface
// (df.db data, df.tool adapters, and any df.lib learned helpers), pick
// whatever fits this question best, compute, then RETURN df.answer(...).

async function main() {
  const [chmgRecords, htcrRecords] = await Promise.all([
    df.db.records.findExact({ symbol: "CHMG" }),
    df.db.records.findExact({ symbol: "HTCR" }),
  ]);

  const [chmgMcap, htcrMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: "CHMG" }),
    df.tool.cragFinance.get_market_capitalization({ ticker: "HTCR" }),
  ]);

  const winner = chmgMcap > htcrMcap ? "CHMG" : "HTCR";

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { reason: `CHMG market cap: ${chmgMcap}` },
      { reason: `HTCR market cap: ${htcrMcap}` },
    ],
  });
}

return await main();
