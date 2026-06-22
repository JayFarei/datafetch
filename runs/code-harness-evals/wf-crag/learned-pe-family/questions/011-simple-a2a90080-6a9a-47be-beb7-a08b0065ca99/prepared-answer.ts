const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-pe-family/questions/011-simple-a2a90080-6a9a-47be-beb7-a08b0065ca99/workspace");

// CRAG finance — simple question a2a90080-6a9a-47be-beb7-a08b0065ca99
//
// Question (verbatim):
// what's the price-to-earnings ratio of ovbc as of now?
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
