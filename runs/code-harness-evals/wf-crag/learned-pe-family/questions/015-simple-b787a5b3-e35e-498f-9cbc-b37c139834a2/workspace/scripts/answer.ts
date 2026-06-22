// CRAG finance — simple question b787a5b3-e35e-498f-9cbc-b37c139834a2
//
// Question (verbatim):
// what's the price-to-earnings ratio of bhp as of now?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const matches = await df.db.records.search("BHP");
  const ticker = matches[0]?.id;
  const pe = await df.tool.cragFinance.get_pe_ratio({ ticker });
  return df.answer({
    status: "answered",
    value: pe,
    evidence: [{ recordKey: matches[0]?.recordKey, reason: `P/E ratio for ${ticker}` }],
  });
}

return await main();