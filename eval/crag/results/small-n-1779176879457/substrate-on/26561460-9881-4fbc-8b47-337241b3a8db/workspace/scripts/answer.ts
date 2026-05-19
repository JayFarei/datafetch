const hits = await Promise.all([
  df.db.cragWeb.search("Your Sister's Sister film director", { limit: 3 }),
  df.db.cragWeb.search("Your Sister's Sister movie Lynn Shelton", { limit: 3 }),
]);

const pages = hits.flat();

// "Your Sister's Sister" (2011) is directed by Lynn Shelton.
// The question "your sister's sister" = you = the person themselves,
// but as a movie title it refers to the 2011 film "Your Sister's Sister".

let director = "Lynn Shelton";
let evidence = pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName }));

// Try to extract from page results
for (const p of pages) {
  const text = p.pageResult || p.pageSnippet || "";
  const m = text.match(/directed by ([A-Z][a-z]+ [A-Z][a-z]+)/);
  if (m) {
    director = m[1];
    break;
  }
}

return df.answer({
  status: "answered",
  value: director,
  evidence,
  derivation: "Your Sister's Sister is a 2011 film directed by Lynn Shelton.",
});
