const hits = await Promise.all([
  df.db.cragWeb.search("Nobel Prize Physics 2022 winner USA", { limit: 3 }),
  df.db.cragWeb.search("John Clauser Nobel Prize 2022", { limit: 3 }),
  df.db.cragWeb.search("2022 Nobel Physics Clauser Aspect Zeilinger", { limit: 3 }),
]);

const pages = hits.flat();

return df.answer({
  status: "answered",
  value: "John F. Clauser",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "The 2022 Nobel Prize in Physics was awarded jointly to Alain Aspect (France), John F. Clauser (USA), and Anton Zeilinger (Austria); Clauser is from the USA.",
});
