// CRAG finance — simple question b56c4063-5398-4cb4-b8e8-069279e49281
//
// Question (verbatim):
// could you provide me with the price-to-earnings ratio of psf?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const matches = await df.db.records.search("PSF");
  const ticker = matches[0]?.id ?? "PSF";
  const pe = await df.tool.cragFinance.get_pe_ratio({ ticker });
  if (pe == null) {
    return df.answer({ status: "unsupported", value: "i don't know", evidence: [] });
  }
  return df.answer({
    status: "answered",
    value: pe,
    evidence: [{ recordKey: matches[0]?.recordKey, reason: "P/E ratio from cragFinance" }],
  });
}

return await main();