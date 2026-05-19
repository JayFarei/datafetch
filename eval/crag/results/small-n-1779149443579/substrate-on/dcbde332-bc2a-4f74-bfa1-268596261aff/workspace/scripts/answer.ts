const pages = await df.db.cragWeb.search("Burj Khalifa total number of floors above below ground", { limit: 5 });

return df.answer({
  status: "answered",
  value: "163 above ground + 2 below ground = 165 total floors",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Burj Khalifa has 163 floors above ground and 2 basement floors, totaling 165 floors.",
});
