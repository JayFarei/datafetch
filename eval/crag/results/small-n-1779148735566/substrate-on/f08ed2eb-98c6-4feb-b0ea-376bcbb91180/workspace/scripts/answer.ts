const pages = await df.db.cragWeb.search("INTA stock price closing", { limit: 5 });

// Look for price data in pages
let value = "I don't know";
let status: "answered" | "unsupported" = "unsupported";
const evidence: { pageUrl: string; pageName: string }[] = [];

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for price patterns near INTA
  const priceMatch = text.match(/INTA[^$\d]*\$?([\d]+\.[\d]{2})/i) ||
    text.match(/\$?([\d]+\.[\d]{2})[^\d]*INTA/i);
  if (priceMatch) {
    value = priceMatch[1];
    status = "answered";
    evidence.push({ pageUrl: page.pageUrl, pageName: page.pageName });
    break;
  }
}

if (evidence.length === 0 && pages.length > 0) {
  evidence.push({ pageUrl: pages[0].pageUrl, pageName: pages[0].pageName });
}

return df.answer({
  status,
  value,
  evidence,
  derivation: "Searched cached CRAG pages for INTA closing price; real-time data not available in cache.",
});
