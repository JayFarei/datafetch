const hits = await Promise.all([
  df.db.cragWeb.search("Sonia Sotomayor president", { limit: 3 }),
  df.db.cragWeb.search("Sonia Sotomayor Supreme Court Justice", { limit: 3 }),
]);

const pages = hits.flat();

return df.answer({
  status: "unsupported",
  value: "invalid question",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Sonia Sotomayor is a Supreme Court Justice, not a president, so the premise is false.",
});
