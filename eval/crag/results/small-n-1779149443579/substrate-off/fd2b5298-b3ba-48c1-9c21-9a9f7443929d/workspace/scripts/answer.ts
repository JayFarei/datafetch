const pages = await df.db.cragWeb.search("Lloyd A. Simandl born birth date", { limit: 5 });

let answer = "unsupported";
let status: "answered" | "unsupported" = "unsupported";

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for birth date patterns near "Simandl"
  const birthMatch = text.match(/born[^<\n]*?(\w+ \d{1,2},?\s*\d{4})/i) ||
                     text.match(/(\w+ \d{1,2},?\s*\d{4})[^<\n]*?born/i) ||
                     text.match(/birth[^<\n]*?(\w+ \d{1,2},?\s*\d{4})/i);
  if (birthMatch) {
    answer = birthMatch[1].trim();
    status = "answered";
    break;
  }
}

return df.answer({
  status,
  value: status === "answered" ? answer : "I don't know",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Searched cached pages for Lloyd A. Simandl birth date and extracted date near 'born' keyword.",
});
