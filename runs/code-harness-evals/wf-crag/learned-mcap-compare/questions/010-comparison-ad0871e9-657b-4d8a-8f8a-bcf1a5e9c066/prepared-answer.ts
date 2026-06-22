const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare/questions/010-comparison-ad0871e9-657b-4d8a-8f8a-bcf1a5e9c066/workspace");

// CRAG finance — comparison question ad0871e9-657b-4d8a-8f8a-bcf1a5e9c066
//
// Question (verbatim):
// which company have larger market cap, mfd or allt?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const [mfdResults, alltResults] = await Promise.all([
    df.db.records.search("MFD"),
    df.db.records.search("ALLT"),
  ]);

  const mfdRecord = mfdResults.find(r => r.attributes.symbol === "MFD") || mfdResults[0];
  const alltRecord = alltResults.find(r => r.attributes.symbol === "ALLT") || alltResults[0];

  const [mfdMcap, alltMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: "MFD" }),
    df.tool.cragFinance.get_market_capitalization({ ticker: "ALLT" }),
  ]);

  const winner = mfdMcap > alltMcap ? "MFD" : "ALLT";

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { recordKey: mfdRecord?.recordKey, reason: `MFD market cap: ${mfdMcap}` },
      { recordKey: alltRecord?.recordKey, reason: `ALLT market cap: ${alltMcap}` },
    ],
  });
}

return await main();

