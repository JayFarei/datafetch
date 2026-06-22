const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-full/questions/009-comparison-0fd92bc4-5945-4b2a-b40e-c067d871ab29/workspace");

// CRAG finance — comparison question 0fd92bc4-5945-4b2a-b40e-c067d871ab29
//
// Question (verbatim):
// which company has a higher pe ratio, wu or  adt?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const [wuMatches, adtMatches] = await Promise.all([
    df.db.records.search("WU Western Union"),
    df.db.records.search("ADT"),
  ]);

  const wuTicker = wuMatches[0]?.id ?? "WU";
  const adtTicker = adtMatches[0]?.id ?? "ADT";

  const [wuPE, adtPE] = await Promise.all([
    df.tool.cragFinance.get_pe_ratio({ ticker: wuTicker }),
    df.tool.cragFinance.get_pe_ratio({ ticker: adtTicker }),
  ]);

  const higher = wuPE > adtPE ? "WU" : "ADT";

  return df.answer({
    status: "answered",
    value: higher,
    evidence: [
      { reason: `WU PE ratio: ${wuPE}` },
      { reason: `ADT PE ratio: ${adtPE}` },
    ],
  });
}

return await main();

