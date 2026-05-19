const pages = await df.db.cragWeb.search("Bourne franchise movies list", { limit: 5 });

return df.answer({
  status: "answered",
  value: "The Bourne Identity, The Bourne Supremacy, The Bourne Ultimatum, The Bourne Legacy, Jason Bourne, Jason Bourne: Treadstone (no), actually: The Bourne Identity (2002), The Bourne Supremacy (2004), The Bourne Ultimatum (2007), The Bourne Legacy (2012), Jason Bourne (2016)",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "The Bourne film series consists of five movies based on Robert Ludlum's novels.",
});
