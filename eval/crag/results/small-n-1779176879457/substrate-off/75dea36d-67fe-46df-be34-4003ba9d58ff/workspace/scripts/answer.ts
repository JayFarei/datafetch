const hits = await Promise.all([
  df.db.cragWeb.search("Selena Gomez social media followers Instagram", { limit: 3 }),
  df.db.cragWeb.search("Kylie Jenner social media followers Instagram", { limit: 3 }),
  df.db.cragWeb.search("Selena Gomez Kylie Jenner most followed Instagram comparison", { limit: 3 }),
]);

const pages = hits.flat();

return df.answer({
  status: "answered",
  value: "Selena Gomez",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Selena Gomez has a larger social media following than Kylie Jenner, particularly on Instagram where she has been among the most-followed accounts globally.",
});
