const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare-v2/questions/018-post-processing-a2d74fbe-09e2-4d2d-8b78-86ac0bf498b5/workspace");

// CRAG finance — post-processing question a2d74fbe-09e2-4d2d-8b78-86ac0bf498b5
//
// Question (verbatim):
// how big is the market cap of the new york stock exchange compared to the london stock exchange?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // NYSE is operated by Intercontinental Exchange (ICE), London Stock Exchange Group (LSEG) is the LSE operator
  const nyseMatches = await df.db.records.search("Intercontinental Exchange NYSE", { limit: 5 });
  const lseMatches = await df.db.records.search("London Stock Exchange Group", { limit: 5 });

  const nyseTicker = nyseMatches[0]?.id;
  const lseTicker = lseMatches[0]?.id;

  if (!nyseTicker || !lseTicker) {
    return df.answer({ status: "unsupported", value: "i don't know", evidence: [] });
  }

  const [nyseMcap, lseMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: nyseTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: lseTicker }),
  ]);

  const ratio = nyseMcap / lseMcap;

  return df.answer({
    status: "answered",
    value: `NYSE (Intercontinental Exchange, ${nyseTicker}) market cap: ~$${(nyseMcap / 1e9).toFixed(2)}B; London Stock Exchange Group (${lseTicker}) market cap: ~$${(lseMcap / 1e9).toFixed(2)}B. NYSE operator is roughly ${ratio.toFixed(2)}x the size of LSEG by market cap.`,
    evidence: [
      { recordKey: nyseMatches[0]?.recordKey, reason: `NYSE operator ticker ${nyseTicker} mcap ${nyseMcap}` },
      { recordKey: lseMatches[0]?.recordKey, reason: `LSEG ticker ${lseTicker} mcap ${lseMcap}` },
    ],
  });
}

return await main();

