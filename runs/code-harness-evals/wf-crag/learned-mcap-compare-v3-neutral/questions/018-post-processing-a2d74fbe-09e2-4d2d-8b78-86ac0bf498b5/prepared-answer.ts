const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare-v3-neutral/questions/018-post-processing-a2d74fbe-09e2-4d2d-8b78-86ac0bf498b5/workspace");

// CRAG finance — post-processing question a2d74fbe-09e2-4d2d-8b78-86ac0bf498b5
//
// Question (verbatim):
// how big is the market cap of the new york stock exchange compared to the london stock exchange?
//
// Replace the body below. Inspect /df.d.ts for every available surface
// (df.db data, df.tool adapters, and any df.lib learned helpers), pick
// whatever fits this question best, compute, then RETURN df.answer(...).

async function main() {
  // Search for NYSE (Intercontinental Exchange, parent of NYSE) and LSE Group
  const [nyseRecords, lseRecords] = await Promise.all([
    df.db.records.search("New York Stock Exchange NYSE ICE Intercontinental Exchange", { limit: 5 }),
    df.db.records.search("London Stock Exchange LSE Group", { limit: 5 }),
  ]);

  // Try tickers: ICE for NYSE parent, LSEG.L or LSE for London Stock Exchange Group
  // Also try direct ticker lookups
  const nyseTicker = "ICE";
  const lseTicker = "LSEG.L";

  const [nyseMcap, lseMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: nyseTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: lseTicker }),
  ]);

  const ratio = nyseMcap / lseMcap;

  return df.answer({
    status: "answered",
    value: `NYSE (Intercontinental Exchange, ticker ICE) market cap: ~$${(nyseMcap / 1e9).toFixed(2)}B; London Stock Exchange Group (LSEG.L) market cap: ~$${(lseMcap / 1e9).toFixed(2)}B. NYSE is approximately ${ratio.toFixed(2)}x the size of the LSE by market cap.`,
    evidence: [
      { reason: `ICE (NYSE parent) market cap: ${nyseMcap}` },
      { reason: `LSEG.L (LSE Group) market cap: ${lseMcap}` },
    ],
  });
}

return await main();

