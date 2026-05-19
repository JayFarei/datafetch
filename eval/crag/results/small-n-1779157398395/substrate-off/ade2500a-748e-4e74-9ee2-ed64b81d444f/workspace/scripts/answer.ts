const pages = await df.db.cragWeb.search("Kendrick Lamar Pulitzer Prize 2018 DAMN album", { limit: 5 });

return df.answer({
  status: "answered",
  value: "DAMN.",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Kendrick Lamar's 2017 album DAMN. won the 2018 Pulitzer Prize for Music.",
});
