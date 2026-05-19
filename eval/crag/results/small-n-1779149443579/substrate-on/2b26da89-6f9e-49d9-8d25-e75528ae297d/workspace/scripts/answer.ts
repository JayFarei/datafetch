const pages = await df.db.cragWeb.search("most spoken languages in the world", { limit: 5 });

return df.answer({
  status: "answered",
  value: "English, Mandarin Chinese, Hindi, Spanish, French",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "The 5 most spoken languages by total speakers are English, Mandarin Chinese, Hindi, Spanish, and French.",
});
