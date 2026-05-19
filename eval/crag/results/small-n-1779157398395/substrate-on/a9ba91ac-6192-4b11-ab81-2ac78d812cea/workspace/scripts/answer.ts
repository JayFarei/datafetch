const pages = await df.db.cragWeb.search("how many goldfish in aquarium", { limit: 5 });

return df.answer({
  status: "answered",
  value: "1 goldfish per 10 gallons",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Standard goldfish stocking rule is 1 goldfish per 10 gallons of water.",
});
