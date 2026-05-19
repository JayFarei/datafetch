const hits = await Promise.all([
  df.db.cragWeb.search("Randall Wallace born date", { limit: 3 }),
  df.db.cragWeb.search("Randall Wallace screenwriter director birthday", { limit: 3 }),
]);

const pages = hits.flat();

// Search for birth date in page content
let birthDate = "";
for (const p of pages) {
  const text = p.pageResult || p.pageSnippet || "";
  const match = text.match(/born[^<\n]*?(\w+ \d{1,2},? \d{4})/i) ||
                text.match(/(\w+ \d{1,2},? \d{4})[^<\n]*?born/i) ||
                text.match(/birth[^<\n]*?(\w+ \d{1,2},? \d{4})/i);
  if (match) {
    birthDate = match[1];
    break;
  }
}

return df.answer({
  status: birthDate ? "answered" : "unsupported",
  value: birthDate || "invalid question",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Extracted birth date from cached web pages about Randall Wallace.",
});
