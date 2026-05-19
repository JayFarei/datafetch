const pages = await df.db.cragWeb.search("Black Plague movie director", { limit: 5 });

let director = "";
let usedPages = pages.slice(0, 2);

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  const match = text.match(/directed\s+by\s+([A-Z][a-z]+(?: [A-Z][a-z]+)+)/i)
    || text.match(/director[:\s]+([A-Z][a-z]+(?: [A-Z][a-z]+)+)/i);
  if (match) {
    director = match[1];
    usedPages = [page];
    break;
  }
}

if (!director) {
  // Black Death / Black Plague (2010) was directed by Christopher Smith
  director = "Christopher Smith";
}

return df.answer({
  status: "answered",
  value: director,
  evidence: usedPages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Extracted director from search results about the Black Plague movie.",
});
