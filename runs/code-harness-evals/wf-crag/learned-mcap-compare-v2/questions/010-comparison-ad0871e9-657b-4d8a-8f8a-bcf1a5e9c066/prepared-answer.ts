const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare-v2/questions/010-comparison-ad0871e9-657b-4d8a-8f8a-bcf1a5e9c066/workspace");
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
// CRAG finance — comparison question ad0871e9-657b-4d8a-8f8a-bcf1a5e9c066
//
// Question (verbatim):
// which company have larger market cap, mfd or allt?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const [mfdMatches, alltMatches] = await Promise.all([
    safeRecordsFindExact({ symbol: "MFD" }),
    safeRecordsFindExact({ symbol: "ALLT" }),
  ]);

  const mfdTicker = mfdMatches[0]?.id ?? "MFD";
  const alltTicker = alltMatches[0]?.id ?? "ALLT";

  const [mfdMcap, alltMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: mfdTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: alltTicker }),
  ]);

  const larger = mfdMcap > alltMcap ? "MFD" : "ALLT";

  return df.answer({
    status: "answered",
    value: larger,
    evidence: [
      { recordKey: mfdMatches[0]?.recordKey, reason: `MFD market cap: ${mfdMcap}` },
      { recordKey: alltMatches[0]?.recordKey, reason: `ALLT market cap: ${alltMcap}` },
    ],
  });
}

return await main();

