const pages = await df.db.cragWeb.search("Crystal Palace final game Premier League date", { limit: 5 });

let value = "invalid question";
let status: "answered" | "unsupported" = "unsupported";

for (const page of pages) {
  const text = page.pageResult ?? page.pageSnippet ?? "";
  // Look for last/final match date for Crystal Palace in Premier League
  const match = text.match(/Crystal Palace[^.]*?(\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/i);
  if (match) {
    value = match[1];
    status = "answered";
    break;
  }
}

return df.answer({
  status,
  value,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Searched cached pages for Crystal Palace final Premier League game date.",
});
