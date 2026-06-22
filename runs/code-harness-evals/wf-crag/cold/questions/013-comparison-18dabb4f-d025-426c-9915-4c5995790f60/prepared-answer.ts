const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/cold/questions/013-comparison-18dabb4f-d025-426c-9915-4c5995790f60/workspace");

// CRAG finance — comparison question 18dabb4f-d025-426c-9915-4c5995790f60
//
// Question (verbatim):
// which stock had higher gross income in the 4th quarter of 2023? apple or microsoft
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

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

  // Yahoo Finance get_info typically exposes grossProfits (TTM)
  const getGross = (info: Record<string, unknown>): number | null => {
    for (const key of ["grossProfits", "grossProfit", "gross_profits", "gross_profit"]) {
      if (typeof info[key] === "number") return info[key] as number;
    }
    return null;
  };

  const appleGross = getGross(appleInfo as Record<string, unknown>);
  const msftGross = getGross(msftInfo as Record<string, unknown>);

  if (appleGross !== null && msftGross !== null) {
    const winner = appleGross > msftGross ? "Apple" : "Microsoft";
    return df.answer({
      status: "answered",
      value: winner,
      evidence: [
        { recordKey: `crag-finance:${appleTicker}`, reason: `Apple gross profit: ${appleGross}` },
        { recordKey: `crag-finance:${msftTicker}`, reason: `Microsoft gross profit: ${msftGross}` },
      ],
    });
  }

  // Fallback: log all keys to understand what's available
  const appleKeys = Object.keys(appleInfo as Record<string, unknown>);
  const msftKeys = Object.keys(msftInfo as Record<string, unknown>);

  return df.answer({
    status: "unsupported",
    value: null,
    evidence: [
      { reason: `Apple info keys: ${appleKeys.join(", ")}` },
      { reason: `MSFT info keys: ${msftKeys.join(", ")}` },
    ],
    reason: "Quarterly gross income data not found in get_info response",
  });
}

return await main();

