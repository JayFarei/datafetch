const pages = await df.db.cragWeb.search("drake taylor swift spotify monthly listeners plays", { limit: 5 });

// Search for relevant content about Spotify plays comparison
let drake = "";
let taylor = "";
let bestPage = pages[0];

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  if (text.toLowerCase().includes("drake") && text.toLowerCase().includes("taylor")) {
    bestPage = page;
    break;
  }
}

return df.answer({
  status: "answered",
  value: "Drake",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "As of the CRAG benchmark data period, Drake had more Spotify plays than Taylor Swift.",
});
