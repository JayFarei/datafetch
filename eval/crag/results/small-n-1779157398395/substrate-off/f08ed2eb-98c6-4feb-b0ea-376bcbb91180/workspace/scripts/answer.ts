const pages = await df.db.cragWeb.search("INTA stock price end of day", { limit: 5 });

// Check if any page has pricing info for INTA
let value = "I don't know";
let status: "answered" | "unsupported" = "unsupported";
const evidence = pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName }));

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for price patterns near INTA
  const match = text.match(/INTA[^$\d]*\$?([\d]+\.[\d]+)/i) || text.match(/\$?([\d]+\.[\d]+)[^$\d]*INTA/i);
  if (match) {
    value = match[1];
    status = "answered";
    break;
  }
}

return df.answer({
  status,
  value,
  evidence,
  derivation: "Searched cached pages for INTA stock closing price; real-time data may not be available in cache.",
});
