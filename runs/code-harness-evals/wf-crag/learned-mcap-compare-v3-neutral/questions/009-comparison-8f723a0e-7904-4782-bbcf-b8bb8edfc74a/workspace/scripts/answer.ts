// CRAG finance — comparison question 8f723a0e-7904-4782-bbcf-b8bb8edfc74a
//
// Question (verbatim):
// which has a greater market capitalization, tron or mgrm?
//
// Replace the body below. Inspect /df.d.ts for every available surface
// (df.db data, df.tool adapters, and any df.lib learned helpers), pick
// whatever fits this question best, compute, then RETURN df.answer(...).

async function main() {
  const [tronRecords, mgrmRecords] = await Promise.all([
    df.db.records.search("tron", { limit: 3 }),
    df.db.records.search("mgrm", { limit: 3 }),
  ]);

  const tronTicker = tronRecords[0]?.id;
  const mgrmTicker = mgrmRecords[0]?.id;

  const [tronMcap, mgrmMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: tronTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: mgrmTicker }),
  ]);

  const winner = tronMcap > mgrmMcap ? "tron" : "mgrm";

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { recordKey: tronRecords[0]?.recordKey, reason: `tron mcap: ${tronMcap}` },
      { recordKey: mgrmRecords[0]?.recordKey, reason: `mgrm mcap: ${mgrmMcap}` },
    ],
  });
}

return await main();
