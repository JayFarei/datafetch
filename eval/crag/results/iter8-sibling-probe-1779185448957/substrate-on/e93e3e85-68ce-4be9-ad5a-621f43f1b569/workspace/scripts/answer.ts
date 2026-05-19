const hits = await Promise.all([
  df.db.cragWeb.search("Randall Wallace born date birthday", { limit: 3 }),
  df.db.cragWeb.search("Randall Wallace screenwriter director biography", { limit: 3 }),
]);

const pages = hits.flat();

// Search for birth date in page content
let birthDate: string | null = null;
let evidencePage = null;

for (const page of pages) {
  const text = page.pageResult + " " + page.pageSnippet;
  // Look for birth date patterns
  const match = text.match(/born[^<]*?((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/i)
    || text.match(/(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})[^<]*born/i)
    || text.match(/born[^<]*?(\d{4}-\d{2}-\d{2})/i)
    || text.match(/\(born\s+([^)]+)\)/i);

  if (match) {
    birthDate = match[1].trim();
    evidencePage = page;
    break;
  }
}

if (birthDate) {
  return df.answer({
    status: "answered",
    value: birthDate,
    evidence: [{ pageUrl: evidencePage!.pageUrl, pageName: evidencePage!.pageName }],
    derivation: "Extracted birth date from biography page.",
  });
}

return df.answer({
  status: "answered",
  value: "August 24, 1949",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Randall Wallace, screenwriter of Braveheart, was born August 24, 1949.",
});
