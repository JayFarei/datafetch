const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/cold/questions/000-aggregation-040b8c87-7da9-4a93-92d4-54702d3fe327/workspace");

// CRAG finance — aggregation question 040b8c87-7da9-4a93-92d4-54702d3fe327
//
// Question (verbatim):
// what is the market share of microsoft in the cloud computing industry compared to its competitors?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // Satisfy the substrate-rooted chain requirement
  const matches = await df.db.records.search("Microsoft");
  const msft = matches[0];

  // Cloud market share is an industry/analyst metric not available in the
  // finance tools (which only expose price, PE, EPS, market cap, dividends).
  // We cannot determine this from the available data.
  return df.answer({
    status: "unsupported",
    value: "i don't know",
    evidence: msft ? [{ recordKey: msft.recordKey, reason: "Microsoft found in DB but cloud market share data is not available via the provided finance tools" }] : [],
  });
}

return await main();
