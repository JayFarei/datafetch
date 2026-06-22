// CRAG finance — aggregation question 0b2d62b4-cc68-4fbc-8f57-f9891df3751f
//
// Question (verbatim):
// how many days did dhcni close higher this week?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // Resolve DHCNI via company database
  const matches = await df.db.records.search("DHCNI");
  const ticker = matches[0]?.id ?? "DHCNI";

  const history = await df.tool.cragFinance.get_price_history({ ticker });

  // As of 02/23/2024 (Friday), "this week" = Mon 02/19 through Fri 02/23
  const weekDates = ["2024-02-20", "2024-02-21", "2024-02-22", "2024-02-23"];
  // Note: 02/19 is Presidents' Day (market closed), so week starts 02/20

  let count = 0;
  for (const date of weekDates) {
    const day = history[date];
    if (day && day.Close > day.Open) {
      count++;
    }
  }

  return df.answer({
    status: "answered",
    value: count,
    evidence: [],
  });
}

return await main();
