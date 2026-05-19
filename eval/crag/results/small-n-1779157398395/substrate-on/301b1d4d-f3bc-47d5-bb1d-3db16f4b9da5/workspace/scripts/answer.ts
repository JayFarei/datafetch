const pages = await df.db.cragWeb.search("Level 16 movie original title name", { limit: 5 });

// Check page content for original title info
let status: "answered" | "unsupported" = "unsupported";
let value = "invalid question";
let derivation = "No evidence found";

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Level 16 is a 2018 Canadian sci-fi film - check if it had a different original name
  if (text.toLowerCase().includes("level 16")) {
    // Look for "originally", "renamed", "formerly", "working title" etc.
    const lowerText = text.toLowerCase();
    if (lowerText.includes("original") || lowerText.includes("renamed") || lowerText.includes("formerly") || lowerText.includes("working title")) {
      status = "answered";
      value = "yes";
      derivation = "Page mentions original naming of Level 16";
      break;
    }
    // If page discusses the movie but no mention of name change
    status = "answered";
    value = "no";
    derivation = "Level 16 appears to be the film's original official name";
    break;
  }
}

return df.answer({
  status,
  value,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation,
});
