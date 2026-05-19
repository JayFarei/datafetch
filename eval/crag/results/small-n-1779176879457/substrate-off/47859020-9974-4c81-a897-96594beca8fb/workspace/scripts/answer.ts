const hits = await Promise.all([
  df.db.cragWeb.search("family movies 1994", { limit: 3 }),
  df.db.cragWeb.search("1994 family genre films list", { limit: 3 }),
  df.db.cragWeb.search("family film 1994 count total", { limit: 3 }),
]);

const pages = hits.flat();

// Search through page content for count information
let answer = "unsupported";
let value = "invalid question";

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for patterns indicating count of family movies in 1994
  const countMatch = text.match(/(\d+)\s+family\s+(?:movies|films)/i) ||
    text.match(/family\s+(?:movies|films)[^\d]*(\d+)/i);
  if (countMatch) {
    answer = "answered";
    value = countMatch[1];
    break;
  }
}

return df.answer({
  status: answer === "answered" ? "answered" : "unsupported",
  value: value,
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Searched cached pages for count of family movies released in 1994",
});
