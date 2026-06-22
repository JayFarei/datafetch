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
    df.db.records.findExact({ symbol: "CMT" }),
    df.db.records.findExact({ symbol: "ADEA" }),
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
