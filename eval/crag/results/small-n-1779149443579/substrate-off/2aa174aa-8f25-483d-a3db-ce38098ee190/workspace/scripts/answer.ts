const pages = await df.db.cragWeb.search("Usain Bolt olympic gold medals sprinting career", { limit: 5 });

return df.answer({
  status: "answered",
  value: "8",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Usain Bolt won 8 Olympic gold medals: 100m, 200m, 4x100m relay at 2008, 2012, and 2016 Olympics.",
});
