// CRAG finance — multi-hop question c0cb88b5-1de7-41f3-a832-aee4c3f85412
//
// Question (verbatim):
// what is the stock price of the company that currently has a higher market cap than apple?
//
// Replace the body below. Inspect /df.d.ts for every available surface
// (df.db data, df.tool adapters, and any df.lib learned helpers), pick
// whatever fits this question best, compute, then RETURN df.answer(...).

async function main() {
  // Step 1: Get Apple's market cap
  const appleRecords = await df.db.records.search("Apple Inc", { limit: 3 });
  const appleRecord = appleRecords.find(r => r.attributes.symbol === "AAPL" || r.label.toLowerCase().includes("apple"));
  const appleTicker = appleRecord ? appleRecord.attributes.symbol : "AAPL";
  const appleMcap = await df.tool.cragFinance.get_market_capitalization({ ticker: appleTicker });

  // Step 2: Find companies with higher market cap - check Microsoft (MSFT) as likely candidate
  const msftRecords = await df.db.records.search("Microsoft", { limit: 3 });
  const msftRecord = msftRecords.find(r => r.attributes.symbol === "MSFT" || r.label.toLowerCase().includes("microsoft"));
  const msftTicker = msftRecord ? msftRecord.attributes.symbol : "MSFT";
  const msftMcap = await df.tool.cragFinance.get_market_capitalization({ ticker: msftTicker });

  if (msftMcap > appleMcap) {
    // Get MSFT stock price from price history
    const history = await df.tool.cragFinance.get_price_history({ ticker: msftTicker });
    const dates = Object.keys(history).sort();
    const latestDate = dates[dates.length - 1];
    const latestPrice = history[latestDate].Close;

    return df.answer({
      status: "answered",
      value: latestPrice,
      evidence: [
        { recordKey: msftRecord?.recordKey, reason: `Microsoft market cap ${msftMcap} > Apple market cap ${appleMcap}; latest close price on ${latestDate}` }
      ],
    });
  }

  // If no company found with higher market cap, the premise is false
  return df.answer({
    status: "answered",
    value: "invalid question",
    evidence: [
      { reason: `No company found with higher market cap than Apple (${appleMcap})` }
    ],
  });
}

return await main();
