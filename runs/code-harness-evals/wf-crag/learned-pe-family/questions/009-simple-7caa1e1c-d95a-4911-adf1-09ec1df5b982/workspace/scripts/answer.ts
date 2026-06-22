// CRAG finance — simple question 7caa1e1c-d95a-4911-adf1-09ec1df5b982
//
// Question (verbatim):
// i'm interested in finding out the p/e ratio of pkst. can you help me with that?
//
// Replace the body below. Resolve company names via df.db.records, fetch
// finance data via df.tool.cragFinance.*, compute, then RETURN df.answer(...).

async function main() {
  // const matches = await df.db.records.search("Apple");
  // const ticker = matches[0]?.id;
  // const pe = await df.tool.cragFinance.get_pe_ratio({ ticker });
  return df.answer({
    status: "unsupported",
    value: null,
    evidence: [],
  });
}

return await main();