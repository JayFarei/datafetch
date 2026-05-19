const hits = await Promise.all([
  df.db.cragWeb.search("NFL Comeback Player of the Year award winner", { limit: 3 }),
  df.db.cragWeb.search("comeback player year NFL award", { limit: 3 }),
  df.db.cragWeb.search("NFL award comeback player season", { limit: 3 }),
]);

const pages = hits.flat();

// Search through page results for the answer
let value = "unknown";
let derivation = "No clear answer found in retrieved pages";

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for comeback player of the year mentions
  const match = text.match(/comeback player of the year[^.]*?(?:was|:)\s*([A-Z][a-z]+ [A-Z][a-z]+)/i)
    || text.match(/([A-Z][a-z]+ [A-Z][a-z]+)[^.]*?comeback player of the year/i)
    || text.match(/Comeback Player[^.]*?Award[^.]*?([A-Z][a-z]+ [A-Z][a-z]+)/i)
    || text.match(/([A-Z][a-z]+ [A-Z][a-z]+)[^.]*?Comeback Player[^.]*?Award/i);

  if (match) {
    value = match[1];
    derivation = `Found in page: ${page.pageName}`;
    break;
  }
}

return df.answer({
  status: value !== "unknown" ? "answered" : "unsupported",
  value: value !== "unknown" ? value : "unknown",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation,
});
