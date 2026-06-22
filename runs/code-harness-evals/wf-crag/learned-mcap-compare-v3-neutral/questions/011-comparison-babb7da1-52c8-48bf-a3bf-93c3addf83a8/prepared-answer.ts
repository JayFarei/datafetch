const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare-v3-neutral/questions/011-comparison-babb7da1-52c8-48bf-a3bf-93c3addf83a8/workspace");
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
// Replace the body below. Inspect /df.d.ts for every available surface
// (df.db data, df.tool adapters, and any df.lib learned helpers), pick
// whatever fits this question best, compute, then RETURN df.answer(...).

async function main() {
  const [wiwRecords, mficlRecords] = await Promise.all([
    safeRecordsFindExact({ symbol: "WIW" }),
    safeRecordsFindExact({ symbol: "MFICL" }),
  ]);

  const [wiwMcap, mficlMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: "WIW" }),
    df.tool.cragFinance.get_market_capitalization({ ticker: "MFICL" }),
  ]);

  const winner = wiwMcap > mficlMcap ? "WIW" : "MFICL";

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { reason: `WIW market cap: ${wiwMcap}` },
      { reason: `MFICL market cap: ${mficlMcap}` },
    ],
  });
}

return await main();

