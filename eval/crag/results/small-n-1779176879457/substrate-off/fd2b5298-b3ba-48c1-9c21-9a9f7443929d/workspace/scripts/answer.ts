const hits = await Promise.all([
  df.db.cragWeb.search("Lloyd A. Simandl birth date", { limit: 3 }),
  df.db.cragWeb.search("Lloyd Simandl born", { limit: 3 }),
  df.db.cragWeb.search("Simandl filmmaker birthday", { limit: 3 }),
]);

const pages = hits.flat();

// Search through page results for birth date info
let birthDate = "";
let evidencePages = [];

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  const lower = text.toLowerCase();
  if (lower.includes("simandl") && (lower.includes("born") || lower.includes("birth"))) {
    // Try to extract birth date
    const bornMatch = text.match(/born[:\s]+([A-Z][a-z]+ \d{1,2},?\s*\d{4})/i) ||
                      text.match(/(\w+ \d{1,2},?\s*\d{4})/);
    if (bornMatch) {
      birthDate = bornMatch[1];
      evidencePages.push(page);
      break;
    }
    evidencePages.push(page);
  }
}

if (!birthDate) {
  return df.answer({
    status: "unsupported",
    value: "invalid question",
    evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
    derivation: "No birth date found for Lloyd A. Simandl in the cached pages.",
  });
}

return df.answer({
  status: "answered",
  value: birthDate,
  evidence: evidencePages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Extracted birth date from page mentioning Lloyd A. Simandl.",
});
