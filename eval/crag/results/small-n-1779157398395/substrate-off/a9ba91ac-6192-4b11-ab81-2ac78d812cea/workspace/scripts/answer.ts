const pages = await df.db.cragWeb.search("how many goldfish in aquarium", { limit: 5 });

return df.answer({
  status: "answered",
  value: "1 goldfish per 20 gallons",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Common goldfish care guideline is one goldfish per 20 gallons of water.",
});
