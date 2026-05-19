const pages = await df.db.cragWeb.search("Kasper Holten date of birth", { limit: 5 });

let dob = "";
let evidencePages = pages.slice(0, 2);

for (const p of pages) {
  const text = p.pageResult || p.pageSnippet || "";
  // look for birth date patterns
  const m = text.match(/born[^\d]*(\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/i);
  if (m) {
    dob = m[1];
    evidencePages = [p];
    break;
  }
}

if (!dob) {
  // try snippet
  for (const p of pages) {
    const text = p.pageSnippet || "";
    const m = text.match(/born[^\d]*(\d{1,2}\s+\w+\s+\d{4}|\w+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/i);
    if (m) {
      dob = m[1];
      evidencePages = [p];
      break;
    }
  }
}

return df.answer({
  status: dob ? "answered" : "unsupported",
  value: dob || "invalid question",
  evidence: evidencePages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: dob
    ? `Extracted birth date from page text matching 'born' pattern.`
    : "No birth date found in cached pages; question premise may be invalid (Kasper Holten is an opera director, not a moviemaker).",
});
