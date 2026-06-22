const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare-v2/questions/017-multi-hop-de681882-70b6-4d27-9c22-1cb9955eef34/workspace");

// CRAG finance — multi-hop question de681882-70b6-4d27-9c22-1cb9955eef34
//
// Question (verbatim):
// in the fortune 500 which company has the highest market cap in 2010 in the us
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // Search for top Fortune 500 US companies by market cap candidates in 2010
  // Known candidates: ExxonMobil, Apple, Microsoft, Walmart, GE
  const candidates = ["ExxonMobil", "Apple", "Microsoft", "Walmart", "General Electric"];

  const results: Array<{ name: string; ticker: string; mcap2010: number }> = [];

  for (const name of candidates) {
    const matches = await df.db.records.search(name, { limit: 1 });
    if (!matches.length) continue;
    const ticker = matches[0].id;
    const label = matches[0].label;

    // Get price history to find 2010 prices
    let priceHistory: Record<string, { Open: number; High: number; Low: number; Close: number; Volume: number }>;
    try {
      priceHistory = await df.tool.cragFinance.get_price_history({ ticker });
    } catch {
      continue;
    }

    // Get 2010 end-of-year price (December 2010)
    const keys2010 = Object.keys(priceHistory).filter(k => k.startsWith("2010-12"));
    if (!keys2010.length) continue;
    keys2010.sort();
    const lastKey = keys2010[keys2010.length - 1];
    const price2010 = priceHistory[lastKey].Close;

    // Get info to find shares outstanding (use current as proxy)
    let info: Record<string, unknown>;
    try {
      info = await df.tool.cragFinance.get_info({ ticker });
    } catch {
      continue;
    }

    const shares = (info.sharesOutstanding as number) || (info.impliedSharesOutstanding as number) || 0;
    if (!shares) continue;

    const mcap2010 = price2010 * shares;
    results.push({ name: label, ticker, mcap2010 });
  }

  if (!results.length) {
    return df.answer({ status: "unsupported", value: "i don't know", evidence: [] });
  }

  results.sort((a, b) => b.mcap2010 - a.mcap2010);
  const winner = results[0];

  return df.answer({
    status: "answered",
    value: winner.name,
    evidence: results.map(r => ({
      recordKey: r.ticker,
      reason: `estimated 2010 market cap: $${(r.mcap2010 / 1e9).toFixed(1)}B`,
    })),
  });
}

return await main();

