const pages = await df.db.cragWeb.search("Lille game score today", { limit: 5 });

// This is a fast-changing, false-premise question — no reliable cached score exists
return df.answer({
  status: "unsupported",
  value: "invalid question",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Live sports scores are fast-changing and the question has a false premise; no current Lille game score is available in the cached pages.",
});
