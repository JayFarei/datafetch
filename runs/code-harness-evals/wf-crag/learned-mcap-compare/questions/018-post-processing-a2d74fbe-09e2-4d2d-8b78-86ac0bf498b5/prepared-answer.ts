const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare/questions/018-post-processing-a2d74fbe-09e2-4d2d-8b78-86ac0bf498b5/workspace");

// CRAG finance — post-processing question a2d74fbe-09e2-4d2d-8b78-86ac0bf498b5
//
// Question (verbatim):
// how big is the market cap of the new york stock exchange compared to the london stock exchange?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // Search for NYSE (Intercontinental Exchange owns NYSE) and London Stock Exchange
  const nyseMatches = await df.db.records.search("New York Stock Exchange", { limit: 5 });
  const lseMatches = await df.db.records.search("London Stock Exchange", { limit: 5 });

  // NYSE is owned by Intercontinental Exchange (ICE)
  // LSE is London Stock Exchange Group (LSEG)
  const iceTicker = nyseMatches[0]?.id ?? "ICE";
  const lseTicker = lseMatches[0]?.id;

  const nyseMcap = await df.tool.cragFinance.get_market_capitalization({ ticker: iceTicker });
  let lseMcap: number | null = null;
  if (lseTicker) {
    lseMcap = await df.tool.cragFinance.get_market_capitalization({ ticker: lseTicker });
  }

  if (!nyseMcap || !lseMcap) {
    return df.answer({
      status: "unsupported",
      value: "i don't know",
      evidence: [],
    });
  }

  const ratio = nyseMcap / lseMcap;

  return df.answer({
    status: "answered",
    value: `The New York Stock Exchange (operator: ICE, ticker ${iceTicker}) has a market cap of ~$${(nyseMcap / 1e9).toFixed(2)}B, while the London Stock Exchange Group (ticker ${lseTicker}) has a market cap of ~$${(lseMcap / 1e9).toFixed(2)}B. NYSE's operator is approximately ${ratio.toFixed(2)}x the size of LSE's operator by market cap.`,
    evidence: [
      { recordKey: nyseMatches[0]?.recordKey, reason: `NYSE operator market cap: $${nyseMcap}` },
      { recordKey: lseMatches[0]?.recordKey, reason: `LSE market cap: $${lseMcap}` },
    ],
  });
}

return await main();

