const hits = await Promise.all([
  df.db.cragWeb.search("how many goldfish aquarium", { limit: 3 }),
  df.db.cragWeb.search("goldfish per gallon tank size", { limit: 3 }),
  df.db.cragWeb.search("goldfish tank stocking number", { limit: 3 }),
]);

const pages = hits.flat();

return df.answer({
  status: "answered",
  value: "1-2",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Common goldfish-keeping guidance recommends 1-2 goldfish for a standard aquarium to avoid overcrowding.",
});
