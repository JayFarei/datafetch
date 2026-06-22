const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare-v3-neutral/questions/002-comparison-2f3101f3-8852-435b-9d63-6286f07176e3/workspace");
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
// CRAG finance — comparison question 2f3101f3-8852-435b-9d63-6286f07176e3
//
// Question (verbatim):
// which company's market capitalization is higher, nwgl or mficl?
//
// Replace the body below. Inspect /df.d.ts for every available surface
// (df.db data, df.tool adapters, and any df.lib learned helpers), pick
// whatever fits this question best, compute, then RETURN df.answer(...).

async function main() {
  const [nwglRecords, mficlRecords] = await Promise.all([
    safeRecordsFindExact({ symbol: "NWGL" }),
    safeRecordsFindExact({ symbol: "MFICL" }),
  ]);

  const [nwglMcap, mficlMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: "NWGL" }),
    df.tool.cragFinance.get_market_capitalization({ ticker: "MFICL" }),
  ]);

  const higher = nwglMcap > mficlMcap ? "NWGL" : "MFICL";

  return df.answer({
    status: "answered",
    value: higher,
    evidence: [
      { reason: `NWGL market cap: ${nwglMcap}` },
      { reason: `MFICL market cap: ${mficlMcap}` },
    ],
  });
}

return await main();

