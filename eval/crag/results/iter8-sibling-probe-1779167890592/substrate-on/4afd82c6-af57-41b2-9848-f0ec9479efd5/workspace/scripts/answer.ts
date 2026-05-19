const hits = await Promise.all([
  df.db.cragWeb.search("The Lodger original title film", { limit: 3 }),
  df.db.cragWeb.search("The Lodger movie originally called", { limit: 3 }),
  df.db.cragWeb.search("Lodger Hitchcock original title", { limit: 3 }),
]);

const pages = hits.flat();

// Search through page results for original title info
let originalTitle = "";
let evidencePages = pages.slice(0, 3);

for (const p of pages) {
  const text = p.pageResult || p.pageSnippet || "";
  // Look for patterns like "originally titled", "working title", etc.
  const m = text.match(/originally\s+(?:titled|called|known as)\s+["']?([^"'\n,\.]+)/i)
    || text.match(/working title[:\s]+["']?([^"'\n,\.]+)/i)
    || text.match(/original title[:\s]+["']?([^"'\n,\.]+)/i);
  if (m) {
    originalTitle = m[1].trim();
    evidencePages = [p];
    break;
  }
}

if (!originalTitle) {
  // Try to find any mention of "The Lodger" original name
  for (const p of pages) {
    const text = p.pageResult || p.pageSnippet || "";
    if (text.toLowerCase().includes("lodger")) {
      const m = text.match(/(?:The Lodger|lodger)[^.]*originally[^.]*["']([^"']+)["']/i)
        || text.match(/["']([^"']+)["'][^.]*original(?:ly)?[^.]*(?:The )?[Ll]odger/i);
      if (m) {
        originalTitle = m[1].trim();
        evidencePages = [p];
        break;
      }
    }
  }
}

return df.answer({
  status: originalTitle ? "answered" : "unsupported",
  value: originalTitle || "invalid question",
  evidence: evidencePages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: originalTitle
    ? `Found original title from page text: "${originalTitle}"`
    : "Could not find original title for The Lodger in retrieved pages",
});
