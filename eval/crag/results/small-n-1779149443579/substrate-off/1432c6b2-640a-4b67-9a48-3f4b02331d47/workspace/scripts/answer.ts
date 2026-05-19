const pages = await df.db.cragWeb.search("Black Plague movie director", { limit: 5 });

// Search for director info in pages
let director = "";
let evidencePages = pages.slice(0, 2);

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  const match = text.match(/[Dd]irected by ([A-Z][a-z]+ [A-Z][a-z]+)/);
  if (match) {
    director = match[1];
    evidencePages = [page];
    break;
  }
}

if (!director) {
  // Black Plague (2002) directed by Todor Chapkanov, or Black Death (2010) by Christopher Smith
  // Try snippet search
  for (const page of pages) {
    const text = (page.pageResult || page.pageSnippet || "").toLowerCase();
    if (text.includes("chapkanov") || text.includes("christopher smith")) {
      director = text.includes("chapkanov") ? "Todor Chapkanov" : "Christopher Smith";
      evidencePages = [page];
      break;
    }
  }
}

if (!director) {
  return df.answer({
    status: "unsupported",
    value: "invalid question",
    evidence: [],
    derivation: "Could not find director of Black Plague in cached pages.",
  });
}

return df.answer({
  status: "answered",
  value: director,
  evidence: evidencePages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: `Found director name in cached web pages about Black Plague.`,
});
