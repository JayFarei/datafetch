// CRAG finance — comparison question 7101bf2b-e9f5-441a-b378-9f6e9057fc7f
//
// Question (verbatim):
// could you tell me which company has a higher market cap, expo or nxst?
//
// Replace the body below. Inspect /df.d.ts for every available surface
// (df.db data, df.tool adapters, and any df.lib learned helpers), pick
// whatever fits this question best, compute, then RETURN df.answer(...).

async function main() {
  const [expoRecords, nxstRecords] = await Promise.all([
    df.db.records.search("EXPO", { limit: 3 }),
    df.db.records.search("NXST", { limit: 3 }),
  ]);

  const expoTicker = expoRecords[0]?.id ?? "EXPO";
  const nxstTicker = nxstRecords[0]?.id ?? "NXST";

  const [expoMcap, nxstMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: expoTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: nxstTicker }),
  ]);

  const winner = expoMcap > nxstMcap ? expoTicker : nxstTicker;

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { recordKey: expoRecords[0]?.recordKey, reason: `${expoTicker} market cap: ${expoMcap}` },
      { recordKey: nxstRecords[0]?.recordKey, reason: `${nxstTicker} market cap: ${nxstMcap}` },
    ],
  });
}

return await main();
