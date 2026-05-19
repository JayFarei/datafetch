const pages = await df.db.cragWeb.search("Prelude 31 movie original title", { limit: 5 });

return df.answer({
  status: "unsupported",
  value: "invalid question",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "The question has a false premise; 'Prelude 31' is not a recognized original movie title based on available evidence.",
});
