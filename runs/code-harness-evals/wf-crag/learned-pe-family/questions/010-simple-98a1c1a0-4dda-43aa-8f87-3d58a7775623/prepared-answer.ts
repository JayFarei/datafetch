const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-pe-family/questions/010-simple-98a1c1a0-4dda-43aa-8f87-3d58a7775623/workspace");

// CRAG finance — simple question 98a1c1a0-4dda-43aa-8f87-3d58a7775623
//
// Question (verbatim):
// what is the price-to-earnings ratio of haia
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const matches = await df.db.records.search("haia");
  const ticker = matches[0]?.id;
  if (!ticker) {
    return df.answer({ status: "unsupported", value: "i don't know", evidence: [] });
  }
  const pe = await df.tool.cragFinance.get_pe_ratio({ ticker });
  return df.answer({
    status: "answered",
    value: pe,
    evidence: [{ recordKey: matches[0].recordKey, reason: `P/E ratio for ${ticker}` }],
  });
}

return await main();
