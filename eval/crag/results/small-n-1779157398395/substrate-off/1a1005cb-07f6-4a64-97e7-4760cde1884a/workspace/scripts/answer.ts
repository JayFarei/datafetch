const pages = await df.db.cragWeb.search("Dead Meat film language released", { limit: 5 });

return df.answer({
  status: "answered",
  value: "English",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Dead Meat is a 2004 Irish horror film released in English.",
});
