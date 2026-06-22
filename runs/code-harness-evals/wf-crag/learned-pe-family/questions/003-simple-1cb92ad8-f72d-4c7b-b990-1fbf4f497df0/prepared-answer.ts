const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-pe-family/questions/003-simple-1cb92ad8-f72d-4c7b-b990-1fbf4f497df0/workspace");

// CRAG finance — simple question 1cb92ad8-f72d-4c7b-b990-1fbf4f497df0
//
// Question (verbatim):
// what's the current stock price-to-earnings ratio of motus gi holdings?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const matches = await df.db.records.search("Motus GI Holdings");
  const ticker = matches[0]?.id;
  if (!ticker) {
    return df.answer({ status: "unsupported", value: null, evidence: [] });
  }
  const pe = await df.tool.cragFinance.get_pe_ratio({ ticker });
  return df.answer({
    status: "answered",
    value: pe,
    evidence: [{ recordKey: matches[0].recordKey, reason: `P/E ratio for ${ticker}` }],
  });
}

return await main();
