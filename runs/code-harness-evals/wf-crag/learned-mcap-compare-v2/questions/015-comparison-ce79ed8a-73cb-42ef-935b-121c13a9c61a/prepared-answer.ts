const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare-v2/questions/015-comparison-ce79ed8a-73cb-42ef-935b-121c13a9c61a/workspace");

// CRAG finance — comparison question ce79ed8a-73cb-42ef-935b-121c13a9c61a
//
// Question (verbatim):
// which company have larger market cap, plya or usas?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const [plyaRec, usasRec] = await Promise.all([
    df.db.records.search("PLYA", { limit: 1 }),
    df.db.records.search("USAS", { limit: 1 }),
  ]);

  const plyaTicker = plyaRec[0]?.id ?? "PLYA";
  const usasTicker = usasRec[0]?.id ?? "USAS";

  const [plyaMcap, usasMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: plyaTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: usasTicker }),
  ]);

  const larger = plyaMcap >= usasMcap ? plyaTicker : usasTicker;

  return df.answer({
    status: "answered",
    value: larger,
    evidence: [
      { recordKey: plyaRec[0]?.recordKey, reason: `PLYA market cap: ${plyaMcap}` },
      { recordKey: usasRec[0]?.recordKey, reason: `USAS market cap: ${usasMcap}` },
    ],
  });
}

return await main();
