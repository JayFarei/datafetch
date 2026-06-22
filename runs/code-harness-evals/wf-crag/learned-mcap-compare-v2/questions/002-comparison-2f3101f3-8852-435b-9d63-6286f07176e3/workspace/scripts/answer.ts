// CRAG finance — comparison question 2f3101f3-8852-435b-9d63-6286f07176e3
//
// Question (verbatim):
// which company's market capitalization is higher, nwgl or mficl?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const [nwglMatches, mficlMatches] = await Promise.all([
    df.db.records.findExact({ symbol: "NWGL" }),
    df.db.records.findExact({ symbol: "MFICL" }),
  ]);

  const nwglTicker = nwglMatches[0]?.id ?? "NWGL";
  const mficlTicker = mficlMatches[0]?.id ?? "MFICL";

  const [nwglMcap, mficlMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: nwglTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: mficlTicker }),
  ]);

  const winner = nwglMcap > mficlMcap ? "NWGL" : "MFICL";

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { recordKey: nwglMatches[0]?.recordKey, reason: `NWGL market cap: ${nwglMcap}` },
      { recordKey: mficlMatches[0]?.recordKey, reason: `MFICL market cap: ${mficlMcap}` },
    ],
  });
}

return await main();
