// CRAG finance — comparison question 7b38dd20-c216-403f-84e6-575f90bcb913
//
// Question (verbatim):
// which of the two companies, bksy or cvcy, has a higher market capitalization?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const [bksyMatches, cvcyMatches] = await Promise.all([
    df.db.records.search("BKSY", { limit: 1 }),
    df.db.records.search("CVCY", { limit: 1 }),
  ]);

  const [bksyMcap, cvcyMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: "BKSY" }),
    df.tool.cragFinance.get_market_capitalization({ ticker: "CVCY" }),
  ]);

  const winner = bksyMcap > cvcyMcap ? "BKSY" : "CVCY";

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { recordKey: bksyMatches[0]?.recordKey, reason: `BKSY market cap: ${bksyMcap}` },
      { recordKey: cvcyMatches[0]?.recordKey, reason: `CVCY market cap: ${cvcyMcap}` },
    ],
  });
}

return await main();