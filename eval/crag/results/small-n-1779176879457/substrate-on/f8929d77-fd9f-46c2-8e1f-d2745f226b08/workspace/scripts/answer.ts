const hits = await Promise.all([
  df.db.cragWeb.search("Bourne franchise movies list", { limit: 3 }),
  df.db.cragWeb.search("Jason Bourne film series all movies", { limit: 3 }),
  df.db.cragWeb.search("Bourne Identity Supremacy Ultimatum Legacy", { limit: 3 }),
]);

const pages = hits.flat();

return df.answer({
  status: "answered",
  value: "The Bourne Identity (2002), The Bourne Supremacy (2004), The Bourne Ultimatum (2007), The Bourne Legacy (2012), Jason Bourne (2016)",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "The Bourne franchise consists of five films: The Bourne Identity, The Bourne Supremacy, The Bourne Ultimatum, The Bourne Legacy, and Jason Bourne.",
});
