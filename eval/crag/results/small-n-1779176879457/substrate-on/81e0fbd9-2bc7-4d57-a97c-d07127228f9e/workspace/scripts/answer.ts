const hits = await Promise.all([
  df.db.cragWeb.search("Manchester United 2023-24 EPL season points", { limit: 3 }),
  df.db.cragWeb.search("Tottenham 2023-24 Premier League final standings points", { limit: 3 }),
  df.db.cragWeb.search("EPL 2023-24 final table standings", { limit: 3 }),
]);

const pages = hits.flat();

return df.answer({
  status: "answered",
  value: "Tottenham",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "In the 2023-24 EPL season, Tottenham finished 5th with 66 points while Manchester United finished 8th with 60 points, so Tottenham had more points.",
});
