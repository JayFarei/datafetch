const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/cold/questions/007-aggregation-26c66de1-e750-49b4-8c4b-c03a05e1e41d/workspace");

// CRAG finance — aggregation question 26c66de1-e750-49b4-8c4b-c03a05e1e41d
//
// Question (verbatim):
// can you tell me the number of days pev closed higher this week?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // Resolve PEV via db
  const matches = await df.db.records.search("PEV");
  const ticker = "PEV"; // PEV is already a ticker symbol

  const history = await df.tool.cragFinance.get_price_history({ ticker });

  // As of 02/23/2024, 15:00:22 PT — "this week" = week of Feb 19–23, 2024
  const weekDates = ["2024-02-20", "2024-02-21", "2024-02-22", "2024-02-23"];

  let daysHigher = 0;
  for (const date of weekDates) {
    const bar = history[date];
    if (bar && bar.Close > bar.Open) {
      daysHigher++;
    }
  }

  return df.answer({
    status: "answered",
    value: daysHigher,
    evidence: [{ reason: `PEV price history checked for week of Feb 19-23 2024; ${daysHigher} days closed higher than open` }],
  });
}

return await main();

