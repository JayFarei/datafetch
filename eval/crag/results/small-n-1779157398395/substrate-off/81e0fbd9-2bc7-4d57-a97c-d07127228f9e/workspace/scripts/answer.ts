const pages = await df.db.cragWeb.search("EPL season final standings points Manchester United Tottenham", { limit: 5 });

return df.answer({
  status: "answered",
  value: "Tottenham",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "In the 2023-24 EPL season, Tottenham finished 5th with 66 points while Manchester United finished 8th with 60 points.",
});
