const pages = await df.db.cragWeb.search("INTA stock price end of day", { limit: 5 });

let value = "I don't know";
let status: "answered" | "unsupported" = "unsupported";
let derivation = "No relevant price data found in cached pages.";

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for price patterns near "INTA"
  const match = text.match(/INTA[^\n]*?\$?([\d]+\.[\d]+)/i) ||
    text.match(/\$?([\d]+\.[\d]+)[^\n]*INTA/i);
  if (match) {
    value = match[1];
    status = "answered";
    derivation = `Extracted INTA closing price from ${page.pageName}.`;
    break;
  }
}

return df.answer({
  status,
  value,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation,
});
