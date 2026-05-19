(async () => {
  const hits = await Promise.all([
    df.db.cragWeb.search("Randall Wallace born date", { limit: 3 }),
    df.db.cragWeb.search("Randall Wallace filmmaker biography", { limit: 3 }),
  ]);

  const pages = hits.flat();

  // Look for birth date in snippets/content
  for (const page of pages) {
    const text = page.pageSnippet + " " + page.pageResult;
    const match = text.match(/born[^\d]*(\w+ \d{1,2},?\s*\d{4})/i)
      || text.match(/(\w+ \d{1,2},?\s*\d{4})[^)]*born/i)
      || text.match(/born[^)]*\(([^)]+)\)/i)
      || text.match(/\(born ([^)]+)\)/i);
    if (match) {
      return df.answer({
        status: "answered",
        value: match[1].trim(),
        evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
        derivation: "Extracted birth date from cached web page about Randall Wallace.",
      });
    }
  }

  return df.answer({
    status: "unsupported",
    value: "I don't know",
    evidence: [],
    derivation: "No birth date found in cached pages.",
  });
})();
