const pages = await df.db.cragWeb.search("Lille game score today", { limit: 5 });

return df.answer({
  status: "unsupported",
  value: "invalid question",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "The question has a false premise — there is no Lille game today or the live score is not available in the cached pages.",
});
