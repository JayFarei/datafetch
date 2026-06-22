const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare/questions/005-comparison-65d83c7c-55f4-46d2-983e-5f28fa24e32c/workspace");

// CRAG finance — comparison question 65d83c7c-55f4-46d2-983e-5f28fa24e32c
//
// Question (verbatim):
// which company have larger market cap, hri or imppp?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const [hriMatches, impppMatches] = await Promise.all([
    df.db.records.search("HRI"),
    df.db.records.search("IMPPP"),
  ]);

  const hriTicker = hriMatches[0]?.id ?? "HRI";
  const impppTicker = impppMatches[0]?.id ?? "IMPPP";

  const [hriMcap, impppMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: hriTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: impppTicker }),
  ]);

  const winner = hriMcap > impppMcap ? hriTicker : impppTicker;

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { reason: `${hriTicker} market cap: ${hriMcap}` },
      { reason: `${impppTicker} market cap: ${impppMcap}` },
    ],
  });
}

return await main();

