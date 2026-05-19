const pages = await df.db.cragWeb.search("Israel Adesanya UFC fights decision percentage", { limit: 5 });

// Search for decision stats in page results
let decisionPct = "";
let evidencePages = pages.slice(0, 2);

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for decision percentage mentions
  const match = text.match(/(\d+(?:\.\d+)?)\s*%[^)]*decision/i) ||
                text.match(/decision[^)]*(\d+(?:\.\d+)?)\s*%/i);
  if (match) {
    decisionPct = match[1] + "%";
    evidencePages = [page];
    break;
  }
}

// Israel Adesanya record as of late 2023: 24 fights, ~8 decisions = ~33%
// Let the search data determine the answer
if (!decisionPct) {
  // Try alternate parsing
  for (const page of pages) {
    const text = page.pageResult || page.pageSnippet || "";
    const lines = text.split(/\n/);
    for (const line of lines) {
      if (/decision/i.test(line) && /\d+%/.test(line)) {
        const m = line.match(/(\d+(?:\.\d+)?)\s*%/);
        if (m) {
          decisionPct = m[1] + "%";
          break;
        }
      }
    }
    if (decisionPct) break;
  }
}

return df.answer({
  status: decisionPct ? "answered" : "unsupported",
  value: decisionPct || "invalid question",
  evidence: evidencePages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Searched cached pages for Israel Adesanya's UFC decision percentage and extracted the figure.",
});
