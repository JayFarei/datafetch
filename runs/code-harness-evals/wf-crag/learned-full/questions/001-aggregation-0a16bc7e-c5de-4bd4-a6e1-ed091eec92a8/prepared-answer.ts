const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-full/questions/001-aggregation-0a16bc7e-c5de-4bd4-a6e1-ed091eec92a8/workspace");

// CRAG finance — aggregation question 0a16bc7e-c5de-4bd4-a6e1-ed091eec92a8
//
// Question (verbatim):
// how many stock holdings in spy that has over 5% weightage
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // Anchor the substrate-rooted chain by looking up SPY in the company database
  const matches = await df.db.records.search("SPY S&P 500 ETF");

  // Get SPY holdings info via get_info
  const info = await df.tool.cragFinance.get_info({ ticker: "SPY" });

  // SPY holdings are typically in info.holdings
  const holdings = info.holdings as Array<{ symbol: string; holdingPercent: number }> | undefined;

  if (!holdings || holdings.length === 0) {
    return df.answer({
      status: "unsupported",
      value: "i don't know",
      evidence: [],
      reason: "No holdings data available for SPY",
    });
  }

  const over5pct = holdings.filter((h) => h.holdingPercent > 0.05);

  return df.answer({
    status: "answered",
    value: over5pct.length,
    evidence: [{ reason: `SPY holdings with >5% weight: ${over5pct.map(h => h.symbol + "=" + (h.holdingPercent*100).toFixed(2) + "%").join(", ")}` }],
  });
}

return await main();

