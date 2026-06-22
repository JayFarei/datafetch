const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare-v2/questions/011-comparison-babb7da1-52c8-48bf-a3bf-93c3addf83a8/workspace");
const safeRecordsFindExact = async (filter: Record<string, unknown>, limit?: number): Promise<any[]> => {
  try {
    const records = await (df as any).db?.records?.findExact?.(filter, limit);
    return Array.isArray(records) ? records : [];
  } catch (error) {
    const message = String((error as any)?.message ?? error);
    if (message.includes("ident not found across mounts")) return [];
    throw error;
  }
};
// CRAG finance — comparison question babb7da1-52c8-48bf-a3bf-93c3addf83a8
//
// Question (verbatim):
// which company has a greater market cap, wiw or mficl?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const [wiwMatches, mficlMatches] = await Promise.all([
    safeRecordsFindExact({ symbol: "WIW" }),
    safeRecordsFindExact({ symbol: "MFICL" }),
  ]);

  const wiwTicker = wiwMatches[0]?.id ?? "WIW";
  const mficlTicker = mficlMatches[0]?.id ?? "MFICL";

  const [wiwMcap, mficlMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: wiwTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: mficlTicker }),
  ]);

  const winner = wiwMcap > mficlMcap ? wiwTicker : mficlTicker;

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { recordKey: wiwMatches[0]?.recordKey, reason: `WIW market cap: ${wiwMcap}` },
      { recordKey: mficlMatches[0]?.recordKey, reason: `MFICL market cap: ${mficlMcap}` },
    ],
  });
}

return await main();

