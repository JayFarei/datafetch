// CRAG finance — comparison question 7101bf2b-e9f5-441a-b378-9f6e9057fc7f
//
// Question (verbatim):
// could you tell me which company has a higher market cap, expo or nxst?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const [expoMatches, nxstMatches] = await Promise.all([
    df.db.records.search("EXPO"),
    df.db.records.search("NXST"),
  ]);

  const expoTicker = expoMatches[0]?.id;
  const nxstTicker = nxstMatches[0]?.id;

  const [expoMcap, nxstMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: expoTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: nxstTicker }),
  ]);

  const winner = expoMcap > nxstMcap ? expoMatches[0]?.label ?? expoTicker : nxstMatches[0]?.label ?? nxstTicker;

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { recordKey: expoMatches[0]?.recordKey, reason: `EXPO market cap: ${expoMcap}` },
      { recordKey: nxstMatches[0]?.recordKey, reason: `NXST market cap: ${nxstMcap}` },
    ],
  });
}

return await main();
