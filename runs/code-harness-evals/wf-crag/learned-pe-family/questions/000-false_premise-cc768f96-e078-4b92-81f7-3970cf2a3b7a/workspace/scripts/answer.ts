// CRAG finance — false_premise question cc768f96-e078-4b92-81f7-3970cf2a3b7a
//
// Question (verbatim):
// what is the price-to-earnings ratio of didi now?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const matches = await df.db.records.search("DiDi");
  const ticker = matches[0]?.id;
  if (!ticker) {
    return df.answer({ status: "answered", value: "invalid question", evidence: [] });
  }
  const pe = await df.tool.cragFinance.get_pe_ratio({ ticker });
  if (pe === null || pe === undefined || isNaN(pe)) {
    return df.answer({ status: "answered", value: "invalid question", evidence: [{ recordKey: matches[0]?.recordKey, reason: "DiDi is delisted/no P/E ratio available" }] });
  }
  return df.answer({ status: "answered", value: pe, evidence: [{ recordKey: matches[0]?.recordKey }] });
}

return await main();