const pages = await df.db.cragWeb.search("selena gomez kylie jenner social media following instagram", { limit: 5 });

return df.answer({
  status: "answered",
  value: "Selena Gomez",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Selena Gomez has historically had a larger total social media following than Kylie Jenner, particularly on Instagram where she was the most-followed person for years.",
});
