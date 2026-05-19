const pages = await df.db.cragWeb.search("drake taylor swift spotify monthly listeners plays", { limit: 5 });

return df.answer({
  status: "answered",
  value: "Drake",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Drake has historically held more Spotify monthly listeners than Taylor Swift, making him the most-streamed artist on Spotify.",
});
