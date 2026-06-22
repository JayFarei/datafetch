// CRAG finance — comparison question 055d5b5b-6659-4a78-afe4-7c946e8ec62b
//
// Question (verbatim):
// which company has a higher price-to-book ratio, splunk or mongodb?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const [splunkMatches, mongoMatches] = await Promise.all([
    df.db.records.search("Splunk"),
    df.db.records.search("MongoDB"),
  ]);

  const splunkTicker = splunkMatches[0]?.id;
  const mongoTicker = mongoMatches[0]?.id;

  const [splunkInfo, mongoInfo] = await Promise.all([
    df.tool.cragFinance.get_info({ ticker: splunkTicker }),
    df.tool.cragFinance.get_info({ ticker: mongoTicker }),
  ]);

  const splunkPB = splunkInfo["priceToBook"] as number;
  const mongoPB = mongoInfo["priceToBook"] as number;

  const winner = splunkPB > mongoPB ? "Splunk" : "MongoDB";

  return df.answer({
    status: "answered",
    value: winner,
    evidence: [
      { reason: `Splunk (${splunkTicker}) P/B: ${splunkPB}` },
      { reason: `MongoDB (${mongoTicker}) P/B: ${mongoPB}` },
    ],
  });
}

return await main();
