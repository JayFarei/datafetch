const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-full/questions/015-comparison-19c28ca8-31ec-4d8c-9c69-6f86f3972df7/workspace");

// CRAG finance — comparison question 19c28ca8-31ec-4d8c-9c69-6f86f3972df7
//
// Question (verbatim):
// what was the weekly low stock price of inflection point acquisition corp. ii unit in the most recent week?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const matches = await df.db.records.search("inflection point acquisition corp ii unit");
  const ticker = matches[0]?.id;
  if (!ticker) {
    return df.answer({ status: "unsupported", value: "i don't know", evidence: [] });
  }

  const history = await df.tool.cragFinance.get_price_history({ ticker });
  const dates = Object.keys(history).sort();
  if (dates.length === 0) {
    return df.answer({ status: "unsupported", value: "i don't know", evidence: [] });
  }

  // Find the most recent week: group by week, pick latest week, find weekly low
  // "Most recent week" = last 7 calendar days from latest date in data
  const latestDate = new Date(dates[dates.length - 1]);
  const cutoff = new Date(latestDate);
  cutoff.setDate(cutoff.getDate() - 6);

  let weeklyLow = Infinity;
  for (const date of dates) {
    const d = new Date(date);
    if (d >= cutoff && d <= latestDate) {
      if (history[date].Low < weeklyLow) {
        weeklyLow = history[date].Low;
      }
    }
  }

  if (weeklyLow === Infinity) {
    return df.answer({ status: "unsupported", value: "i don't know", evidence: [] });
  }

  return df.answer({
    status: "answered",
    value: weeklyLow,
    evidence: [{ recordKey: matches[0].recordKey, reason: `Weekly low for ${ticker} in most recent week ending ${dates[dates.length - 1]}` }],
  });
}

return await main();

