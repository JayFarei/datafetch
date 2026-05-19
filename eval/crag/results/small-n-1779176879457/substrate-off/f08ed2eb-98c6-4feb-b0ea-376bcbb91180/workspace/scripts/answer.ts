const hits = await Promise.all([
  df.db.cragWeb.search("INTA stock price", { limit: 3 }),
  df.db.cragWeb.search("Intapp INTA closing price", { limit: 3 }),
  df.db.cragWeb.search("INTA end of day price yesterday", { limit: 3 }),
]);

const pages = hits.flat();

return df.answer({
  status: "unsupported",
  value: "I don't know",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Real-time stock price data is not available in the cached pages; cannot determine yesterday's closing price for INTA.",
});
