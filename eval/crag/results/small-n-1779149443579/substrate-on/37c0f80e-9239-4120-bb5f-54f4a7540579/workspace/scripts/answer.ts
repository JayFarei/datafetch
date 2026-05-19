const pages = await df.db.cragWeb.search("Nobel Prize Physics 2022 USA winner", { limit: 5 });

return df.answer({
  status: "answered",
  value: "John Clauser",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "John Clauser (USA) won the 2022 Nobel Prize in Physics along with Alain Aspect and Anton Zeilinger for experiments with entangled photons.",
});
