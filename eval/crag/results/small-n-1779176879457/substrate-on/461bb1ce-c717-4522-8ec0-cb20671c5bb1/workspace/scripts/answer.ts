const hits = await Promise.all([
  df.db.cragWeb.search("rihanna music break hiatus years", { limit: 3 }),
  df.db.cragWeb.search("rihanna album comeback 2016 2022", { limit: 3 }),
  df.db.cragWeb.search("rihanna how long no music release", { limit: 3 }),
]);

const pages = hits.flat();

// Rihanna's last album was Anti in 2016; she returned to music with a Super Bowl
// halftime performance in 2023 and new music, making it roughly 6 years.
return df.answer({
  status: "answered",
  value: "6 years",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Rihanna released Anti in January 2016 and did not release new music until 2022-2023, a gap of approximately 6 years.",
});
