// CRAG finance — aggregation question 0a16bc7e-c5de-4bd4-a6e1-ed091eec92a8
//
// Question (verbatim):
// how many stock holdings in spy that has over 5% weightage
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // Anchor to substrate by looking up SPY
  const matches = await df.db.records.search("SPY SPDR S&P 500");

  // Get SPY info which should include holdings/weights
  const info = await df.tool.cragFinance.get_info({ ticker: "SPY" });

  // Check if holdings data is available
  const holdings = (info as any).holdings;

  if (!holdings || !Array.isArray(holdings)) {
    return df.answer({
      status: "unsupported",
      value: "i don't know",
      evidence: [],
      reason: "Holdings data not available in SPY info",
    });
  }

  // Count holdings with over 5% weight
  const over5pct = holdings.filter((h: any) => {
    const weight = h.holdingPercent ?? h.weight ?? h.percentage ?? 0;
    return weight > 5;
  });

  return df.answer({
    status: "answered",
    value: over5pct.length,
    evidence: [{ reason: `SPY holdings with >5% weight: ${over5pct.map((h: any) => h.symbol + ' ' + (h.holdingPercent ?? h.weight)).join(', ')}` }],
  });
}

return await main();
