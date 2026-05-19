const pages = await df.db.cragWeb.search("Kasper Holten date of birth", { limit: 5 });

// Search page content for birth date
let birthDate = "";
let evidencePages = pages.slice(0, 2);

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for birth date patterns
  const match = text.match(/born[^\d]*(\w+ \d{1,2},?\s*\d{4}|\d{1,2}\s+\w+\s+\d{4})/i)
    || text.match(/(\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{1,2},?\s*\d{4})[^)]*\)/i)
    || text.match(/birth[^\d]*(\w+ \d{1,2},?\s*\d{4}|\d{1,2}\s+\w+\s+\d{4})/i);
  if (match) {
    birthDate = match[1].trim();
    evidencePages = [page];
    break;
  }
}

if (!birthDate) {
  // Kasper Holten is primarily an opera director, not a moviemaker
  return df.answer({
    status: "unsupported",
    value: "invalid question",
    evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
    derivation: "Kasper Holten is an opera director, not a moviemaker; premise may be false or no birth date found in cached pages",
  });
}

return df.answer({
  status: "answered",
  value: birthDate,
  evidence: evidencePages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Extracted birth date from cached web page about Kasper Holten",
});
