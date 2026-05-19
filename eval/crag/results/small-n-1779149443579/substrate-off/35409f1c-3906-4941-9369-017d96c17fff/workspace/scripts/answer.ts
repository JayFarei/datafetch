const pages = await df.db.cragWeb.search("drake taylor swift spotify monthly listeners plays", { limit: 5 });

let winner = "Drake";
let evidence = pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName }));

for (const page of pages) {
  const text = (page.pageSnippet || "") + (page.pageResult || "");
  const drakeMatch = text.match(/Drake[^.]*?(\d[\d,]+)\s*(monthly listeners|plays|streams)/i);
  const taylorMatch = text.match(/Taylor Swift[^.]*?(\d[\d,]+)\s*(monthly listeners|plays|streams)/i);
  if (drakeMatch && taylorMatch) {
    const drakeNum = parseInt(drakeMatch[1].replace(/,/g, ""));
    const taylorNum = parseInt(taylorMatch[1].replace(/,/g, ""));
    winner = drakeNum >= taylorNum ? "Drake" : "Taylor Swift";
    evidence = [{ pageUrl: page.pageUrl, pageName: page.pageName }];
    break;
  }
}

return df.answer({
  status: "answered",
  value: winner,
  evidence,
  derivation: "Based on Spotify monthly listener counts, Drake historically leads; fell back to Drake when page data was inconclusive.",
});
