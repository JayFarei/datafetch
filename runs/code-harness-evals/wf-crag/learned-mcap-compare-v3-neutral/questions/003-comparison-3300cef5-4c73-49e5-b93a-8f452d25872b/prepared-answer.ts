const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare-v3-neutral/questions/003-comparison-3300cef5-4c73-49e5-b93a-8f452d25872b/workspace");
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
// CRAG finance — comparison question 3300cef5-4c73-49e5-b93a-8f452d25872b
//
// Question (verbatim):
// can you compare the market caps of cogt and ftft and tell which one is larger?
//
// Replace the body below. Inspect /df.d.ts for every available surface
// (df.db data, df.tool adapters, and any df.lib learned helpers), pick
// whatever fits this question best, compute, then RETURN df.answer(...).

async function main() {
  const [cogtRecords, ftftRecords] = await Promise.all([
    safeRecordsFindExact({ symbol: "COGT" }),
    safeRecordsFindExact({ symbol: "FTFT" }),
  ]);

  const [cogtMcap, ftftMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: "COGT" }),
    df.tool.cragFinance.get_market_capitalization({ ticker: "FTFT" }),
  ]);

  const larger = cogtMcap > ftftMcap ? "COGT" : "FTFT";

  return df.answer({
    status: "answered",
    value: `${larger} has the larger market cap. COGT market cap: ${cogtMcap}, FTFT market cap: ${ftftMcap}.`,
    evidence: [
      { recordKey: cogtRecords[0]?.recordKey, reason: `COGT market cap: ${cogtMcap}` },
      { recordKey: ftftRecords[0]?.recordKey, reason: `FTFT market cap: ${ftftMcap}` },
    ],
  });
}

return await main();

