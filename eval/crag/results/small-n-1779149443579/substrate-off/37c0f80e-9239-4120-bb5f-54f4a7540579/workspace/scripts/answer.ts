const pages = await df.db.cragWeb.search("Nobel Prize Physics 2022 USA winner", { limit: 5 });

return df.answer({
  status: "answered",
  value: "John F. Clauser",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "The 2022 Nobel Prize in Physics was awarded to Alain Aspect, John F. Clauser, and Anton Zeilinger; Clauser is from the USA.",
});
