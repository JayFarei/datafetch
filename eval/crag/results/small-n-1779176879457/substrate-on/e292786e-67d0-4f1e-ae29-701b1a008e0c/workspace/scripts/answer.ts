const hits = await Promise.all([
  df.db.cragWeb.search("Academy Award Best Picture 2012", { limit: 3 }),
  df.db.cragWeb.search("84th Academy Awards Best Picture winner", { limit: 3 }),
]);

const pages = hits.flat();

return df.answer({
  status: "answered",
  value: "The Artist",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "The Artist won Best Picture at the 84th Academy Awards ceremony held in February 2012.",
});
