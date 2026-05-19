const hits = await Promise.all([
  df.db.cragWeb.search("Lille game score today", { limit: 3 }),
  df.db.cragWeb.search("Lille OSC match result", { limit: 3 }),
  df.db.cragWeb.search("Lille football score", { limit: 3 }),
]);

const pages = hits.flat();

// Check if any page contains a score for Lille's game
const scorePattern = /lille.{0,60}(\d+\s*[-–]\s*\d+|\d+\s*:\s*\d+)/i;
let foundScore: string | null = null;
let evidencePages = pages.slice(0, 3);

for (const p of pages) {
  const text = p.pageResult ?? p.pageSnippet ?? "";
  const m = text.match(scorePattern);
  if (m) {
    foundScore = m[1];
    evidencePages = [p];
    break;
  }
}

if (foundScore) {
  return df.answer({
    status: "answered",
    value: foundScore,
    evidence: evidencePages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
    derivation: "Extracted Lille match score from cached web page.",
  });
}

return df.answer({
  status: "unsupported",
  value: "invalid question",
  evidence: evidencePages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "No Lille game score found in cached pages; premise may be false or no game today.",
});
