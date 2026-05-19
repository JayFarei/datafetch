const pages = await df.db.cragWeb.search("Lloyd A. Simandl born birthday", { limit: 5 });

let value = "unknown";
let status: "answered" | "unsupported" = "unsupported";

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  const match = text.match(/born[^<\n]*?(\w+ \d{1,2},\s*\d{4}|\d{1,2}\s+\w+\s+\d{4}|\d{4}-\d{2}-\d{2})/i);
  if (match) {
    value = match[1].trim();
    status = "answered";
    break;
  }
}

return df.answer({
  status,
  value,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Searched cached pages for Lloyd A. Simandl birth date and extracted the date from page text.",
});
