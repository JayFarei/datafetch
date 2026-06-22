const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-full/questions/002-aggregation-0b2d62b4-cc68-4fbc-8f57-f9891df3751f/workspace");

// CRAG finance — aggregation question 0b2d62b4-cc68-4fbc-8f57-f9891df3751f
//
// Question (verbatim):
// how many days did dhcni close higher this week?
//
// As of 02/23/2024, 15:00:49 PT — "this week" = Mon 02/19 through Fri 02/23/2024.

async function main() {
  // Resolve DHCNI via company DB (satisfies substrate-rooted chain requirement)
  const matches = await df.db.records.search("DHCNI");
  const ticker = matches[0]?.id ?? "DHCNI";

  const history = await df.tool.cragFinance.get_price_history({ ticker });

  // "This week" relative to 02/23/2024 = 2024-02-19 through 2024-02-23
  const weekStart = new Date("2024-02-19");
  const weekEnd = new Date("2024-02-23");

  let count = 0;
  for (const [dateStr, bar] of Object.entries(history)) {
    const d = new Date(dateStr);
    if (d >= weekStart && d <= weekEnd) {
      if (bar.Close > bar.Open) count++;
    }
  }

  return df.answer({
    status: "answered",
    value: count,
    evidence: [],
  });
}

return await main();

