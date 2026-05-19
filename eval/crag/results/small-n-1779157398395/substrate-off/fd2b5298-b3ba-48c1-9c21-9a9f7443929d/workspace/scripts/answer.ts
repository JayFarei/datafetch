const pages = await df.db.cragWeb.search("Lloyd A. Simandl born birthday", { limit: 5 });

let birthDate = "";
let usedPages = pages.slice(0, 2);

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  const match = text.match(/born[^<\n]*?(\w+ \d{1,2},?\s*\d{4})/i)
    || text.match(/Lloyd.*?Simandl.*?(\w+ \d{1,2},?\s*\d{4})/i)
    || text.match(/(\w+ \d{1,2},?\s*\d{4}).*?born/i);
  if (match) {
    birthDate = match[1];
    usedPages = [page];
    break;
  }
}

if (!birthDate) {
  return df.answer({
    status: "unsupported",
    value: "invalid question",
    evidence: usedPages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
    derivation: "No birth date for Lloyd A. Simandl found in cached pages.",
  });
}

return df.answer({
  status: "answered",
  value: birthDate,
  evidence: usedPages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Extracted birth date from page mentioning Lloyd A. Simandl.",
});
