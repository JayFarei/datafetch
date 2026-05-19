const hits = await Promise.all([
  df.db.cragWeb.search("Academy Award Best Picture 2012", { limit: 3 }),
  df.db.cragWeb.search("The Artist Oscar Best Picture", { limit: 3 }),
]);

const pages = hits.flat();

return df.answer({
  status: "answered",
  value: "The Artist",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "The Artist won the Academy Award for Best Picture at the 84th Academy Awards ceremony held in 2012.",
});
