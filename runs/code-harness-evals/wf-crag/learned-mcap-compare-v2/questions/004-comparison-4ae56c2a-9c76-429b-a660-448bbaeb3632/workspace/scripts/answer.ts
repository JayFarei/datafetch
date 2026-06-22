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

  const brkRecord = brkMatches[0];
  const tslaRecord = tslaMatches[0];

  const [brkMcap, tslaMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: brkRecord.id }),
    df.tool.cragFinance.get_market_capitalization({ ticker: tslaRecord.id }),
  ]);

  const higher = brkMcap > tslaMcap;

  return df.answer({
    status: "answered",
    value: higher ? "yes" : "no",
    evidence: [
      { recordKey: brkRecord.recordKey, reason: `Berkshire Hathaway (${brkRecord.id}) market cap: ${brkMcap}` },
      { recordKey: tslaRecord.recordKey, reason: `Tesla (${tslaRecord.id}) market cap: ${tslaMcap}` },
    ],
  });
}

return await main();