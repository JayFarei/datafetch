// CRAG finance — comparison question 1988dbca-c14f-496c-a61e-e8bf22c629b9
//
// Question (verbatim):
// how much more volume has been traded today in bitcoin than ethereum?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // Search for Bitcoin and Ethereum in the records database
  const btcMatches = await df.db.records.search("Bitcoin");
  const ethMatches = await df.db.records.search("Ethereum");

  const btcRecord = btcMatches[0];
  const ethRecord = ethMatches[0];

  if (!btcRecord || !ethRecord) {
    return df.answer({ status: "unsupported", value: "i don't know", evidence: [] });
  }

  const btcTicker = btcRecord.id;
  const ethTicker = ethRecord.id;

  // Get price history to find today's volume (2024-03-05)
  const btcHistory = await df.tool.cragFinance.get_price_history({ ticker: btcTicker });
  const ethHistory = await df.tool.cragFinance.get_price_history({ ticker: ethTicker });

  // Target date: 03/05/2024
  const targetDate = "2024-03-05";
  const btcDay = btcHistory[targetDate];
  const ethDay = ethHistory[targetDate];

  if (!btcDay || !ethDay) {
    return df.answer({ status: "unsupported", value: "i don't know", evidence: [] });
  }

  const diff = btcDay.Volume - ethDay.Volume;

  return df.answer({
    status: "answered",
    value: diff,
    evidence: [
      { recordKey: btcRecord.recordKey, reason: `BTC volume on ${targetDate}: ${btcDay.Volume}` },
      { recordKey: ethRecord.recordKey, reason: `ETH volume on ${targetDate}: ${ethDay.Volume}` },
    ],
  });
}

return await main();
