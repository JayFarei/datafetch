const hits = await Promise.all([
  df.db.cragWeb.search("2004 Oscar Best Animated Feature Film winner", { limit: 3 }),
  df.db.cragWeb.search("Finding Nemo Academy Award animated feature", { limit: 3 }),
  df.db.cragWeb.search("76th Academy Awards Best Animated Feature", { limit: 3 }),
]);

const pages = hits.flat();

return df.answer({
  status: "answered",
  value: "Finding Nemo",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Finding Nemo won the Best Animated Feature Film Oscar at the 76th Academy Awards ceremony held in 2004.",
});
