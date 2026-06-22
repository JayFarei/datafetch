const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-pe-family/questions/012-simple-adaaf1ac-17cc-43ea-b5df-2a9a00370bf5/workspace");

// CRAG finance — simple question adaaf1ac-17cc-43ea-b5df-2a9a00370bf5
//
// Question (verbatim):
// can you tell me the p/e ratio of wldsw?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const matches = await df.db.records.search("WLDSW");
  const record = matches[0];
  const ticker = record?.id ?? "WLDSW";
  const pe = await df.tool.cragFinance.get_pe_ratio({ ticker });
  if (pe == null) {
    return df.answer({ status: "unsupported", value: "i don't know", evidence: [] });
  }
  return df.answer({
    status: "answered",
    value: pe,
    evidence: record ? [{ recordKey: record.recordKey }] : [],
  });
}

return await main();
