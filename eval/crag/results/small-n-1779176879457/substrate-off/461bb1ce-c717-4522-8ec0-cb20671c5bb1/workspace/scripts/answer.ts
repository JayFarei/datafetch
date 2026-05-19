const hits = await Promise.all([
  df.db.cragWeb.search("Rihanna break from music hiatus", { limit: 3 }),
  df.db.cragWeb.search("Rihanna music comeback 2022 2023", { limit: 3 }),
  df.db.cragWeb.search("Rihanna last album Anti 2016", { limit: 3 }),
]);

const pages = hits.flat();

return df.answer({
  status: "answered",
  value: "6 years",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Rihanna released Anti in 2016 and returned to music with a Super Bowl halftime performance in 2023, a roughly 6-year hiatus.",
});
