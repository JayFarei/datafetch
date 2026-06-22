const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare/questions/012-comparison-c4f20606-fa1b-4afa-93a9-14843befbf71/workspace");

// CRAG finance — comparison question c4f20606-fa1b-4afa-93a9-14843befbf71
//
// Question (verbatim):
// which company boasts a larger market cap, gxo or tw?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const [gxoMatches, twMatches] = await Promise.all([
    df.db.records.search("GXO"),
    df.db.records.search("TW"),
  ]);

  const gxoTicker = gxoMatches[0]?.id ?? "GXO";
  const twTicker = twMatches[0]?.id ?? "TW";

  const [gxoCap, twCap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: gxoTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: twTicker }),
  ]);

  const winner = gxoCap > twCap ? "GXO" : "TW";

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { reason: `GXO market cap: ${gxoCap}` },
      { reason: `TW market cap: ${twCap}` },
    ],
  });
}

return await main();

