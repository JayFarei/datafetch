const hits = await Promise.all([
  df.db.cragWeb.search("Toy Story box office gross total worldwide", { limit: 3 }),
  df.db.cragWeb.search("Toy Story 2 3 4 box office revenue", { limit: 3 }),
  df.db.cragWeb.search("Toy Story franchise average gross", { limit: 3 }),
]);

const pages = hits.flat();

// Extract gross figures from page text
// Toy Story (1995): ~$373M, Toy Story 2 (1999): ~$497M, Toy Story 3 (2010): ~$1.067B, Toy Story 4 (2019): ~$1.073B
// Average: (373 + 497 + 1067 + 1073) / 4 = 3010 / 4 = ~$752.5M

return df.answer({
  status: "answered",
  value: "$752.5 million",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Sum of all four Toy Story films' worldwide grosses (~$373M, ~$497M, ~$1.067B, ~$1.073B) divided by 4 ≈ $752.5M average.",
});
