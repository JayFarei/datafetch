const pages = await df.db.cragWeb.search("katherine ryan in trouble director", { limit: 5 });

let director = "";
for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  const m = text.match(/[Dd]irected by[:\s]+([A-Z][a-z]+(?: [A-Z][a-z]+)+)/);
  if (m) { director = m[1]; break; }
  const m2 = text.match(/[Dd]irector[:\s]+([A-Z][a-z]+(?: [A-Z][a-z]+)+)/);
  if (m2) { director = m2[1]; break; }
}

if (!director) {
  return df.answer({
    status: "unsupported",
    value: "invalid question",
    evidence: [],
    derivation: "No director found in cached pages for Katherine Ryan: In Trouble",
  });
}

return df.answer({
  status: "answered",
  value: director,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: `Extracted director name from page text: ${director}`,
});
