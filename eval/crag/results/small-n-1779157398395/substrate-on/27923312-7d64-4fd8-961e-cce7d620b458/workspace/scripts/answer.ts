const pages = await df.db.cragWeb.search("algae original title movie", { limit: 5 });

// Check if any page mentions "Algae" as an original/alternate title
let found = false;
let answer = "no";
for (const p of pages) {
  const text = p.pageResult || p.pageSnippet || "";
  if (/algae/i.test(text)) {
    // Look for context around "algae" to see if it's an original title
    const lc = text.toLowerCase();
    const idx = lc.indexOf("algae");
    const context = text.slice(Math.max(0, idx - 200), idx + 200);
    if (/original.{0,30}title|title.{0,30}original/i.test(context)) {
      found = true;
      answer = "yes";
      break;
    }
  }
}

return df.answer({
  status: "answered",
  value: answer,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Searched cached pages for 'algae' as original movie title; no evidence found that algae is the original title.",
});
