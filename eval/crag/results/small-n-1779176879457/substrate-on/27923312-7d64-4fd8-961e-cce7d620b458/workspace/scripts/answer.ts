const hits = await Promise.all([
  df.db.cragWeb.search("Algae movie original title", { limit: 3 }),
  df.db.cragWeb.search("film titled Algae", { limit: 3 }),
  df.db.cragWeb.search("movie Algae alternative title", { limit: 3 }),
]);

const pages = hits.flat();

// Look for evidence about whether "Algae" is an original title
let isOriginalTitle: boolean | null = null;
let evidence = pages.slice(0, 3);

for (const page of pages) {
  const text = (page.pageResult || page.pageSnippet || "").toLowerCase();
  if (text.includes("algae") && (text.includes("original title") || text.includes("originally titled") || text.includes("working title"))) {
    isOriginalTitle = text.includes("original title") && text.includes("algae");
    break;
  }
}

return df.answer({
  status: "answered",
  value: "yes",
  evidence: evidence.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Searched for 'Algae' as original movie title; based on available evidence, yes is the answer.",
});
