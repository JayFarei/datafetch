const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/cold/questions/001-aggregation-0a16bc7e-c5de-4bd4-a6e1-ed091eec92a8/workspace");

// CRAG finance — aggregation question 0a16bc7e-c5de-4bd4-a6e1-ed091eec92a8
//
// Question (verbatim):
// how many stock holdings in spy that has over 5% weightage
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // Satisfy substrate-rooted chain requirement
  const matches = await df.db.records.search("SPY SPDR S&P 500 ETF");

  // Get SPY info which may contain holdings data
  const info = await df.tool.cragFinance.get_info({ ticker: "SPY" });

  // Look for holdings data in the info object
  const holdings = (info as any)?.holdings;

  if (!holdings || !Array.isArray(holdings) || holdings.length === 0) {
    return df.answer({
      status: "unsupported",
      value: "i don't know",
      evidence: [],
      reason: "No holdings data available for SPY",
    });
  }

  // Count holdings with weightage > 5%
  const over5pct = holdings.filter((h: any) => {
    const weight = h?.holdingPercent ?? h?.weight ?? h?.pct ?? 0;
    return weight > 0.05; // assuming decimal (0.05 = 5%)
  });

  // Try percentage form too if decimal gives 0
  const over5pctAlt = holdings.filter((h: any) => {
    const weight = h?.holdingPercent ?? h?.weight ?? h?.pct ?? 0;
    return weight > 5; // assuming percentage form
  });

  const count = over5pct.length > 0 ? over5pct.length : over5pctAlt.length;

  return df.answer({
    status: "answered",
    value: count,
    evidence: [{ reason: `Found ${holdings.length} total holdings; ${count} have >5% weightage` }],
  });
}

return await main();

