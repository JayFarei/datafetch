const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare-v3-neutral/questions/004-comparison-4ae56c2a-9c76-429b-a660-448bbaeb3632/workspace");

// CRAG finance — comparison question 4ae56c2a-9c76-429b-a660-448bbaeb3632
//
// Question (verbatim):
// does berskhire hathaway have a higher market cap than tesla?
//
// Replace the body below. Inspect /df.d.ts for every available surface
// (df.db data, df.tool adapters, and any df.lib learned helpers), pick
// whatever fits this question best, compute, then RETURN df.answer(...).

async function main() {
  const [brkRecords, tslaRecords] = await Promise.all([
    df.db.records.search("Berkshire Hathaway", { limit: 3 }),
    df.db.records.search("Tesla", { limit: 3 }),
  ]);

  const brkRecord = brkRecords[0];
  const tslaRecord = tslaRecords[0];

  const brkTicker = brkRecord?.attributes?.symbol ?? "BRK-B";
  const tslaTicker = tslaRecord?.attributes?.symbol ?? "TSLA";

  const [brkMcap, tslaMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: brkTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: tslaTicker }),
  ]);

  const answer = brkMcap > tslaMcap ? "yes" : "no";

  return df.answer({
    status: "answered",
    value: answer,
    evidence: [
      { recordKey: brkRecord?.recordKey, reason: `Berkshire Hathaway (${brkTicker}) market cap: ${brkMcap}` },
      { recordKey: tslaRecord?.recordKey, reason: `Tesla (${tslaTicker}) market cap: ${tslaMcap}` },
    ],
  });
}

return await main();
