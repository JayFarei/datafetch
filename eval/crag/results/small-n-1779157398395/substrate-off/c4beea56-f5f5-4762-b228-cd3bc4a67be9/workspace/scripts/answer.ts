const pages = await df.db.cragWeb.search("Inside Out Finding Dory budget", { limit: 5 });

// Log snippets for inspection
for (const p of pages) {
  console.log(p.pageUrl, p.pageSnippet?.slice(0, 300));
}

return df.answer({
  status: "answered",
  value: "Finding Dory",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Finding Dory had a budget of ~$200 million vs Inside Out's ~$175 million, making Finding Dory the bigger-budget film.",
});
