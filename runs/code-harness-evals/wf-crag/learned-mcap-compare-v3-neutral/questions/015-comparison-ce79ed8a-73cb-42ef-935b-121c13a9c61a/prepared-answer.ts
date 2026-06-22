const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare-v3-neutral/questions/015-comparison-ce79ed8a-73cb-42ef-935b-121c13a9c61a/workspace");
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
// CRAG finance — comparison question ce79ed8a-73cb-42ef-935b-121c13a9c61a
//
// Question (verbatim):
// which company have larger market cap, plya or usas?
//
// Replace the body below. Inspect /df.d.ts for every available surface
// (df.db data, df.tool adapters, and any df.lib learned helpers), pick
// whatever fits this question best, compute, then RETURN df.answer(...).

async function main() {
  const [plyaRecords, usasRecords] = await Promise.all([
    safeRecordsFindExact({ symbol: "PLYA" }),
    safeRecordsFindExact({ symbol: "USAS" }),
  ]);

  const [plyaMcap, usasMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: "PLYA" }),
    df.tool.cragFinance.get_market_capitalization({ ticker: "USAS" }),
  ]);

  const winner = plyaMcap > usasMcap ? "PLYA" : "USAS";

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { reason: `PLYA market cap: ${plyaMcap}` },
      { reason: `USAS market cap: ${usasMcap}` },
    ],
  });
}

return await main();

