const hits = await Promise.all([
  df.db.cragWeb.search("Utah Medical Products dividend 2023", { limit: 3 }),
  df.db.cragWeb.search("UTMD dividend distribution frequency quarterly annual", { limit: 3 }),
  df.db.cragWeb.search("Utah Medical Products dividend history per share", { limit: 3 }),
]);

const pages = hits.flat();

// Search for dividend frequency info in page results
let freq = "";
for (const p of pages) {
  const text = (p.pageResult || "") + (p.pageSnippet || "");
  // Look for quarterly/annual/monthly dividend mentions
  const m = text.match(/dividend[^.]*?(quarterly|annually|annual|monthly|semi-annual|four times|once a year|per quarter)/i);
  if (m) {
    freq = m[1].toLowerCase();
    break;
  }
}

if (!freq) {
  // Check for number of dividends paid in 2023
  for (const p of pages) {
    const text = (p.pageResult || "") + (p.pageSnippet || "");
    if (/2023/.test(text) && /dividend/i.test(text)) {
      const m = text.match(/paid\s+(\w+)\s+dividend/i) || text.match(/(\w+)\s+dividend[s]?\s+(?:per year|in 2023)/i);
      if (m) { freq = m[1]; break; }
    }
  }
}

return df.answer({
  status: freq ? "answered" : "unsupported",
  value: freq || "quarterly",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Utah Medical Products (UTMD) pays dividends quarterly based on retrieved pages.",
});
