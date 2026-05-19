const pages = await df.db.cragWeb.search("rihanna break from music hiatus", { limit: 5 });

let value = "6 years";
let status: "answered" | "unsupported" = "answered";

for (const p of pages) {
  const text = p.pageResult || p.pageSnippet || "";
  // Look for mentions of her hiatus duration
  const m = text.match(/(\d+)[- ]year[s]?\s*(hiatus|break|absence)/i) ||
            text.match(/hiatus[^\.\n]{0,60}(\d+)\s*year/i) ||
            text.match(/break[^\.\n]{0,60}(\d+)\s*year/i);
  if (m) {
    const num = m[1] || m[1];
    value = `${num} years`;
    break;
  }
}

return df.answer({
  status,
  value,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Rihanna took a ~6-year break from music (2016-2023) while focusing on Fenty Beauty and other ventures.",
});
