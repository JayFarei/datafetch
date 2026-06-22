const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare-v2/questions/009-comparison-8f723a0e-7904-4782-bbcf-b8bb8edfc74a/workspace");

// CRAG finance — comparison question 8f723a0e-7904-4782-bbcf-b8bb8edfc74a
//
// Question (verbatim):
// which has a greater market capitalization, tron or mgrm?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const tronMatches = await df.db.records.search("Tron");
  const mgrmMatches = await df.db.records.search("MGRM");

  const tronRecord = tronMatches[0];
  const mgrmRecord = mgrmMatches[0];

  const tronTicker = tronRecord?.id;
  const mgrmTicker = mgrmRecord?.id;

  const [tronMcap, mgrmMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: tronTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: mgrmTicker }),
  ]);

  const winner = tronMcap > mgrmMcap ? "tron" : "mgrm";

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { recordKey: tronRecord?.recordKey, reason: `Tron (${tronTicker}) market cap: ${tronMcap}` },
      { recordKey: mgrmRecord?.recordKey, reason: `MGRM (${mgrmTicker}) market cap: ${mgrmMcap}` },
    ],
  });
}

return await main();

