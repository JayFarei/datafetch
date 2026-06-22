// CRAG finance — comparison question 25d230b2-e518-45e7-8c67-a762571fb5fe
//
// Question (verbatim):
// which company have larger market cap, rbc or rng?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const [rbcMatches, rngMatches] = await Promise.all([
    df.db.records.search("RBC", { limit: 3 }),
    df.db.records.search("RNG", { limit: 3 }),
  ]);

  const rbcTicker = rbcMatches[0]?.id;
  const rngTicker = rngMatches[0]?.id;

  const [rbcMcap, rngMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: rbcTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: rngTicker }),
  ]);

  const winner = rbcMcap > rngMcap ? "RBC" : "RNG";

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { reason: `RBC (${rbcTicker}) market cap: ${rbcMcap}` },
      { reason: `RNG (${rngTicker}) market cap: ${rngMcap}` },
    ],
  });
}

return await main();
