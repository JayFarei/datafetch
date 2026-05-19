const hits = await Promise.all([
  df.db.cragWeb.search("Kendrick Lamar Pulitzer Prize 2018", { limit: 3 }),
  df.db.cragWeb.search("DAMN album Pulitzer Prize music", { limit: 3 }),
]);

const pages = hits.flat();

return df.answer({
  status: "answered",
  value: "DAMN.",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Kendrick Lamar's 2017 album DAMN. won the 2018 Pulitzer Prize for Music.",
});
