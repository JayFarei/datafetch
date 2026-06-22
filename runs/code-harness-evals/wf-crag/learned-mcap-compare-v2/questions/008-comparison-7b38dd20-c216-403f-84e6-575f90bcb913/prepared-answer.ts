const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare-v2/questions/008-comparison-7b38dd20-c216-403f-84e6-575f90bcb913/workspace");

// CRAG finance — comparison question 7b38dd20-c216-403f-84e6-575f90bcb913
//
// Question (verbatim):
// which of the two companies, bksy or cvcy, has a higher market capitalization?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const [bksyMatches, cvcyMatches] = await Promise.all([
    df.db.records.search("BKSY", { limit: 1 }),
    df.db.records.search("CVCY", { limit: 1 }),
  ]);

  const bksyTicker = bksyMatches[0]?.id ?? "BKSY";
  const cvcyTicker = cvcyMatches[0]?.id ?? "CVCY";

  const [bksyMcap, cvcyMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: bksyTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: cvcyTicker }),
  ]);

  const winner = bksyMcap > cvcyMcap ? bksyTicker : cvcyTicker;

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { recordKey: bksyMatches[0]?.recordKey, reason: `BKSY market cap: ${bksyMcap}` },
      { recordKey: cvcyMatches[0]?.recordKey, reason: `CVCY market cap: ${cvcyMcap}` },
    ],
  });
}

return await main();
