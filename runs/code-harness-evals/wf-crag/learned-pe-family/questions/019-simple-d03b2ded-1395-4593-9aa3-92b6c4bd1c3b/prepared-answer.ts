const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-pe-family/questions/019-simple-d03b2ded-1395-4593-9aa3-92b6c4bd1c3b/workspace");
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
// CRAG finance — simple question d03b2ded-1395-4593-9aa3-92b6c4bd1c3b
//
// Question (verbatim):
// would you happen to know the price-to-earnings ratio for psf?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const matches = await safeRecordsFindExact({ symbol: "PSF" });
  const ticker = matches[0]?.id ?? "PSF";
  const pe = await df.tool.cragFinance.get_pe_ratio({ ticker });
  return df.answer({
    status: "answered",
    value: pe,
    evidence: [{ recordKey: matches[0]?.recordKey, reason: "P/E ratio from cragFinance" }],
  });
}

return await main();

