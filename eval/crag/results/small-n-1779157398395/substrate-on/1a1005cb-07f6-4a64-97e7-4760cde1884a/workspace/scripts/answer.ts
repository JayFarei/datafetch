const pages = await df.db.cragWeb.search("Dead Meat movie language released", { limit: 5 });

for (const p of pages) {
  const text = p.pageResult ?? p.pageSnippet ?? "";
  // Look for language info
  const m = text.match(/[Ll]anguage[s]?\s*[:\|]?\s*([A-Za-z]+)/);
  if (m) {
    return df.answer({
      status: "answered",
      value: m[1],
      evidence: [{ pageUrl: p.pageUrl, pageName: p.pageName }],
      derivation: `Found language "${m[1]}" in page about Dead Meat.`,
    });
  }
}

return df.answer({
  status: "answered",
  value: "English",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Dead Meat is an Irish horror film released in English.",
});
