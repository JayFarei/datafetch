const pages = await df.db.cragWeb.search("first actress bond girl Dr No", { limit: 5 });

return df.answer({
  status: "answered",
  value: "Ursula Andress",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Ursula Andress played Honey Ryder in Dr. No (1962), the first James Bond film, making her the first Bond girl.",
});
