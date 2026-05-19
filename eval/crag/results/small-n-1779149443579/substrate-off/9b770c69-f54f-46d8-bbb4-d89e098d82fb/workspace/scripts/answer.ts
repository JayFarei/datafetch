const pages = await df.db.cragWeb.search("Katherine Ryan In Trouble director", { limit: 5 });

let director = "";
for (const p of pages) {
  const text = p.pageResult || p.pageSnippet || "";
  const m = text.match(/[Dd]irected by[:\s]+([A-Z][a-zA-Z\s\-]+?)[\n<,]/);
  if (m) { director = m[1].trim(); break; }
  const m2 = text.match(/[Dd]irector[:\s]+([A-Z][a-zA-Z\s\-]+?)[\n<,]/);
  if (m2) { director = m2[1].trim(); break; }
}

if (!director) {
  return df.answer({
    status: "unsupported",
    value: "invalid question",
    evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
    derivation: "Could not find director information in cached pages",
  });
}

return df.answer({
  status: "answered",
  value: director,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Extracted director name from page text mentioning 'directed by' or 'director'",
});
