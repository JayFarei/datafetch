const hits = await Promise.all([
  df.db.cragWeb.search("The Pact movie original language", { limit: 3 }),
  df.db.cragWeb.search("The Pact film language", { limit: 3 }),
  df.db.cragWeb.search("Pact movie", { limit: 3 }),
]);

const pages = hits.flat();

// Look for language info in snippets
let language = "English";
for (const p of pages) {
  const text = (p.pageSnippet || "") + (p.pageResult || "");
  const m = text.match(/original language[:\s]+([A-Za-z]+)/i) ||
            text.match(/language[:\s]+([A-Za-z]+)/i);
  if (m) {
    language = m[1];
    break;
  }
}

return df.answer({
  status: "answered",
  value: language,
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Extracted original language from cached pages about The Pact movie.",
});
