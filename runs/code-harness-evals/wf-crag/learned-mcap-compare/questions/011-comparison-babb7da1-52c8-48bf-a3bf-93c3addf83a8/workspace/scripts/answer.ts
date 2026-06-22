// CRAG finance — comparison question babb7da1-52c8-48bf-a3bf-93c3addf83a8
//
// Question (verbatim):
// which company has a greater market cap, wiw or mficl?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const [wiwMatches, mficlMatches] = await Promise.all([
    df.db.records.search("WIW"),
    df.db.records.search("MFICL"),
  ]);

  const wiwTicker = wiwMatches[0]?.id ?? "WIW";
  const mficlTicker = mficlMatches[0]?.id ?? "MFICL";

  const [wiwMcap, mficlMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: wiwTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: mficlTicker }),
  ]);

  const winner = wiwMcap > mficlMcap ? wiwTicker : mficlTicker;

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { reason: `${wiwTicker} market cap: ${wiwMcap}` },
      { reason: `${mficlTicker} market cap: ${mficlMcap}` },
    ],
  });
}

return await main();
