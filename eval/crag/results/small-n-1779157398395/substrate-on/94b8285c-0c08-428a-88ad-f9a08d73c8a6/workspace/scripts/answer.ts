const pages = await df.db.cragWeb.search("countries adopted crypto bitcoin legal tender", { limit: 5 });

return df.answer({
  status: "unsupported",
  value: "invalid question",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "The premise is false — only El Salvador (2021) and the Central African Republic (2022) have adopted Bitcoin as legal tender, not five countries.",
});
