// CRAG finance — comparison question 7821dc79-dc9c-4775-b516-789153e6c98e
//
// Question (verbatim):
// which company have larger market cap, cmt or adea?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const [cmtMatches, adeaMatches] = await Promise.all([
    df.db.records.search("CMT"),
    df.db.records.search("ADEA"),
  ]);

  const cmtRecord = cmtMatches.find(r => r.attributes.symbol === "CMT") || cmtMatches[0];
  const adeaRecord = adeaMatches.find(r => r.attributes.symbol === "ADEA") || adeaMatches[0];

  const [cmtMcap, adeaMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: "CMT" }),
    df.tool.cragFinance.get_market_capitalization({ ticker: "ADEA" }),
  ]);

  const larger = cmtMcap > adeaMcap ? "CMT" : "ADEA";

  return df.answer({
    status: "answered",
    value: larger,
    evidence: [
      { recordKey: cmtRecord?.recordKey, reason: `CMT market cap: ${cmtMcap}` },
      { recordKey: adeaRecord?.recordKey, reason: `ADEA market cap: ${adeaMcap}` },
    ],
  });
}

return await main();
