// CRAG finance — aggregation question 040b8c87-7da9-4a93-92d4-54702d3fe327
//
// Question (verbatim):
// what is the market share of microsoft in the cloud computing industry compared to its competitors?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // Satisfy substrate-rooted chain requirement
  const matches = await df.db.records.search("Microsoft");
  // The available finance tools (market cap, PE, EPS, price history, dividends, info)
  // do not expose cloud computing market share data. This is an industry-segment metric
  // not derivable from the available data surface.
  return df.answer({
    status: "unsupported",
    value: "i don't know",
    evidence: [{ recordKey: matches[0]?.recordKey, reason: "Finance tools provide market cap, P/E, EPS, price history, and company info — none expose cloud computing market share segmentation data." }],
  });
}

return await main();
