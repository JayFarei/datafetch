// CRAG finance — simple question cca512e1-e6b9-4d2e-ad0d-0d1f7f04c537
//
// Question (verbatim):
// as of now, what is the pe ratio of douyu international holdings limited ads?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const matches = await df.db.records.search("Douyu International Holdings");
  const ticker = matches[0]?.id;
  const pe = await df.tool.cragFinance.get_pe_ratio({ ticker });
  return df.answer({
    status: "answered",
    value: pe,
    evidence: [{ recordKey: matches[0]?.recordKey, reason: `PE ratio for ${ticker}` }],
  });
}

return await main();