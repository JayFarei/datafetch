const pages = await df.db.cragWeb.search("countries adopted crypto bitcoin legal tender", { limit: 5 });

// The question has a false premise — only two countries have adopted Bitcoin
// as legal tender (El Salvador in 2021 and Central African Republic in 2022).
// No five countries have done so.

return df.answer({
  status: "unsupported",
  value: "invalid question",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Only two countries (El Salvador and Central African Republic) have adopted crypto as legal tender; the premise of five countries is false.",
});
