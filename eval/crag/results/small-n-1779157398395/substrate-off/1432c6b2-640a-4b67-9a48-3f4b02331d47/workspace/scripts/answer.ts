const pages = await df.db.cragWeb.search("Black Plague film director", { limit: 5 });

let director = "";
let evidencePages = pages.slice(0, 2);

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  const m = text.match(/[Dd]irected\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
  if (m) {
    director = m[1];
    evidencePages = [page];
    break;
  }
}

if (!director) {
  // Black Plague (2002) directed by Leigh Scott; or Black Death (2010) by Christopher Smith
  // Try another search
  const pages2 = await df.db.cragWeb.search("Black Plague movie 2002 director", { limit: 5 });
  for (const page of pages2) {
    const text = page.pageResult || page.pageSnippet || "";
    const m = text.match(/[Dd]irected\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
    if (m) {
      director = m[1];
      evidencePages = [page];
      break;
    }
  }
}

if (!director) {
  return df.answer({
    status: "unsupported",
    value: "invalid question",
    evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
    derivation: "Could not find director information in cached pages.",
  });
}

return df.answer({
  status: "answered",
  value: director,
  evidence: evidencePages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Extracted director name from 'Directed by' pattern in page text.",
});
