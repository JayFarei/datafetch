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
    df.db.records.findExact({ symbol: "HRI" }),
    df.db.records.findExact({ symbol: "IMPPP" }),
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