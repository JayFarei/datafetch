(async () => {
  const hits = await Promise.all([
    df.db.cragWeb.search("The Lodger original title film", { limit: 3 }),
    df.db.cragWeb.search("The Lodger movie original name", { limit: 3 }),
    df.db.cragWeb.search("The Lodger Hitchcock original title", { limit: 3 }),
  ]);

  const pages = hits.flat();

  // Search for original title info in page snippets/results
  let originalTitle = "";
  let evidencePage = null;

  for (const page of pages) {
    const text = page.pageSnippet + " " + page.pageResult;
    // Look for patterns like "originally titled", "original title", "working title"
    const match = text.match(/originally\s+(?:titled?|called?|known\s+as)\s+["""']?([^"""'\.,<\n]+)["""']?/i) ||
                  text.match(/original\s+title[:\s]+["""']?([^"""'\.,<\n]+)["""']?/i) ||
                  text.match(/working\s+title[:\s]+["""']?([^"""'\.,<\n]+)["""']?/i);
    if (match) {
      originalTitle = match[1].trim();
      evidencePage = page;
      break;
    }
  }

  if (originalTitle && evidencePage) {
    return df.answer({
      status: "answered",
      value: originalTitle,
      evidence: [{ pageUrl: evidencePage.pageUrl, pageName: evidencePage.pageName }],
      derivation: "Found original title in page content mentioning the original name for The Lodger.",
    });
  }

  return df.answer({
    status: "unsupported",
    value: "invalid question",
    evidence: [],
    derivation: "Could not find supporting evidence for the original title of The Lodger.",
  });
})();
