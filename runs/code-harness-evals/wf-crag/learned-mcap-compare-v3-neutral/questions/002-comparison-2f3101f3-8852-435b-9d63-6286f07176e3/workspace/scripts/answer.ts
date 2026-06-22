// CRAG finance — comparison question 2f3101f3-8852-435b-9d63-6286f07176e3
//
// Question (verbatim):
// which company's market capitalization is higher, nwgl or mficl?
//
// Replace the body below. Inspect /df.d.ts for every available surface
// (df.db data, df.tool adapters, and any df.lib learned helpers), pick
// whatever fits this question best, compute, then RETURN df.answer(...).

async function main() {
  const [nwglRecords, mficlRecords] = await Promise.all([
    df.db.records.findExact({ symbol: "NWGL" }),
    df.db.records.findExact({ symbol: "MFICL" }),
  ]);

  const [nwglMcap, mficlMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: "NWGL" }),
    df.tool.cragFinance.get_market_capitalization({ ticker: "MFICL" }),
  ]);

  const higher = nwglMcap > mficlMcap ? "NWGL" : "MFICL";

  return df.answer({
    status: "answered",
    value: higher,
    evidence: [
      { reason: `NWGL market cap: ${nwglMcap}` },
      { reason: `MFICL market cap: ${mficlMcap}` },
    ],
  });
}

return await main();
