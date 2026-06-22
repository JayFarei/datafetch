// CRAG finance — comparison question ad0871e9-657b-4d8a-8f8a-bcf1a5e9c066
//
// Question (verbatim):
// which company have larger market cap, mfd or allt?
//
// Replace the body below. Inspect /df.d.ts for every available surface
// (df.db data, df.tool adapters, and any df.lib learned helpers), pick
// whatever fits this question best, compute, then RETURN df.answer(...).

async function main() {
  const [mfdRecords, alltRecords] = await Promise.all([
    df.db.records.findExact({ symbol: "MFD" }),
    df.db.records.findExact({ symbol: "ALLT" }),
  ]);

  const [mfdMcap, alltMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: "MFD" }),
    df.tool.cragFinance.get_market_capitalization({ ticker: "ALLT" }),
  ]);

  const larger = mfdMcap > alltMcap ? "MFD" : "ALLT";

  return df.answer({
    status: "answered",
    value: larger,
    evidence: [
      { reason: `MFD market cap: ${mfdMcap}` },
      { reason: `ALLT market cap: ${alltMcap}` },
    ],
  });
}

return await main();
