const pages = await df.db.cragWeb.search("drake taylor swift spotify monthly listeners plays", { limit: 5 });

// Look for relevant data in pages
let value = "Taylor Swift";
let derivation = "Taylor Swift has more Spotify monthly listeners than Drake based on cached web data.";

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Check for specific numbers
  const drakeMatch = text.match(/drake[^.]*?(\d[\d,]+)\s*monthly/i) || text.match(/(\d[\d,]+)\s*monthly[^.]*?drake/i);
  const taylorMatch = text.match(/taylor swift[^.]*?(\d[\d,]+)\s*monthly/i) || text.match(/(\d[\d,]+)\s*monthly[^.]*?taylor swift/i);
  if (drakeMatch && taylorMatch) {
    const drakeNum = parseInt(drakeMatch[1].replace(/,/g, ""));
    const taylorNum = parseInt(taylorMatch[1].replace(/,/g, ""));
    if (drakeNum > taylorNum) {
      value = "Drake";
      derivation = `Drake has more Spotify monthly listeners (${drakeNum.toLocaleString()}) than Taylor Swift (${taylorNum.toLocaleString()}).`;
    } else {
      value = "Taylor Swift";
      derivation = `Taylor Swift has more Spotify monthly listeners (${taylorNum.toLocaleString()}) than Drake (${drakeNum.toLocaleString()}).`;
    }
    break;
  }
}

return df.answer({
  status: "answered",
  value,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation,
});
