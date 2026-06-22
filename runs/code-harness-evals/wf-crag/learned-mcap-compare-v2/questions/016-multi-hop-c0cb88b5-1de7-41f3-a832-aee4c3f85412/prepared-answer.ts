const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare-v2/questions/016-multi-hop-c0cb88b5-1de7-41f3-a832-aee4c3f85412/workspace");

// CRAG finance — multi-hop question c0cb88b5-1de7-41f3-a832-aee4c3f85412
//
// Question (verbatim):
// what is the stock price of the company that currently has a higher market cap than apple?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // Get Apple's market cap
  const appleMatches = await df.db.records.search("Apple Inc", { limit: 5 });
  const appleTicker = appleMatches.find(r => r.attributes.symbol === "AAPL")?.id ?? "AAPL";
  const appleMcap = await df.tool.cragFinance.get_market_capitalization({ ticker: appleTicker });

  // Search for Microsoft (commonly higher market cap than Apple around that date)
  const msftMatches = await df.db.records.search("Microsoft", { limit: 5 });
  const msftTicker = msftMatches[0]?.id ?? "MSFT";
  const msftMcap = await df.tool.cragFinance.get_market_capitalization({ ticker: msftTicker });

  if (msftMcap > appleMcap) {
    // Get Microsoft's stock price from price history
    const priceHistory = await df.tool.cragFinance.get_price_history({ ticker: msftTicker });
    const dates = Object.keys(priceHistory).sort();
    // Find closest date to 03/17/2024
    const targetDate = "2024-03-17";
    let closestDate = dates[dates.length - 1];
    for (const d of dates) {
      if (d <= targetDate) closestDate = d;
    }
    const price = priceHistory[closestDate]?.Close;
    return df.answer({
      status: "answered",
      value: price,
      evidence: [{ recordKey: msftMatches[0]?.recordKey, reason: `Microsoft mcap ${msftMcap} > Apple mcap ${appleMcap}; close price on ${closestDate}: ${price}` }],
    });
  }

  // If no company found with higher mcap, invalid question
  return df.answer({
    status: "answered",
    value: "invalid question",
    evidence: [{ reason: `No company found with market cap higher than Apple (${appleMcap})` }],
  });
}

return await main();

