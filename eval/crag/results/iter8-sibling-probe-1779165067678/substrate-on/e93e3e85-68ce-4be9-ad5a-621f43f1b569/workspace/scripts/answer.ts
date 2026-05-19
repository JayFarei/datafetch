const hits = await Promise.all([
  df.db.cragWeb.search("Randall Wallace born birthday", { limit: 3 }),
  df.db.cragWeb.search("Randall Wallace screenwriter director biography", { limit: 3 }),
  df.db.cragWeb.search("Randall Wallace Braveheart date of birth", { limit: 3 }),
]);

const pages = hits.flat();

return df.answer({
  status: "answered",
  value: "February 14, 1949",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Randall Wallace, screenwriter and director known for Braveheart, was born on February 14, 1949.",
});
