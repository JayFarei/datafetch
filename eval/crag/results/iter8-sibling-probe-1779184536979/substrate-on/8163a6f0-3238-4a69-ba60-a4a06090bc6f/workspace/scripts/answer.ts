(async () => {
  const hits = await Promise.all([
    df.db.cragWeb.search("Best Animated Feature Oscar 2004", { limit: 3 }),
    df.db.cragWeb.search("76th Academy Awards Best Animated Feature Film", { limit: 3 }),
    df.db.cragWeb.search("Finding Nemo Academy Award 2004", { limit: 3 }),
  ]);

  const pages = hits.flat();

  return df.answer({
    status: "answered",
    value: "Finding Nemo",
    evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
    derivation: "At the 76th Academy Awards (2004), Finding Nemo won Best Animated Feature Film.",
  });
})();
