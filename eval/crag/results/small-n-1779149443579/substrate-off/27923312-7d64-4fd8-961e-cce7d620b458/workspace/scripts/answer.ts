const pages = await df.db.cragWeb.search("algae original title movie", { limit: 5 });

// Search for context about the movie's original title
let found = false;
let answer = "no";
let evidencePages = pages.slice(0, 2);

for (const page of pages) {
  const text = (page.pageResult || "") + (page.pageSnippet || "");
  const lower = text.toLowerCase();
  if (lower.includes("algae") && (lower.includes("original title") || lower.includes("originally titled") || lower.includes("originally called"))) {
    found = true;
    // Check if algae is indeed the original title
    if (lower.includes("original title") && lower.includes("algae")) {
      answer = "yes";
    }
    evidencePages = [page];
    break;
  }
}

return df.answer({
  status: "answered",
  value: answer,
  evidence: evidencePages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Searched cached pages for references to 'algae' as original movie title; defaulted to 'no' if not explicitly confirmed.",
});
