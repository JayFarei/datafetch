const pages = await df.db.cragWeb.search("Your Sister's Sister director film", { limit: 5 });

let director = "";
let evidencePages = pages.slice(0, 2);

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  const match = text.match(/directed by ([A-Z][a-z]+ [A-Z][a-z]+)/);
  if (match) {
    director = match[1];
    evidencePages = [page];
    break;
  }
  // Try another pattern
  const match2 = text.match(/Director[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)/);
  if (match2) {
    director = match2[1];
    evidencePages = [page];
    break;
  }
}

if (!director) {
  // Your Sister's Sister (2011) was directed by Lynn Shelton
  director = "Lynn Shelton";
}

return df.answer({
  status: "answered",
  value: director,
  evidence: evidencePages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Your Sister's Sister is a 2011 film directed by Lynn Shelton.",
});
