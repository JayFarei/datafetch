// CRAG finance — simple question b38205af-d288-4a78-bf39-41a1e9196cc9
//
// Question (verbatim):
// can you provide me with the p/e ratio of uzf?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const matches = await df.db.records.search("UZF");
  const ticker = matches[0]?.id ?? "UZF";
  const pe = await df.tool.cragFinance.get_pe_ratio({ ticker });
  return df.answer({
    status: "answered",
    value: pe,
    evidence: [{ reason: `P/E ratio for ${ticker}` }],
  });
}

return await main();