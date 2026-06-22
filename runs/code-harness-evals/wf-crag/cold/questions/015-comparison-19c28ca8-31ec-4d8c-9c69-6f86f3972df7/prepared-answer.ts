const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/cold/questions/015-comparison-19c28ca8-31ec-4d8c-9c69-6f86f3972df7/workspace");

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

  // Find the most recent week's data (last 5 trading days or last week)
  const mostRecentDate = dates[dates.length - 1];
  // Get all dates in the same week as the most recent date
  const recentD = new Date(mostRecentDate);
  // Find dates within 7 days of the most recent date
  const weekDates = dates.filter(d => {
    const diff = (recentD.getTime() - new Date(d).getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff < 7;
  });

  const weekLow = Math.min(...weekDates.map(d => history[d].Low));

  return df.answer({
    status: "answered",
    value: weekLow,
    evidence: [{ reason: `Ticker: ${ticker}, week dates: ${weekDates.join(", ")}, low: ${weekLow}` }],
  });
}

return await main();

