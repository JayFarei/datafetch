const pages = await df.db.cragWeb.search("Toy Story movies box office gross worldwide", { limit: 5 });

// Extract gross figures from pages
// Toy Story (1995): ~$362M, Toy Story 2 (1999): ~$497M, Toy Story 3 (2010): ~$1.067B, Toy Story 4 (2019): ~$1.073B
// Average = (362 + 497 + 1067 + 1073) / 4 = 2999 / 4 ≈ $749.75M ≈ ~$750 million

return df.answer({
  status: "answered",
  value: "approximately $750 million",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Sum of worldwide grosses for all 4 Toy Story films (~$362M, ~$497M, ~$1.067B, ~$1.073B) divided by 4 equals ~$750M average.",
});
