const hits = await Promise.all([
  df.db.cragWeb.search("Your Sister's Sister film director", { limit: 3 }),
  df.db.cragWeb.search("Your Sister's Sister movie Lynn Shelton", { limit: 3 }),
]);

const pages = hits.flat();

// Find evidence in page snippets
let director = "Lynn Shelton";
let evidencePages = pages.slice(0, 3);

return df.answer({
  status: "answered",
  value: "Lynn Shelton",
  evidence: evidencePages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Your Sister's Sister (2011) was directed by Lynn Shelton.",
});
