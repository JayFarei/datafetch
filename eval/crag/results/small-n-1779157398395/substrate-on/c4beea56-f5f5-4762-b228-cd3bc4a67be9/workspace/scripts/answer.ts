const pages = await df.db.cragWeb.search("Inside Out Finding Dory budget comparison", { limit: 5 });

return df.answer({
  status: "answered",
  value: "Finding Dory",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Finding Dory had a budget of ~$200 million vs Inside Out's ~$175 million.",
});
