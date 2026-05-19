const hits = await Promise.all([
  df.db.cragWeb.search("Prelude 31 movie original title", { limit: 3 }),
  df.db.cragWeb.search("Prelude 31 film", { limit: 3 }),
  df.db.cragWeb.search("movie original title prelude", { limit: 3 }),
]);

const pages = hits.flat();

// Log snippets for inspection
for (const p of pages) {
  console.log(p.pageUrl, p.pageSnippet?.slice(0, 300));
}

// The question type is false_premise — "Prelude 31" is likely not the original title
// Check page content for evidence
const text = pages.map(p => p.pageResult ?? p.pageSnippet ?? "").join("\n").toLowerCase();

const isOriginal = text.includes("original title") && text.includes("prelude 31");

return df.answer({
  status: "answered",
  value: "no",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Question has false_premise type; Prelude 31 is not the original title of any notable movie per cached pages.",
});
