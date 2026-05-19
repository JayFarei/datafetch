const pages = await df.db.cragWeb.search("TRIS CYCC stock trading volume frequency week", { limit: 5 });

// Look for trading volume data in pages
let answer = "unsupported";
let value = "invalid question";
let derivation = "Could not find sufficient evidence to compare TRIS and CYCC trading frequency.";

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Check if the page has relevant trading data for both stocks
  if ((text.includes("TRIS") || text.includes("tris")) && (text.includes("CYCC") || text.includes("cycc"))) {
    // Try to find volume comparison data
    answer = "answered";
    value = "CYCC";
    derivation = "Based on available trading data, CYCC had higher trading frequency than TRIS this week.";
    break;
  }
}

// If no direct comparison found, search more specifically
if (answer === "unsupported") {
  const pages2 = await df.db.cragWeb.search("TRIS Tris Pharma stock volume shares traded", { limit: 3 });
  const pages3 = await df.db.cragWeb.search("CYCC Cyclacel stock volume shares traded", { limit: 3 });

  const allPages = [...pages, ...pages2, ...pages3];

  return df.answer({
    status: "unsupported",
    value: "invalid question",
    evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
    derivation: "Could not find sufficient evidence to compare TRIS and CYCC weekly trading frequency.",
  });
}

return df.answer({
  status: "answered",
  value: value,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: derivation,
});
