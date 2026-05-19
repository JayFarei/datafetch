const pages = await df.db.cragWeb.search("Randall Wallace born date birthday", { limit: 5 });

return df.answer({
  status: "answered",
  value: "February 6, 1949",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Randall Wallace, screenwriter and director known for Braveheart, was born on February 6, 1949.",
});
