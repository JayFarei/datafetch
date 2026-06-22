// CRAG finance — simple question c2911bd8-227c-4d08-9eb7-68b219fcc469
//
// Question (verbatim):
// can you give me an update on the pe ratio of clorox company?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const matches = await df.db.records.search("Clorox");
  const ticker = matches[0]?.id;
  const pe = await df.tool.cragFinance.get_pe_ratio({ ticker });
  return df.answer({
    status: "answered",
    value: pe,
    evidence: [{ recordKey: matches[0]?.recordKey, reason: `PE ratio for ${ticker}` }],
  });
}

return await main();