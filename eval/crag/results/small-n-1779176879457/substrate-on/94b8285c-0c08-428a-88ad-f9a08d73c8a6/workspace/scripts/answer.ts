const hits = await Promise.all([
  df.db.cragWeb.search("countries adopted crypto legal tender", { limit: 3 }),
  df.db.cragWeb.search("El Salvador Bitcoin legal tender", { limit: 3 }),
  df.db.cragWeb.search("Central African Republic Bitcoin legal tender", { limit: 3 }),
]);

const pages = hits.flat();

return df.answer({
  status: "unsupported",
  value: "invalid question",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "The premise is false: only El Salvador (2021) and briefly the Central African Republic (2022) adopted Bitcoin as legal tender — not five countries.",
});
