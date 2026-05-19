const pages = await df.db.cragWeb.search("Kasper Holten date of birth", { limit: 5 });

let value = "invalid question";
let status: "answered" | "unsupported" = "unsupported";
let derivation = "Kasper Holten is an opera director, not a moviemaker; premise may be false, but searching for DOB anyway.";

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for birth date patterns
  const match = text.match(/born[^0-9]*(\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/i)
    || text.match(/(\d{1,2}\s+\w+\s+1970|\w+\s+\d{1,2},?\s+1970|\d{4}-\d{2}-\d{2})/i)
    || text.match(/Date of birth[^0-9]*([^\n<]+)/i);
  if (match) {
    value = match[1].trim();
    status = "answered";
    derivation = `Found birth date in page: ${page.pageName}`;
    break;
  }
  // Also look for Kasper Holten with year
  const bornMatch = text.match(/Kasper Holten[^.]*born[^.]*?(\d{1,2}[^\d]+\w+[^\d]+\d{4})/i);
  if (bornMatch) {
    value = bornMatch[1].trim();
    status = "answered";
    derivation = `Found birth date near name in page: ${page.pageName}`;
    break;
  }
}

return df.answer({
  status,
  value,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation,
});
