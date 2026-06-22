const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare-v2/questions/005-comparison-65d83c7c-55f4-46d2-983e-5f28fa24e32c/workspace");

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

  const hriRecord = hriMatches.find(r => r.attributes.symbol === "HRI") || hriMatches[0];
  const impppRecord = impppMatches.find(r => r.attributes.symbol === "IMPPP") || impppMatches[0];

  const [hriMcap, impppMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: "HRI" }),
    df.tool.cragFinance.get_market_capitalization({ ticker: "IMPPP" }),
  ]);

  const larger = hriMcap > impppMcap ? "HRI" : "IMPPP";

  return df.answer({
    status: "answered",
    value: larger,
    evidence: [
      { recordKey: hriRecord?.recordKey, reason: `HRI market cap: ${hriMcap}` },
      { recordKey: impppRecord?.recordKey, reason: `IMPPP market cap: ${impppMcap}` },
    ],
  });
}

return await main();

