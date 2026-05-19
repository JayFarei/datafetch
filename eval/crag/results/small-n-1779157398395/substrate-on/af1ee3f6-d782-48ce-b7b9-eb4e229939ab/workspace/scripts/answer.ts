const pages = await df.db.cragWeb.search("2020 Oscars Best Actor winner", { limit: 5 });

return df.answer({
  status: "answered",
  value: "Joaquin Phoenix",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Joaquin Phoenix won Best Actor at the 92nd Academy Awards (2020) for his role in Joker.",
});
