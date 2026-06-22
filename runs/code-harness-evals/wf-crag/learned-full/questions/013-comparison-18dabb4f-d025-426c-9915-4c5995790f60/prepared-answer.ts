const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-full/questions/013-comparison-18dabb4f-d025-426c-9915-4c5995790f60/workspace");

// CRAG finance — comparison question 18dabb4f-d025-426c-9915-4c5995790f60
//
// Question (verbatim):
// which stock had higher gross income in the 4th quarter of 2023? apple or microsoft

async function main() {
  const [appleMatches, msftMatches] = await Promise.all([
    df.db.records.search("Apple Inc"),
    df.db.records.search("Microsoft"),
  ]);

  const appleTicker = appleMatches[0]?.id ?? "AAPL";
  const msftTicker = msftMatches[0]?.id ?? "MSFT";

  const [appleInfo, msftInfo] = await Promise.all([
    df.tool.cragFinance.get_info({ ticker: appleTicker }),
    df.tool.cragFinance.get_info({ ticker: msftTicker }),
  ]);

  // get_info typically returns financialData, incomeStatementHistory, etc.
  // Check for quarterly income statement data
  const appleQuarterly = (appleInfo as any)?.incomeStatementHistoryQuarterly?.incomeStatementHistory ?? [];
  const msftQuarterly = (msftInfo as any)?.incomeStatementHistoryQuarterly?.incomeStatementHistory ?? [];

  // Q4 2023: Apple fiscal Q1 2024 ends Dec 2023; Microsoft Q2 FY2024 ends Dec 2023
  // We need calendar Q4 2023 = Oct-Dec 2023
  // Look for entries with endDate around 2023-12-31

  function findQ4_2023(history: any[]) {
    // Find entry closest to 2023-12-31
    return history.find((q: any) => {
      const date = String(q.endDate?.fmt ?? q.endDate?.raw ?? "");
      return date.startsWith("2023-12") || date.startsWith("2023-09") && false;
    }) ?? history.find((q: any) => {
      const raw = q.endDate?.raw ?? 0;
      // raw is unix timestamp; Dec 2023 ~ 1703980800
      return raw >= 1698710400 && raw <= 1706745600; // Oct 2023 - Jan 2024
    });
  }

  const appleQ4 = findQ4_2023(appleQuarterly);
  const msftQ4 = findQ4_2023(msftQuarterly);

  const appleGross = appleQ4?.grossProfit?.raw ?? null;
  const msftGross = msftQ4?.grossProfit?.raw ?? null;

  if (appleGross === null || msftGross === null) {
    return df.answer({
      status: "unsupported",
      value: null,
      evidence: [
        { recordKey: `crag-finance:${appleTicker}`, reason: `Apple Q4: ${JSON.stringify(appleQ4)}` },
        { recordKey: `crag-finance:${msftTicker}`, reason: `MSFT Q4: ${JSON.stringify(msftQ4)}` },
      ],
    });
  }

  const winner = appleGross > msftGross ? "Apple" : "Microsoft";

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { recordKey: `crag-finance:${appleTicker}`, reason: `Apple Q4 2023 gross profit: ${appleGross}` },
      { recordKey: `crag-finance:${msftTicker}`, reason: `Microsoft Q4 2023 gross profit: ${msftGross}` },
    ],
  });
}

return await main();

