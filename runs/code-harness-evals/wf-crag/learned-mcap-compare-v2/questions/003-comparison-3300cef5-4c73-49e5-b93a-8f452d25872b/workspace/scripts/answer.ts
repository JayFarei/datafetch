// CRAG finance — comparison question 3300cef5-4c73-49e5-b93a-8f452d25872b
//
// Question (verbatim):
// can you compare the market caps of cogt and ftft and tell which one is larger?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const [cogtRecords, ftftRecords] = await Promise.all([
    df.db.records.search("COGT"),
    df.db.records.search("FTFT"),
  ]);

  const cogtTicker = cogtRecords[0]?.id ?? "COGT";
  const ftftTicker = ftftRecords[0]?.id ?? "FTFT";

  const [cogtMcap, ftftMcap] = await Promise.all([
    df.tool.cragFinance.get_market_capitalization({ ticker: cogtTicker }),
    df.tool.cragFinance.get_market_capitalization({ ticker: ftftTicker }),
  ]);

  const larger = cogtMcap > ftftMcap ? cogtTicker : ftftTicker;

  return df.answer({
    status: "answered",
    value: `${larger} has the larger market cap. COGT market cap: ${cogtMcap}, FTFT market cap: ${ftftMcap}.`,
    evidence: [
      { recordKey: cogtRecords[0]?.recordKey, reason: `COGT market cap: ${cogtMcap}` },
      { recordKey: ftftRecords[0]?.recordKey, reason: `FTFT market cap: ${ftftMcap}` },
    ],
  });
}

return await main();
