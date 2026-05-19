const hits = await Promise.all([
  df.db.cragWeb.search("2004 Academy Award Best Animated Feature Film", { limit: 3 }),
  df.db.cragWeb.search("Oscar Best Animated Feature 2004 winner", { limit: 3 }),
  df.db.cragWeb.search("Finding Nemo Academy Award animated", { limit: 3 }),
]);

const pages = hits.flat();

return df.answer({
  status: "answered",
  value: "Finding Nemo",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Finding Nemo won the Best Animated Feature Film Oscar at the 76th Academy Awards held in 2004.",
});
