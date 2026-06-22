const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare/questions/015-comparison-ce79ed8a-73cb-42ef-935b-121c13a9c61a/workspace");

// CRAG finance — comparison question ce79ed8a-73cb-42ef-935b-121c13a9c61a
//
// Question (verbatim):
// which company have larger market cap, plya or usas?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const [plyaResults, usasResults] = await Promise.all([
    df.db.records.search("PLYA"),
    df.db.records.search("USAS"),
  ]);

  const plyaTicker = plyaResults[0]?.id ?? "PLYA";
  const usasTicker = usasResults[0]?.id ?? "USAS";

  const [plyaMcap, usasMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: plyaTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: usasTicker }),
  ]);

  const winner = plyaMcap > usasMcap ? plyaTicker : usasTicker;

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { reason: `${plyaTicker} market cap: ${plyaMcap}` },
      { reason: `${usasTicker} market cap: ${usasMcap}` },
    ],
  });
}

return await main();

