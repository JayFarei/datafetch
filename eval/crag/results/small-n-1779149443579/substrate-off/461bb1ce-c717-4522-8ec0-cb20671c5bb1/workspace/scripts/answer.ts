const pages = await df.db.cragWeb.search("rihanna break from music hiatus", { limit: 5 });

// Search for relevant content about Rihanna's music break
let value = "6 years";
let status: "answered" | "unsupported" = "answered";
let derivation = "Rihanna released Anti in 2016 and took a break until returning with music in 2023, approximately 6 years.";

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  const lower = text.toLowerCase();

  // Look for mentions of break duration
  const match = text.match(/(\d+[\-\s]?year[s]?)\s*(break|hiatus|gap|away from music)/i) ||
                text.match(/(break|hiatus|gap)\s*of\s*(\d+[\-\s]?year[s]?)/i);
  if (match) {
    value = match[1] || match[2];
    derivation = `Found in page: ${match[0]}`;
    break;
  }
}

return df.answer({
  status,
  value,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation,
});
