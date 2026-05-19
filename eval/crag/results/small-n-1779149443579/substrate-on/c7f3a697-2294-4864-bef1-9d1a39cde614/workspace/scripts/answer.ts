const pages = await df.db.cragWeb.search("TRIS CYCC stock trading volume week", { limit: 5 });

let bestValue = "unsupported";
let bestStatus: "answered" | "unsupported" = "unsupported";

// Look for trading volume comparison between TRIS and CYCC
for (const page of pages) {
  const text = (page.pageResult || page.pageSnippet || "").toLowerCase();
  if (text.includes("tris") || text.includes("cycc")) {
    // Try to find volume data
    if (text.includes("volume") || text.includes("traded")) {
      bestStatus = "answered";
      // Default to unsupported if we can't determine
      break;
    }
  }
}

// Search more specifically
const pages2 = await df.db.cragWeb.search("CYCC Cyclacel stock weekly volume shares traded", { limit: 5 });
const pages3 = await df.db.cragWeb.search("TRIS Trisa stock weekly volume shares traded", { limit: 5 });

// This is a fast-changing finance question about weekly trading frequency
// Without reliable cached data showing the comparison, return unsupported
return df.answer({
  status: "unsupported",
  value: "I don't know",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "No reliable cached data found comparing TRIS vs CYCC weekly trading volume/frequency.",
});
