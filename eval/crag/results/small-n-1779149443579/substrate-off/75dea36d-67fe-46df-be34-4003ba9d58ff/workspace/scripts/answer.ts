const pages = await df.db.cragWeb.search("selena gomez kylie jenner social media following instagram", { limit: 5 });

return df.answer({
  status: "answered",
  value: "Selena Gomez",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Selena Gomez has consistently held a larger social media following than Kylie Jenner, particularly on Instagram where she has been among the most-followed accounts globally.",
});
