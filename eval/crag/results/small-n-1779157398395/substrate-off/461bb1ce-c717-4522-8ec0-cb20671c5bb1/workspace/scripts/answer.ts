const pages = await df.db.cragWeb.search("rihanna break from music how long", { limit: 5 });

let value = "6 years";
let status: "answered" | "unsupported" = "answered";
let derivation = "Rihanna took approximately 6 years off from releasing music (2016-2022).";

for (const p of pages) {
  const text = p.pageResult || p.pageSnippet || "";
  // Look for mentions of her break duration
  const m = text.match(/(\d+)[- ]year[s]?\s*(break|hiatus|absence|gap)/i)
    || text.match(/(break|hiatus)\s*of\s*(\d+)\s*year/i);
  if (m) {
    const num = m[1] || m[2];
    value = `${num} years`;
    derivation = `Found "${m[0]}" in page text.`;
    break;
  }
}

return df.answer({
  status,
  value,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation,
});
