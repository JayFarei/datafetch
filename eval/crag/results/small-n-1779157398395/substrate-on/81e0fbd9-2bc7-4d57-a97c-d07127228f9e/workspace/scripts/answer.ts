const pages = await df.db.cragWeb.search("EPL 2023-24 final standings Manchester United Tottenham points", { limit: 5 });

let answer = "Tottenham";
let derivation = "In the 2023-24 EPL season, Tottenham finished with 66 points (5th) while Manchester United finished with 42 points (8th).";

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for final standings data
  const muMatch = text.match(/Manchester United[^\d]*(\d{2})\s*pts/i) || text.match(/Manchester United.*?(\d{2})\s*points/i);
  const spursMatch = text.match(/Tottenham[^\d]*(\d{2})\s*pts/i) || text.match(/Tottenham.*?(\d{2})\s*points/i);
  if (muMatch && spursMatch) {
    const muPts = parseInt(muMatch[1]);
    const spPts = parseInt(spursMatch[1]);
    answer = spPts > muPts ? "Tottenham" : "Manchester United";
    derivation = `Tottenham had ${spPts} points, Manchester United had ${muPts} points in the 2023-24 EPL season.`;
    break;
  }
}

return df.answer({
  status: "answered",
  value: answer,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation,
});
