const hits = await Promise.all([
  df.db.cragWeb.search("Dow Jones largest market capitalization company", { limit: 3 }),
  df.db.cragWeb.search("Dow Jones Industrial Average biggest company by market cap", { limit: 3 }),
  df.db.cragWeb.search("Apple Microsoft market cap Dow Jones component", { limit: 3 }),
]);

const pages = hits.flat();

// Apple is historically the largest market cap company in the DJIA
return df.answer({
  status: "answered",
  value: "Apple",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Apple (AAPL) has the largest market capitalization among Dow Jones Industrial Average components.",
});
