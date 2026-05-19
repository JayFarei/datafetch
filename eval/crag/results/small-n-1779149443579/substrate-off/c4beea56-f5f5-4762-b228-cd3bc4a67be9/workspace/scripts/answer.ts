const pages = await df.db.cragWeb.search("Inside Out Finding Dory budget production cost", { limit: 5 });

return df.answer({
  status: "answered",
  value: "Finding Dory",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Finding Dory had a production budget of ~$200M vs Inside Out's ~$175M.",
});
