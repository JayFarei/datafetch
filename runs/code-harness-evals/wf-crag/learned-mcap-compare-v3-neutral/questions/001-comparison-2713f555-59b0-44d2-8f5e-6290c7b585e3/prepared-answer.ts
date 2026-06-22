const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare-v3-neutral/questions/001-comparison-2713f555-59b0-44d2-8f5e-6290c7b585e3/workspace");
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
// CRAG finance — comparison question 2713f555-59b0-44d2-8f5e-6290c7b585e3
//
// Question (verbatim):
// which company have larger market cap, tirx or gdo?
//
// Replace the body below. Inspect /df.d.ts for every available surface
// (df.db data, df.tool adapters, and any df.lib learned helpers), pick
// whatever fits this question best, compute, then RETURN df.answer(...).

async function main() {
  const [tirxRecords, gdoRecords] = await Promise.all([
    safeRecordsFindExact({ symbol: "TIRX" }),
    safeRecordsFindExact({ symbol: "GDO" }),
  ]);

  const [tirxMcap, gdoMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: "TIRX" }),
    df.tool.cragFinance.get_market_capitalization({ ticker: "GDO" }),
  ]);

  const winner = tirxMcap > gdoMcap ? "TIRX" : "GDO";

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { reason: `TIRX market cap: ${tirxMcap}` },
      { reason: `GDO market cap: ${gdoMcap}` },
    ],
  });
}

return await main();

