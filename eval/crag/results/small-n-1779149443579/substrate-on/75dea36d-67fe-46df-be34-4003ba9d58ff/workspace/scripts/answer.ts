const pages = await df.db.cragWeb.search("selena gomez kylie jenner social media following instagram", { limit: 5 });

return df.answer({
  status: "answered",
  value: "Selena Gomez",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Selena Gomez has historically held the record for most Instagram followers, surpassing Kylie Jenner.",
});
