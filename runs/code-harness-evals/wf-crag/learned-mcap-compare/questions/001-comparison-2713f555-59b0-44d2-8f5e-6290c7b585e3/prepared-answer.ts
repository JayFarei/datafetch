const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare/questions/001-comparison-2713f555-59b0-44d2-8f5e-6290c7b585e3/workspace");

// CRAG finance — comparison question 2713f555-59b0-44d2-8f5e-6290c7b585e3
//
// Question (verbatim):
// which company have larger market cap, tirx or gdo?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const [tirxMatches, gdoMatches] = await Promise.all([
    df.db.records.search("TIRX"),
    df.db.records.search("GDO"),
  ]);

  const tirxRecord = tirxMatches[0];
  const gdoRecord = gdoMatches[0];

  const [tirxMcap, gdoMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: "TIRX" }),
    df.tool.cragFinance.get_market_capitalization({ ticker: "GDO" }),
  ]);

  const winner = tirxMcap > gdoMcap ? "TIRX" : "GDO";

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { recordKey: tirxRecord?.recordKey, reason: `TIRX market cap: ${tirxMcap}` },
      { recordKey: gdoRecord?.recordKey, reason: `GDO market cap: ${gdoMcap}` },
    ],
  });
}

return await main();
