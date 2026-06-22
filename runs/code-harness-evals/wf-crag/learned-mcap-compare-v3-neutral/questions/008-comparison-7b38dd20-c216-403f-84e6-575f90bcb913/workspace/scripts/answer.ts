// CRAG finance — comparison question 7b38dd20-c216-403f-84e6-575f90bcb913
//
// Question (verbatim):
// which of the two companies, bksy or cvcy, has a higher market capitalization?
//
// Replace the body below. Inspect /df.d.ts for every available surface
// (df.db data, df.tool adapters, and any df.lib learned helpers), pick
// whatever fits this question best, compute, then RETURN df.answer(...).

async function main() {
  const [bksyRec, cvcyRec] = await Promise.all([
    df.db.records.findExact({ symbol: "BKSY" }, 1),
    df.db.records.findExact({ symbol: "CVCY" }, 1),
  ]);

  const [bksyMcap, cvcyMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: "BKSY" }),
    df.tool.cragFinance.get_market_capitalization({ ticker: "CVCY" }),
  ]);

  const winner = bksyMcap > cvcyMcap ? "BKSY" : "CVCY";

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { recordKey: bksyRec[0]?.recordKey, reason: `BKSY market cap: ${bksyMcap}` },
      { recordKey: cvcyRec[0]?.recordKey, reason: `CVCY market cap: ${cvcyMcap}` },
    ],
  });
}

return await main();