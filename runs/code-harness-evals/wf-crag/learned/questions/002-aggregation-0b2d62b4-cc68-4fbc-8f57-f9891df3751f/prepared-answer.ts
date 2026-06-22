const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned/questions/002-aggregation-0b2d62b4-cc68-4fbc-8f57-f9891df3751f/workspace");

// CRAG finance — aggregation question 0b2d62b4-cc68-4fbc-8f57-f9891df3751f
//
// Question (verbatim):
// how many days did dhcni close higher this week?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // DHCNI is a ticker symbol, search for it in the database
  const matches = await df.db.records.search("DHCNI");
  const ticker = matches[0]?.id ?? "DHCNI";

  const priceHistory = await df.tool.cragFinance.get_price_history({ ticker });

  // As of 02/23/2024 (Friday), "this week" = Mon 02/19 through Fri 02/23/2024
  // But 02/19 is Presidents' Day (market holiday), so trading days: 02/20, 02/21, 02/22, 02/23
  const weekDates = ["2024-02-20", "2024-02-21", "2024-02-22", "2024-02-23"];

  let higherCount = 0;
  for (const date of weekDates) {
    const day = priceHistory[date];
    if (day && day.Close > day.Open) {
      higherCount++;
    }
  }

  return df.answer({
    status: "answered",
    value: higherCount,
    evidence: [],
  });
}

return await main();

