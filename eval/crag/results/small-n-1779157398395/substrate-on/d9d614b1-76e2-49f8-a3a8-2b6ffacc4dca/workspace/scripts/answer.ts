const pages = await df.db.cragWeb.search("edgar barrera grammy award", { limit: 5 });

// The question type is false_premise - Edgar Barrera may not have won a Grammy
// Search through pages for evidence
let found = false;
let awardName = "";

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  if (text.toLowerCase().includes("grammy") && text.toLowerCase().includes("edgar barrera")) {
    // Look for Grammy win context
    const lines = text.split("\n").filter((l: string) => l.toLowerCase().includes("grammy") || l.toLowerCase().includes("edgar barrera"));
    for (const line of lines) {
      if (line.toLowerCase().includes("win") || line.toLowerCase().includes("won") || line.toLowerCase().includes("award")) {
        found = true;
        awardName = line.trim().substring(0, 200);
        break;
      }
    }
  }
  if (found) break;
}

if (!found) {
  return df.answer({
    status: "unsupported",
    value: "invalid question",
    evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
    derivation: "No evidence found that Edgar Barrera won a Grammy award; question premise appears false.",
  });
}

return df.answer({
  status: "answered",
  value: awardName,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Found Grammy award mention for Edgar Barrera in cached pages.",
});
