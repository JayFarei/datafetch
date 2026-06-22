// CRAG finance — comparison question 25d230b2-e518-45e7-8c67-a762571fb5fe
//
// Question (verbatim):
// which company have larger market cap, rbc or rng?
//
// Replace the body below. Inspect /df.d.ts for every available surface
// (df.db data, df.tool adapters, and any df.lib learned helpers), pick
// whatever fits this question best, compute, then RETURN df.answer(...).

async function main() {
  const [rbcResults, rngResults] = await Promise.all([
    df.db.records.search("RBC Royal Bank Canada", { limit: 3 }),
    df.db.records.search("RNG RingCentral", { limit: 3 }),
  ]);

  const rbcRecord = rbcResults[0];
  const rngRecord = rngResults[0];

  const rbcTicker = rbcRecord?.attributes?.symbol ?? "RY";
  const rngTicker = rngRecord?.attributes?.symbol ?? "RNG";

  const [rbcMcap, rngMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: rbcTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: rngTicker }),
  ]);

  const winner = rbcMcap >= rngMcap ? "RBC" : "RNG";

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { recordKey: rbcRecord?.recordKey, reason: `RBC (${rbcTicker}) market cap: ${rbcMcap}` },
      { recordKey: rngRecord?.recordKey, reason: `RNG (${rngTicker}) market cap: ${rngMcap}` },
    ],
  });
}

return await main();
