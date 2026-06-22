// CRAG finance — simple question 1b1a0725-6814-4c30-9adc-f3ec8b658c5e
//
// Question (verbatim):
// i'm looking for the p/e ratio of dks. would you happen to know what it is?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const matches = await df.db.records.search("DKS");
  const ticker = matches[0]?.id ?? "DKS";
  const pe = await df.tool.cragFinance.get_pe_ratio({ ticker });
  return df.answer({
    status: "answered",
    value: pe,
    evidence: [{ recordKey: matches[0]?.recordKey, reason: `P/E ratio for ${ticker}` }],
  });
}

return await main();