const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare-v3-neutral/questions/007-comparison-7821dc79-dc9c-4775-b516-789153e6c98e/workspace");
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
// CRAG finance — comparison question 7821dc79-dc9c-4775-b516-789153e6c98e
//
// Question (verbatim):
// which company have larger market cap, cmt or adea?
//
// Replace the body below. Inspect /df.d.ts for every available surface
// (df.db data, df.tool adapters, and any df.lib learned helpers), pick
// whatever fits this question best, compute, then RETURN df.answer(...).

async function main() {
  const [cmtRecords, adeaRecords] = await Promise.all([
    safeRecordsFindExact({ symbol: "CMT" }),
    safeRecordsFindExact({ symbol: "ADEA" }),
  ]);

  const [cmtMcap, adeaMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: "CMT" }),
    df.tool.cragFinance.get_market_capitalization({ ticker: "ADEA" }),
  ]);

  const larger = cmtMcap > adeaMcap ? "CMT" : "ADEA";

  return df.answer({
    status: "answered",
    value: larger,
    evidence: [
      { recordKey: cmtRecords[0]?.recordKey, reason: `CMT market cap: ${cmtMcap}` },
      { recordKey: adeaRecords[0]?.recordKey, reason: `ADEA market cap: ${adeaMcap}` },
    ],
  });
}

return await main();

