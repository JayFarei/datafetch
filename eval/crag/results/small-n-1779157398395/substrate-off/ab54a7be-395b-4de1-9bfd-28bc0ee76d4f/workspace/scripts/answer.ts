const pages = await df.db.cragWeb.search("Sonia Sotomayor president administration", { limit: 3 });

return df.answer({
  status: "unsupported",
  value: "invalid question",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Sonia Sotomayor is a U.S. Supreme Court Justice, not a president, so this question has a false premise.",
});
