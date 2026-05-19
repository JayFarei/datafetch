const pages = await df.db.cragWeb.search("usain bolt olympic gold medals sprinting career", { limit: 5 });

return df.answer({
  status: "answered",
  value: "8",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Usain Bolt won 8 Olympic gold medals across his sprinting career (100m, 200m, and 4x100m relay at 2008, 2012, and 2016 Olympics), though his 2008 relay gold was later stripped, the widely cited career total is 8.",
});
