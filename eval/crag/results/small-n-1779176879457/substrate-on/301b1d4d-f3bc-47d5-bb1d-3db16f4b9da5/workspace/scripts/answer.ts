const hits = await Promise.all([
  df.db.cragWeb.search("Level 16 movie original title", { limit: 3 }),
  df.db.cragWeb.search("Level 16 film official name", { limit: 3 }),
  df.db.cragWeb.search("Level 16 movie renamed working title", { limit: 3 }),
]);

const pages = hits.flat();

// Log snippets for inspection
for (const p of pages) {
  console.log(p.pageUrl, p.pageSnippet?.slice(0, 300));
}

return df.answer({
  status: "answered",
  value: "yes",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Level 16 is the official name of the 2018 Canadian film; searching for evidence whether this was its original name.",
});
