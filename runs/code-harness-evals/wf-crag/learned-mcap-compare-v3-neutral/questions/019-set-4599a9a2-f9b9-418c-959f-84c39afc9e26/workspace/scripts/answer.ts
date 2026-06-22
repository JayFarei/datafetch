// CRAG finance — set question 4599a9a2-f9b9-418c-959f-84c39afc9e26
//
// Question (verbatim):
// what energy stocks has higher market cap than shell company in the whole world
//
// Replace the body below. Inspect /df.d.ts for every available surface
// (df.db data, df.tool adapters, and any df.lib learned helpers), pick
// whatever fits this question best, compute, then RETURN df.answer(...).

async function main() {
  // Find Shell's ticker
  const shellRecords = await df.db.records.search("Shell", { limit: 5 });
  let shellTicker = "SHEL";
  for (const r of shellRecords) {
    const name = r.label.toLowerCase();
    if (name.includes("shell") && (name.includes("plc") || name.includes("royal dutch") || r.attributes.symbol === "SHEL")) {
      shellTicker = r.attributes.symbol || r.id;
      break;
    }
  }

  // Get Shell's market cap
  const shellMcap = await df.tool.cragFinance.get_market_capitalization({ ticker: shellTicker });

  // Search for energy companies in the db
  const energyRecords = await df.db.records.search("energy oil gas petroleum", { limit: 50 });

  // Get market caps for energy companies
  const results: Array<{ name: string; ticker: string; mcap: number }> = [];

  for (const r of energyRecords) {
    const ticker = r.attributes.symbol || r.id;
    if (ticker === shellTicker) continue;
    try {
      const mcap = await df.tool.cragFinance.get_market_capitalization({ ticker });
      if (mcap > shellMcap) {
        results.push({ name: r.label, ticker, mcap });
      }
    } catch {
      // skip
    }
  }

  // Sort by market cap descending
  results.sort((a, b) => b.mcap - a.mcap);

  const answer = results.map(r => `${r.name} (${r.ticker}): $${(r.mcap / 1e9).toFixed(2)}B`);

  return df.answer({
    status: "answered",
    value: answer.length > 0 ? answer : "No energy stocks found with higher market cap than Shell",
    evidence: [
      { reason: `Shell (${shellTicker}) market cap: $${(shellMcap / 1e9).toFixed(2)}B` },
      ...results.map(r => ({ recordKey: r.ticker, reason: `${r.name}: $${(r.mcap / 1e9).toFixed(2)}B` }))
    ],
  });
}

return await main();
