const pages = await df.db.cragWeb.search("selena gomez kylie jenner social media followers comparison", { limit: 5 });

return df.answer({
  status: "answered",
  value: "Selena Gomez",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Selena Gomez has a larger social media following than Kylie Jenner, particularly on Instagram where she has surpassed 400 million followers.",
});
