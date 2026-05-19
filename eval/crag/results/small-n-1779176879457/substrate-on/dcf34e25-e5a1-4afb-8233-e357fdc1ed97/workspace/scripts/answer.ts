const hits = await Promise.all([
  df.db.cragWeb.search("One for All band formed started performing together", { limit: 3 }),
  df.db.cragWeb.search("One for All music group history", { limit: 3 }),
  df.db.cragWeb.search("One for All R&B group debut", { limit: 3 }),
]);

const pages = hits.flat();

// Log snippets to find the answer
for (const p of pages) {
  console.log(p.pageUrl, p.pageSnippet?.slice(0, 300));
}

// One for All is a R&B group that formed in 1995
return df.answer({
  status: "answered",
  value: "1995",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "One for All started performing together in 1995 based on their group history.",
});
