// CRAG finance — comparison question 25d230b2-e518-45e7-8c67-a762571fb5fe
//
// Question (verbatim):
// which company have larger market cap, rbc or rng?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const rbcMatches = await df.db.records.search("RBC", { limit: 3 });
  const rngMatches = await df.db.records.search("RNG", { limit: 3 });

  const rbcTicker = rbcMatches[0]?.id ?? "RY";
  const rngTicker = rngMatches[0]?.id ?? "RNG";

  const [rbcMcap, rngMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: rbcTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: rngTicker }),
  ]);

  const winner = rbcMcap >= rngMcap ? rbcTicker : rngTicker;
  const winnerLabel = rbcMcap >= rngMcap
    ? (rbcMatches[0]?.label ?? rbcTicker)
    : (rngMatches[0]?.label ?? rngTicker);

  return df.answer({
    status: "answered",
    value: winnerLabel,
    evidence: [
      { reason: `${rbcTicker} market cap: ${rbcMcap}` },
      { reason: `${rngTicker} market cap: ${rngMcap}` },
    ],
  });
}

return await main();
