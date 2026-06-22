const answer = df.answer.bind(df);
process.chdir("/Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/runs/code-harness-evals/wf-crag/cold/questions/014-comparison-1988dbca-c14f-496c-a61e-e8bf22c629b9/workspace");

// CRAG finance — comparison question 1988dbca-c14f-496c-a61e-e8bf22c629b9
//
// Question (verbatim):
// how much more volume has been traded today in bitcoin than ethereum?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // Search for Bitcoin and Ethereum in the database
  const btcMatches = await df.db.records.search("Bitcoin");
  const ethMatches = await df.db.records.search("Ethereum");

  // Find Bitcoin (BTC-USD) and Ethereum (ETH-USD)
  const btcRecord = btcMatches.find(r => r.id === "BTC-USD") || btcMatches[0];
  const ethRecord = ethMatches.find(r => r.id === "ETH-USD") || ethMatches[0];

  const btcTicker = btcRecord?.id;
  const ethTicker = ethRecord?.id;

  // Get price history for both (today's volume is in the most recent entry)
  const [btcHistory, ethHistory] = await Promise.all([
    df.tool.cragFinance.get_price_history({ ticker: btcTicker }),
    df.tool.cragFinance.get_price_history({ ticker: ethTicker }),
  ]);

  // Get the most recent date's volume
  const btcDates = Object.keys(btcHistory).sort();
  const ethDates = Object.keys(ethHistory).sort();

  const btcLatestDate = btcDates[btcDates.length - 1];
  const ethLatestDate = ethDates[ethDates.length - 1];

  const btcVolume = btcHistory[btcLatestDate]?.Volume;
  const ethVolume = ethHistory[ethLatestDate]?.Volume;

  const diff = btcVolume - ethVolume;

  return df.answer({
    status: "answered",
    value: diff,
    evidence: [
      { reason: `BTC-USD volume on ${btcLatestDate}: ${btcVolume}` },
      { reason: `ETH-USD volume on ${ethLatestDate}: ${ethVolume}` },
    ],
  });
}

return await main();

