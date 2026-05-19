const pages = await df.db.cragWeb.search("Lakers head coach 1996-97 Kobe Bryant rookie year", { limit: 5 });

return df.answer({
  status: "answered",
  value: "Del Harris",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Kobe Bryant's rookie season was 1996-97; Del Harris was the Lakers head coach that season.",
});
