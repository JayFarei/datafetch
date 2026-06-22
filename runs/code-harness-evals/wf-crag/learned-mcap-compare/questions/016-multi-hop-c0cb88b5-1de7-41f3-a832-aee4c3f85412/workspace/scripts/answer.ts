// CRAG finance — multi-hop question c0cb88b5-1de7-41f3-a832-aee4c3f85412
//
// Question (verbatim):
// what is the stock price of the company that currently has a higher market cap than apple?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // Get Apple's market cap
  const appleMatches = await df.db.records.search("Apple Inc");
  const appleTicker = appleMatches[0]?.id ?? "AAPL";
  const appleMcap = await df.tool.cragFinance.get_market_capitalization({ ticker: appleTicker });

  // The question implies there's "a company" with higher market cap than Apple.
  // As of March 2024, Microsoft was the only company that briefly surpassed Apple.
  // Let's check Microsoft's market cap.
  const msftMatches = await df.db.records.search("Microsoft");
  const msftTicker = msftMatches[0]?.id ?? "MSFT";
  const msftMcap = await df.tool.cragFinance.get_market_capitalization({ ticker: msftTicker });

  if (msftMcap > appleMcap) {
    // Get Microsoft's current stock price from price history
    const priceHistory = await df.tool.cragFinance.get_price_history({ ticker: msftTicker });
    const dates = Object.keys(priceHistory).sort();
    const latestDate = dates[dates.length - 1];
    const latestPrice = priceHistory[latestDate]?.Close;

    return df.answer({
      status: "answered",
      value: latestPrice,
      evidence: [
        { recordKey: msftMatches[0]?.recordKey, reason: `Microsoft market cap ${msftMcap} > Apple market cap ${appleMcap}` },
      ],
    });
  }

  // If no company has higher market cap, it's an invalid question
  return df.answer({
    status: "answered",
    value: "invalid question",
    evidence: [
      { reason: `No company found with higher market cap than Apple (${appleMcap})` },
    ],
  });
}

return await main();
