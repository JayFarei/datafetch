// CRAG finance — set question 4599a9a2-f9b9-418c-959f-84c39afc9e26
//
// Question (verbatim):
// what energy stocks has higher market cap than shell company in the whole world
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // Find Shell company ticker
  const shellMatches = await df.db.records.search("Shell");
  const shellRecord = shellMatches.find(r =>
    r.label.toLowerCase().includes("shell") &&
    !r.label.toLowerCase().includes("nutshell")
  );
  if (!shellRecord) {
    return df.answer({ status: "unsupported", value: null, evidence: [] });
  }
  const shellTicker = shellRecord.id;
  const shellMcap = await df.tool.cragFinance.get_market_capitalization({ ticker: shellTicker });

  // Search for energy companies broadly
  const energySearchTerms = ["energy", "oil", "petroleum", "exxon", "chevron", "bp", "totalenergies", "conocophillips", "saudi aramco", "petro"];
  const allMatches: Array<{ id: string; label: string }> = [];
  const seen = new Set<string>();

  for (const term of energySearchTerms) {
    const results = await df.db.records.search(term, { limit: 20 });
    for (const r of results) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        allMatches.push({ id: r.id, label: r.label });
      }
    }
  }

  // Get market caps and filter those higher than Shell
  const higher: Array<{ ticker: string; name: string; mcap: number }> = [];

  for (const company of allMatches) {
    if (company.id === shellTicker) continue;
    try {
      const mcap = await df.tool.cragFinance.get_market_capitalization({ ticker: company.id });
      if (mcap > shellMcap) {
        higher.push({ ticker: company.id, name: company.label, mcap });
      }
    } catch {
      // skip companies where data unavailable
    }
  }

  higher.sort((a, b) => b.mcap - a.mcap);

  const value = higher.length > 0
    ? higher.map(c => `${c.name} (${c.ticker})`).join(", ")
    : "none found";

  return df.answer({
    status: "answered",
    value,
    evidence: [
      { reason: `Shell (${shellTicker}) market cap: ${shellMcap}` },
      ...higher.map(c => ({ reason: `${c.name} (${c.ticker}): ${c.mcap}` }))
    ],
  });
}

return await main();
