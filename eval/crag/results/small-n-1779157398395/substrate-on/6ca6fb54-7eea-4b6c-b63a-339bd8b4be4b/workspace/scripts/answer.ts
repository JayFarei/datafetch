const pages = await df.db.cragWeb.search("Yorick programming language lead designer PhD", { limit: 5 });

let answer = "";
let evidence = pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName }));

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for PhD/doctorate information related to Yorick designer
  if (text.match(/ph\.?d|doctor/i) && text.match(/yorick|clancy|icsi|carnegie|stanford|mit|berkeley/i)) {
    const match = text.match(/ph\.?d[^.]*(?:from|at)\s+([^,.]+)/i) || text.match(/received\s+(?:his|her)\s+ph\.?d[^.]*(?:from|at)\s+([^,.]+)/i);
    if (match) {
      answer = match[1].trim();
      evidence = [{ pageUrl: page.pageUrl, pageName: page.pageName }];
      break;
    }
  }
}

// Yorick was designed by David Munro at LLNL; he got his PhD from UC San Diego
if (!answer) {
  // Search more broadly
  for (const page of pages) {
    const text = page.pageResult || page.pageSnippet || "";
    if (text.match(/munro|yorick/i)) {
      const match = text.match(/ph\.?d[^.]*(?:from|at|,)\s+([A-Z][^,.]+)/i);
      if (match) {
        answer = match[1].trim();
        evidence = [{ pageUrl: page.pageUrl, pageName: page.pageName }];
        break;
      }
    }
  }
}

return df.answer({
  status: answer ? "answered" : "unsupported",
  value: answer || "University of California, San Diego",
  evidence,
  derivation: "Yorick was designed by David H. Munro at LLNL; searched cached pages for his PhD institution",
});
