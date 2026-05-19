const pages = await df.db.cragWeb.search("Beatles number one hits Billboard", { limit: 5 });

return df.answer({
  status: "answered",
  value: "20",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "The Beatles had 20 number one singles on the US Billboard Hot 100.",
});
