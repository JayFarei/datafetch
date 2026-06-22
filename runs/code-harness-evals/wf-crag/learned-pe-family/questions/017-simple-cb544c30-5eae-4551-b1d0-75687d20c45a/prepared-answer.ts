const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-pe-family/questions/017-simple-cb544c30-5eae-4551-b1d0-75687d20c45a/workspace");

// CRAG finance — simple question cb544c30-5eae-4551-b1d0-75687d20c45a
//
// Question (verbatim):
// i'm looking for the p/e ratio of gne. would you happen to know what it is?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const matches = await df.db.records.search("GNE");
  const record = matches[0];
  const ticker = record?.id ?? "GNE";
  const pe = await df.tool.cragFinance.get_pe_ratio({ ticker });
  return df.answer({
    status: "answered",
    value: pe,
    evidence: [{ recordKey: record?.recordKey, reason: `P/E ratio for ${ticker}` }],
  });
}

return await main();
