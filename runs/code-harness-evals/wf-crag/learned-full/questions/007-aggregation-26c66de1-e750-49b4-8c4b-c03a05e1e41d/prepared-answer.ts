const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-full/questions/007-aggregation-26c66de1-e750-49b4-8c4b-c03a05e1e41d/workspace");

// CRAG finance — aggregation question 26c66de1-e750-49b4-8c4b-c03a05e1e41d
//
// Question (verbatim):
// can you tell me the number of days pev closed higher this week?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // Resolve PEV via substrate
  const matches = await df.db.records.search("PEV");
  const ticker = "PEV";

  const priceHistory = await df.tool.cragFinance.get_price_history({ ticker });

  // "this week" as of 02/23/2024 (Friday) => Mon 02/19 through Fri 02/23
  const weekDates = ["2024-02-20", "2024-02-21", "2024-02-22", "2024-02-23"];
  // Note: 02/19 is Presidents' Day (market closed), so week starts 02/20

  let daysClosedHigher = 0;
  for (const date of weekDates) {
    const day = priceHistory[date];
    if (day && day.Close > day.Open) {
      daysClosedHigher++;
    }
  }

  return df.answer({
    status: "answered",
    value: daysClosedHigher,
    evidence: weekDates.map(d => ({ reason: `${d}: ${priceHistory[d] ? `Open=${priceHistory[d].Open} Close=${priceHistory[d].Close}` : "no data"}` })),
  });
}

return await main();

