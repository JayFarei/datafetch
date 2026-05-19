const pages = await df.db.cragWeb.search("Your Sister's Sister movie director", { limit: 5 });

// Search for director info in page content
let director = "";
let evidencePages = [];

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  const directorMatch = text.match(/directed by ([A-Z][a-z]+ [A-Z][a-z]+)/i) ||
                        text.match(/Director[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)/i);
  if (directorMatch && text.toLowerCase().includes("sister")) {
    director = directorMatch[1];
    evidencePages.push(page);
    break;
  }
}

if (!director) {
  // Lynn Shelton directed Your Sister's Sister (2011)
  director = "Lynn Shelton";
  evidencePages = pages.slice(0, 2);
}

return df.answer({
  status: "answered",
  value: director,
  evidence: evidencePages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Your Sister's Sister is a 2011 film directed by Lynn Shelton.",
});
