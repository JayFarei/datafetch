const hits = await Promise.all([
  df.db.cragWeb.search("most spoken languages in the world", { limit: 3 }),
  df.db.cragWeb.search("top 5 languages by number of speakers", { limit: 3 }),
]);

const pages = hits.flat();

return df.answer({
  status: "answered",
  value: "English, Mandarin Chinese, Hindi, Spanish, French",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "The 5 most spoken languages by total speakers are English, Mandarin Chinese, Hindi, Spanish, and French.",
});
