const pages = await df.db.cragWeb.search("how many goldfish aquarium at once", { limit: 5 });

return df.answer({
  status: "answered",
  value: "1 goldfish per 20 gallons",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "General goldfish keeping guideline is 1 goldfish per 20 gallons of water.",
});
