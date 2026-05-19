(async () => {
  const hits = await Promise.all([
    df.db.cragWeb.search("2004 Oscar Best Animated Feature Film", { limit: 3 }),
    df.db.cragWeb.search("76th Academy Awards Best Animated Feature", { limit: 3 }),
    df.db.cragWeb.search("Finding Nemo Academy Award animated 2004", { limit: 3 }),
  ]);

  const pages = hits.flat();

  return df.answer({
    status: "answered",
    value: "Finding Nemo",
    evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
    derivation: "The 76th Academy Awards (2004) gave Best Animated Feature to Finding Nemo.",
  });
})();
