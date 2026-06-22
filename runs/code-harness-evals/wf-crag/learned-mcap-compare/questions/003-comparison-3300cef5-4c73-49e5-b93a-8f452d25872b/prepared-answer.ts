const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare/questions/003-comparison-3300cef5-4c73-49e5-b93a-8f452d25872b/workspace");

// CRAG finance — comparison question 3300cef5-4c73-49e5-b93a-8f452d25872b
//
// Question (verbatim):
// can you compare the market caps of cogt and ftft and tell which one is larger?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const [cogtMatches, ftftMatches] = await Promise.all([
    df.db.records.search("COGT"),
    df.db.records.search("FTFT"),
  ]);

  const cogtTicker = cogtMatches[0]?.id ?? "COGT";
  const ftftTicker = ftftMatches[0]?.id ?? "FTFT";

  const [cogtMcap, ftftMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: cogtTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: ftftTicker }),
  ]);

  const larger = cogtMcap > ftftMcap ? "COGT" : "FTFT";

  return df.answer({
    status: "answered",
    value: `${larger} has the larger market cap (COGT: ${cogtMcap}, FTFT: ${ftftMcap})`,
    evidence: [
      { recordKey: cogtMatches[0]?.recordKey, reason: `COGT market cap: ${cogtMcap}` },
      { recordKey: ftftMatches[0]?.recordKey, reason: `FTFT market cap: ${ftftMcap}` },
    ],
  });
}

return await main();
