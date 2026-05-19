const pages = await df.db.cragWeb.search("first actress bond girl Eunice Gayson Dr No", { limit: 5 });

return df.answer({
  status: "answered",
  value: "Eunice Gayson",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Eunice Gayson played Sylvia Trench in Dr. No (1962), the first Bond girl in the film series.",
});
