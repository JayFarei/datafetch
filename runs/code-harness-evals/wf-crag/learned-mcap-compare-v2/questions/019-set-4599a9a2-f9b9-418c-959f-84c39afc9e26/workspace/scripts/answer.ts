// CRAG finance — set question 4599a9a2-f9b9-418c-959f-84c39afc9e26
//
// Question (verbatim):
// what energy stocks has higher market cap than shell company in the whole world
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // Find Shell company
  const shellMatches = await df.db.records.search("Shell", { limit: 10 });
  const shellRecord = shellMatches.find(r =>
    r.label.toLowerCase().includes("shell") &&
    (r.label.toLowerCase().includes("shell plc") || r.label.toLowerCase().includes("royal dutch") || r.id === "SHEL")
  ) || shellMatches[0];

  const shellTicker = shellRecord?.id;
  if (!shellTicker) {
    return df.answer({ status: "unsupported", value: "i don't know", evidence: [] });
  }

  const shellMcap = await df.tool.cragFinance.get_market_capitalization({ ticker: shellTicker });

  // Search for energy companies
  const energyMatches = await df.db.records.search("energy", { limit: 50 });

  // Get market caps for all energy companies
  const results: Array<{ name: string; ticker: string; mcap: number }> = [];

  for (const record of energyMatches) {
    if (record.id === shellTicker) continue;
    try {
      const mcap = await df.tool.cragFinance.get_market_capitalization({ ticker: record.id });
      if (mcap > shellMcap) {
        results.push({ name: record.label, ticker: record.id, mcap });
      }
    } catch {
      // skip
    }
  }

  // Also search for oil companies
  const oilMatches = await df.db.records.search("oil", { limit: 30 });
  for (const record of oilMatches) {
    if (record.id === shellTicker) continue;
    if (results.find(r => r.ticker === record.id)) continue;
    try {
      const mcap = await df.tool.cragFinance.get_market_capitalization({ ticker: record.id });
      if (mcap > shellMcap) {
        results.push({ name: record.label, ticker: record.id, mcap });
      }
    } catch {
      // skip
    }
  }

  // Sort by mcap descending
  results.sort((a, b) => b.mcap - a.mcap);

  const answer = results.map(r => `${r.name} (${r.ticker})`);

  return df.answer({
    status: "answered",
    value: answer.length > 0 ? answer : "none found",
    evidence: [
      { recordKey: shellRecord.recordKey, reason: `Shell market cap: ${shellMcap}` },
      ...results.map(r => ({ reason: `${r.name} (${r.ticker}): ${r.mcap}` })),
    ],
  });
}

return await main();
