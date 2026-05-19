const hits = await Promise.all([
  df.db.cragWeb.search("first Bond girl actress Dr. No", { limit: 3 }),
  df.db.cragWeb.search("Ursula Andress Honey Ryder Bond girl", { limit: 3 }),
  df.db.cragWeb.search("James Bond film first Bond girl history", { limit: 3 }),
]);

const pages = hits.flat();

return df.answer({
  status: "answered",
  value: "Ursula Andress",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Ursula Andress played Honey Ryder in Dr. No (1962), the first James Bond film, making her the first actress to play a Bond girl.",
});
