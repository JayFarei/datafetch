const hits = await Promise.all([
  df.db.cragWeb.search("Katherine Ryan In Trouble director", { limit: 3 }),
  df.db.cragWeb.search("Katherine Ryan In Trouble Netflix documentary", { limit: 3 }),
]);

const pages = hits.flat();

// Search through page content for director info
let director = "";
for (const p of pages) {
  const text = p.pageResult || p.pageSnippet || "";
  const m = text.match(/[Dd]irected by ([A-Z][a-z]+ [A-Z][a-z]+)/);
  if (m) { director = m[1]; break; }
  const m2 = text.match(/[Dd]irector[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)/);
  if (m2) { director = m2[1]; break; }
}

return df.answer({
  status: director ? "answered" : "unsupported",
  value: director || "invalid question",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Searched cached pages for director of Katherine Ryan: In Trouble and extracted name.",
});
