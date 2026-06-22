const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare-v3-neutral/questions/005-comparison-65d83c7c-55f4-46d2-983e-5f28fa24e32c/workspace");
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
// CRAG finance — comparison question 65d83c7c-55f4-46d2-983e-5f28fa24e32c
//
// Question (verbatim):
// which company have larger market cap, hri or imppp?
//
// Replace the body below. Inspect /df.d.ts for every available surface
// (df.db data, df.tool adapters, and any df.lib learned helpers), pick
// whatever fits this question best, compute, then RETURN df.answer(...).

async function main() {
  const [hriRecs, imppRecs] = await Promise.all([
    safeRecordsFindExact({ symbol: "HRI" }),
    safeRecordsFindExact({ symbol: "IMPPP" }),
  ]);

  const hriKey = hriRecs[0]?.recordKey ?? "HRI";
  const impppKey = imppRecs[0]?.recordKey ?? "IMPPP";

  const [hriMcap, impppMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: "HRI" }),
    df.tool.cragFinance.get_market_capitalization({ ticker: "IMPPP" }),
  ]);

  const larger = hriMcap > impppMcap ? "HRI" : "IMPPP";

  return df.answer({
    status: "answered",
    value: larger,
    evidence: [
      { recordKey: hriKey, reason: `HRI market cap: ${hriMcap}` },
      { recordKey: impppKey, reason: `IMPPP market cap: ${impppMcap}` },
    ],
  });
}

return await main();
