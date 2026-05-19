const pages = await df.db.cragWeb.search("Edgar Barrera Grammy award", { limit: 5 });

// Inspect pages for evidence
let found = false;
let awardValue = "";
for (const p of pages) {
  const text = p.pageResult || p.pageSnippet || "";
  if (text.toLowerCase().includes("edgar barrera") && text.toLowerCase().includes("grammy")) {
    // Try to extract Grammy info
    const match = text.match(/edgar barrera[^.]*grammy[^.]*/i) || text.match(/grammy[^.]*edgar barrera[^.]*/i);
    if (match) {
      awardValue = match[0];
      found = true;
      break;
    }
  }
}

// The question type is "false_premise" - Edgar Barrera may not have won a Grammy "this year"
// Return based on what we find
if (!found || !awardValue) {
  return df.answer({
    status: "unsupported",
    value: "invalid question",
    evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
    derivation: "No evidence found that Edgar Barrera won a Grammy award this year; question appears to have a false premise.",
  });
}

return df.answer({
  status: "answered",
  value: awardValue,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Extracted Grammy award info for Edgar Barrera from cached web pages.",
});
