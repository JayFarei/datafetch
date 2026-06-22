// CRAG finance — aggregation question 0cc26310-086b-4c6f-a168-8c2a0f9fd8b4
//
// Question (verbatim):
// wavsw average closing price last week?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // Search for WAVSW in the company database
  const matches = await df.db.records.search("WAVSW");

  // Get price history for WAVSW
  const priceHistory = await df.tool.cragFinance.get_price_history({ ticker: "WAVSW" });

  // As of 02/23/2024, "last week" = Feb 12-16, 2024
  const lastWeekDates = ["2024-02-12", "2024-02-13", "2024-02-14", "2024-02-15", "2024-02-16"];

  const closes: number[] = [];
  for (const date of lastWeekDates) {
    if (priceHistory[date] !== undefined) {
      closes.push(priceHistory[date].Close);
    }
  }

  if (closes.length === 0) {
    return df.answer({ status: "unsupported", value: "i don't know", evidence: [] });
  }

  const avg = closes.reduce((a, b) => a + b, 0) / closes.length;
  const rounded = Math.round(avg * 100) / 100;

  return df.answer({
    status: "answered",
    value: rounded,
    evidence: [{ reason: `Average closing price of WAVSW for week of Feb 12-16 2024 based on ${closes.length} trading days` }],
  });
}

return await main();
