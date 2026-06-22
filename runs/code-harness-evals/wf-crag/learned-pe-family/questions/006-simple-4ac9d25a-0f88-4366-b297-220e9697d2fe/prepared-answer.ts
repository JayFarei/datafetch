const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-pe-family/questions/006-simple-4ac9d25a-0f88-4366-b297-220e9697d2fe/workspace");

// CRAG finance — simple question 4ac9d25a-0f88-4366-b297-220e9697d2fe
//
// Question (verbatim):
// what is the current price-to-earnings ratio of littelfuse ?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const matches = await df.db.records.search("Littelfuse");
  const ticker = matches[0]?.id;
  const pe = await df.tool.cragFinance.get_pe_ratio({ ticker });
  return df.answer({
    status: "answered",
    value: pe,
    evidence: [{ recordKey: matches[0]?.recordKey, reason: `P/E ratio for ${ticker}` }],
  });
}

return await main();
