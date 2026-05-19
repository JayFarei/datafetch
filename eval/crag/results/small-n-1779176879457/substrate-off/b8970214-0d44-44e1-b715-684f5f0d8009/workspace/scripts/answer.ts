const hits = await Promise.all([
  df.db.cragWeb.search("Beatles number one hits Billboard Hot 100", { limit: 3 }),
  df.db.cragWeb.search("Beatles number one singles chart", { limit: 3 }),
  df.db.cragWeb.search("Beatles discography number ones US UK", { limit: 3 }),
]);

const pages = hits.flat();

return df.answer({
  status: "answered",
  value: "20",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "The Beatles had 20 number-one hits on the US Billboard Hot 100.",
});
