const pages = await df.db.cragWeb.search("One For All group start performing together", { limit: 5 });

let value = "unknown";
let status: "answered" | "unsupported" = "unsupported";

for (const page of pages) {
  const text = page.pageResult ?? page.pageSnippet ?? "";
  // Look for formation/start year patterns
  const m = text.match(/(?:formed|started|founded|began performing|together)[^\d]*(\d{4})/i)
    || text.match(/(\d{4})[^\d]*(?:formed|started|founded|began performing)/i);
  if (m) {
    value = m[1];
    status = "answered";
    break;
  }
}

return df.answer({
  status,
  value,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Searched cached pages for 'One For All' formation date and extracted the year.",
});
