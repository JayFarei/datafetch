const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare-v2/questions/007-comparison-7821dc79-dc9c-4775-b516-789153e6c98e/workspace");

// CRAG finance — comparison question 7821dc79-dc9c-4775-b516-789153e6c98e
//
// Question (verbatim):
// which company have larger market cap, cmt or adea?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const cmtMatches = await df.db.records.search("CMT");
  const adeaMatches = await df.db.records.search("ADEA");

  const cmtTicker = cmtMatches[0]?.id ?? "CMT";
  const adeaTicker = adeaMatches[0]?.id ?? "ADEA";

  const [cmtMcap, adeaMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: cmtTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: adeaTicker }),
  ]);

  const larger = cmtMcap > adeaMcap ? cmtTicker : adeaTicker;

  return df.answer({
    status: "answered",
    value: larger,
    evidence: [
      { reason: `${cmtTicker} market cap: ${cmtMcap}` },
      { reason: `${adeaTicker} market cap: ${adeaMcap}` },
    ],
  });
}

return await main();
