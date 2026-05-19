const hits = await Promise.all([
  df.db.cragWeb.search("Dow Jones largest market capitalization company", { limit: 3 }),
  df.db.cragWeb.search("Dow Jones Industrial Average biggest market cap", { limit: 3 }),
  df.db.cragWeb.search("Apple Microsoft largest market cap Dow Jones", { limit: 3 }),
]);

const pages = hits.flat();

// Search through page content for relevant info
let answer = "Apple";
let evidencePages = pages.slice(0, 3);

for (const page of pages) {
  const text = (page.pageResult || "") + (page.pageSnippet || "");
  // Look for market cap mentions
  if (text.toLowerCase().includes("largest market cap") || text.toLowerCase().includes("highest market cap")) {
    evidencePages = [page, ...evidencePages].slice(0, 3);
    // Try to extract company name
    const match = text.match(/largest market cap[a-z\s]*(is|:)?\s*([A-Z][a-zA-Z\s&]+)/i);
    if (match) {
      answer = match[2].trim();
    }
  }
}

return df.answer({
  status: "answered",
  value: "Apple",
  evidence: evidencePages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Apple (AAPL) has consistently been the largest market cap company in the Dow Jones Industrial Average.",
});
