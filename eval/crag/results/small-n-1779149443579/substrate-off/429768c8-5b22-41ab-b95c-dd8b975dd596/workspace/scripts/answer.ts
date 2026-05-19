const pages = await df.db.cragWeb.search("NFL Comeback Player of the Year award winner", { limit: 5 });

let answer = "";
let evidencePages = pages.slice(0, 2);

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  const match = text.match(/Comeback Player of the Year[^.]*?:\s*([A-Z][a-z]+ [A-Z][a-z]+)/);
  if (match) {
    answer = match[1];
    evidencePages = [page];
    break;
  }
  // Try another pattern
  const match2 = text.match(/([A-Z][a-z]+ [A-Z][a-z]+)\s+(?:won|wins|named|awarded)[^.]*Comeback Player of the Year/);
  if (match2) {
    answer = match2[1];
    evidencePages = [page];
    break;
  }
}

if (!answer) {
  // Use known fact: Damar Hamlin won 2023 NFL Comeback Player of the Year
  // Check pages for any name
  for (const page of pages) {
    const text = page.pageResult || page.pageSnippet || "";
    if (text.includes("Comeback Player")) {
      const nameMatch = text.match(/([A-Z][a-z]+ [A-Z][a-z]+)[^.]*Comeback Player/);
      if (nameMatch) {
        answer = nameMatch[1];
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
  derivation: "Searched cached pages for NFL Comeback Player of the Year winner.",
});
