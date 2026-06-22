// CRAG finance — simple question 5cc6a7e9-ef88-403d-a9e6-bc2faae48ba3
//
// Question (verbatim):
// can you give me the latest p/e ratio for clco?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const matches = await df.db.records.search("CLCO");
  const ticker = matches[0]?.id ?? "CLCO";
  const pe = await df.tool.cragFinance.get_pe_ratio({ ticker });
  return df.answer({
    status: "answered",
    value: pe,
    evidence: [{ recordKey: matches[0]?.recordKey, reason: "P/E ratio from cragFinance" }],
  });
}

return await main();