const pages = await df.db.cragWeb.search("Yorick programming language lead designer PhD", { limit: 5 });

// Search for info about the lead designer
let answer = "";
let evidencePages = pages.slice(0, 2);

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for PhD or doctorate information
  if (text.toLowerCase().includes("yorick") && (text.toLowerCase().includes("phd") || text.toLowerCase().includes("ph.d") || text.toLowerCase().includes("doctorate"))) {
    // Try to extract the institution
    const match = text.match(/(?:ph\.?d\.?|doctorate)[^.]*?(?:from|at)\s+([A-Z][^.,\n]+)/i) ||
                  text.match(/received[^.]*?(?:ph\.?d\.?|doctorate)[^.]*?(?:from|at)\s+([A-Z][^.,\n]+)/i);
    if (match) {
      answer = match[1].trim();
      evidencePages = [page];
      break;
    }
  }
}

if (!answer) {
  // Search more specifically for David Munro or the designer
  const pages2 = await df.db.cragWeb.search("Yorick programming language David Munro designer", { limit: 5 });
  for (const page of pages2) {
    const text = page.pageResult || page.pageSnippet || "";
    if (text.toLowerCase().includes("phd") || text.toLowerCase().includes("ph.d") || text.toLowerCase().includes("doctorate")) {
      const match = text.match(/(?:ph\.?d\.?|doctorate)[^.]*?(?:from|at)\s+([A-Z][^.,\n]+)/i) ||
                    text.match(/received[^.]*?(?:ph\.?d\.?|doctorate)[^.]*?(?:from|at)\s+([A-Z][^.,\n]+)/i);
      if (match) {
        answer = match[1].trim();
        evidencePages = [page];
        break;
      }
    }
  }
}

return df.answer({
  status: answer ? "answered" : "unsupported",
  value: answer || "invalid question",
  evidence: evidencePages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Searched for Yorick programming language lead designer PhD institution from cached pages.",
});
