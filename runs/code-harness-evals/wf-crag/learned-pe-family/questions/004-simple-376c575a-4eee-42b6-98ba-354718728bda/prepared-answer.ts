const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-pe-family/questions/004-simple-376c575a-4eee-42b6-98ba-354718728bda/workspace");

// CRAG finance — simple question 376c575a-4eee-42b6-98ba-354718728bda
//
// Question (verbatim):
// can you provide me with the p/e ratio of dmaq?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // const matches = await df.db.records.search("Apple");
  // const ticker = matches[0]?.id;
  // const pe = await df.tool.cragFinance.get_pe_ratio({ ticker });
  return df.answer({
    status: "unsupported",
    value: null,
    evidence: [],
  });
}

return await main();
