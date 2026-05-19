const hits = await Promise.all([
  df.db.cragWeb.search("INTA stock price", { limit: 3 }),
  df.db.cragWeb.search("Intapp INTA closing price", { limit: 3 }),
  df.db.cragWeb.search("INTA end of day stock market", { limit: 3 }),
]);

const pages = hits.flat();

// Check if any page has a closing price for INTA
let value = "I don't know";
let status: "answered" | "unsupported" = "unsupported";

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for price patterns near INTA
  const priceMatch = text.match(/INTA[^\d]*\$?([\d]+\.[\d]{2})/i) ||
    text.match(/\$?([\d]+\.[\d]{2})[^\d]*INTA/i) ||
    text.match(/closing[^\d]*\$?([\d]+\.[\d]{2})/i) ||
    text.match(/close[^\d]*\$?([\d]+\.[\d]{2})/i);
  if (priceMatch) {
    value = priceMatch[1];
    status = "answered";
    break;
  }
}

return df.answer({
  status,
  value,
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Searched cached pages for INTA stock closing price; real-time data may not be available in cache.",
});
