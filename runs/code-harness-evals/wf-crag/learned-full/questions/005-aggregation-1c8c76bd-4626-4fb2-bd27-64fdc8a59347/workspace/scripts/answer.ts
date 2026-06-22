// CRAG finance — aggregation question 1c8c76bd-4626-4fb2-bd27-64fdc8a59347
//
// Question (verbatim):
// blmn average closing price last week?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // BLMN is the ticker for Bloomin' Brands — confirm via db
  const matches = await df.db.records.search("BLMN");
  const ticker = matches[0]?.id ?? "BLMN";

  const history = await df.tool.cragFinance.get_price_history({ ticker });

  // As of 02/23/2024 (Saturday), "last week" = Mon 02/12 – Fri 02/16/2024
  const lastWeekDates = ["2024-02-12", "2024-02-13", "2024-02-14", "2024-02-15", "2024-02-16"];

  const closes = lastWeekDates
    .map(d => history[d]?.Close)
    .filter((v): v is number => v !== undefined);

  if (closes.length === 0) {
    return df.answer({ status: "unsupported", value: null, evidence: [] });
  }

  const avg = closes.reduce((a, b) => a + b, 0) / closes.length;
  const rounded = Math.round(avg * 100) / 100;

  return df.answer({
    status: "answered",
    value: rounded,
    evidence: [{ reason: `Closes ${closes.join(", ")} over ${closes.length} trading days` }],
  });
}

return await main();
