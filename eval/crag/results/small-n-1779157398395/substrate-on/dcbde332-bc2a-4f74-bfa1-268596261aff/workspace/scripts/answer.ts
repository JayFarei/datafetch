const pages = await df.db.cragWeb.search("Burj Khalifa total floors above below ground", { limit: 5 });

return df.answer({
  status: "answered",
  value: "163 floors above ground and 2 basement floors, 165 total",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Burj Khalifa has 163 floors above ground plus 2 basement levels, totaling 165 floors.",
});
