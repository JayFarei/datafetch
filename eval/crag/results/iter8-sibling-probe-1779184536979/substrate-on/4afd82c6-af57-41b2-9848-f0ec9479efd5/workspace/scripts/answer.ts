(async () => {
  const hits = await Promise.all([
    df.db.cragWeb.search("The Lodger original title", { limit: 3 }),
    df.db.cragWeb.search("The Lodger movie original name", { limit: 3 }),
    df.db.cragWeb.search("Lodger film working title", { limit: 3 }),
  ]);

  const pages = hits.flat();

  // Look for original title info in page snippets/results
  for (const page of pages) {
    const text = page.pageSnippet + " " + page.pageResult;
    const match = text.match(/originally\s+(?:titled|called|known as)\s+["']?([^"'<\n,]+)/i)
      || text.match(/original(?:\s+working)?\s+title(?:\s+was)?\s+["']?([^"'<\n,]+)/i)
      || text.match(/working title[:\s]+["']?([^"'<\n,]+)/i);
    if (match) {
      return df.answer({
        status: "answered",
        value: match[1].trim(),
        evidence: [{ pageUrl: page.pageUrl, pageName: page.pageName }],
        derivation: "Extracted original/working title from page text.",
      });
    }
  }

  return df.answer({
    status: "unsupported",
    value: "invalid question",
    evidence: [],
    derivation: "No original title found in cached pages.",
  });
})();
