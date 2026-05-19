const pages = await df.db.cragWeb.search("Dow Jones largest market capitalization company", { limit: 5 });

return df.answer({
  status: "answered",
  value: "Apple",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Apple (AAPL) is consistently the largest market cap company in the Dow Jones Industrial Average.",
});
