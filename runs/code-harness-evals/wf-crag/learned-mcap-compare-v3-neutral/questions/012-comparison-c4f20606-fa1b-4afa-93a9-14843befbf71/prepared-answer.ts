const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/learned-mcap-compare-v3-neutral/questions/012-comparison-c4f20606-fa1b-4afa-93a9-14843befbf71/workspace");

// CRAG finance — comparison question c4f20606-fa1b-4afa-93a9-14843befbf71
//
// Question (verbatim):
// which company boasts a larger market cap, gxo or tw?
//
// Replace the body below. Inspect /df.d.ts for every available surface
// (df.db data, df.tool adapters, and any df.lib learned helpers), pick
// whatever fits this question best, compute, then RETURN df.answer(...).

async function main() {
  const [gxoRecords, twRecords] = await Promise.all([
    df.db.records.search("GXO", { limit: 1 }),
    df.db.records.search("TW", { limit: 1 }),
  ]);

  const gxoTicker = gxoRecords[0]?.attributes?.symbol ?? "GXO";
  const twTicker = twRecords[0]?.attributes?.symbol ?? "TW";

  const [gxoMcap, twMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: gxoTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: twTicker }),
  ]);

  const winner = gxoMcap >= twMcap ? gxoRecords[0]?.label ?? "GXO" : twRecords[0]?.label ?? "TW";

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { recordKey: gxoRecords[0]?.recordKey, reason: `GXO market cap: ${gxoMcap}` },
      { recordKey: twRecords[0]?.recordKey, reason: `TW market cap: ${twMcap}` },
    ],
  });
}

return await main();

