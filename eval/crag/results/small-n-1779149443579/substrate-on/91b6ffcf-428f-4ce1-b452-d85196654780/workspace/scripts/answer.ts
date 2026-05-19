const pages = await df.db.cragWeb.search("Chris Evans famous role Marvel", { limit: 5 });

return df.answer({
  status: "answered",
  value: "No, Chris Evans is most famous for his role as Captain America, not Iron Man.",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Iron Man is played by Robert Downey Jr.; Chris Evans is known for Captain America.",
});
