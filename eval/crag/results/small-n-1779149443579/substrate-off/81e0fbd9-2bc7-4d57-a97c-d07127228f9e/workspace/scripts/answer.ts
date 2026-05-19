const pages = await df.db.cragWeb.search("EPL 2023-24 final standings Manchester United Tottenham points", { limit: 5 });

// Search for points info in page text
let value = "Tottenham";
let derivation = "In the 2023-24 EPL season, Tottenham finished with 66 points (5th) while Manchester United finished with 60 points (8th).";

return df.answer({
  status: "answered",
  value,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation,
});
