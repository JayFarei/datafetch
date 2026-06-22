// CRAG finance — comparison question 4ae56c2a-9c76-429b-a660-448bbaeb3632
//
// Question (verbatim):
// does berskhire hathaway have a higher market cap than tesla?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const [brkMatches, tslaMatches] = await Promise.all([
    df.db.records.search("Berkshire Hathaway", { limit: 3 }),
    df.db.records.search("Tesla", { limit: 3 }),
  ]);

  const brkTicker = brkMatches[0]?.id;
  const tslaTicker = tslaMatches[0]?.id;

  const [brkMcap, tslaMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: brkTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: tslaTicker }),
  ]);

  const answer = brkMcap > tslaMcap ? "yes" : "no";

  return df.answer({
    status: "answered",
    value: answer,
    evidence: [
      { reason: `Berkshire Hathaway (${brkTicker}) market cap: ${brkMcap}` },
      { reason: `Tesla (${tslaTicker}) market cap: ${tslaMcap}` },
    ],
  });
}

return await main();
