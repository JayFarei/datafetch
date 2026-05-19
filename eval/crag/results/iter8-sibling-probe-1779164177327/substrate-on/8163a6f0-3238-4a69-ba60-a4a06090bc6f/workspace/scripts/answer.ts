const pages = await df.db.cragWeb.search("2004 Oscar Best Animated Feature Film winner", { limit: 5 });

return df.answer({
  status: "answered",
  value: "Finding Nemo",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "The 76th Academy Awards ceremony held in 2004 awarded Best Animated Feature to Finding Nemo.",
});
