const pages = await df.db.cragWeb.search("Academy Award Best Picture 2012 winner", { limit: 5 });

return df.answer({
  status: "answered",
  value: "The Artist",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "The Artist won the Academy Award for Best Picture at the 84th Academy Awards ceremony held in February 2012.",
});
