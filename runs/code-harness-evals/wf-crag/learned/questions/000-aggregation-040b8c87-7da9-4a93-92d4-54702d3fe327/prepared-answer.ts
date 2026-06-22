const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned/questions/000-aggregation-040b8c87-7da9-4a93-92d4-54702d3fe327/workspace");

// CRAG finance — aggregation question 040b8c87-7da9-4a93-92d4-54702d3fe327
//
// Question (verbatim):
// what is the market share of microsoft in the cloud computing industry compared to its competitors?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // Resolve Microsoft via substrate (required by contract)
  const matches = await df.db.records.search("Microsoft");
  const msft = matches[0];

  // The available tools provide stock/financial market data only (price, PE, market cap, EPS).
  // Cloud computing market share is an industry research metric not derivable from these tools.
  return df.answer({
    status: "unsupported",
    value: "i don't know",
    evidence: msft ? [{ recordKey: msft.recordKey, reason: "Microsoft resolved but cloud market share data is unavailable in the finance tool suite" }] : [],
  });
}

return await main();
