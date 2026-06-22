// CRAG finance — simple question 6a45b6ff-c499-4148-8306-b53a375db15b
//
// Question (verbatim):
// can you give me the latest p/e ratio for chrd?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  const matches = await df.db.records.search("CHRD");
  const record = matches.find(r => r.id === "CHRD" || r.attributes?.symbol === "CHRD") ?? matches[0];
  const ticker = record?.id ?? "CHRD";
  const pe = await df.tool.cragFinance.get_pe_ratio({ ticker });
  return df.answer({
    status: "answered",
    value: pe,
    evidence: [{ recordKey: record?.recordKey, reason: `P/E ratio for ${ticker}` }],
  });
}

return await main();