const hits = await Promise.all([
  df.db.cragWeb.search("Utah Medical Products dividend 2023", { limit: 3 }),
  df.db.cragWeb.search("UTMD dividend distribution frequency quarterly annual", { limit: 3 }),
  df.db.cragWeb.search("Utah Medical Products UTMD dividend history", { limit: 3 }),
]);

const pages = hits.flat();

// Search for dividend frequency info in page results
let frequency = "";
let evidencePages = [];

for (const page of pages) {
  const text = (page.pageResult || "") + (page.pageSnippet || "");
  const lowerText = text.toLowerCase();

  if (lowerText.includes("dividend") && (lowerText.includes("quarterly") || lowerText.includes("annual") || lowerText.includes("semi-annual") || lowerText.includes("monthly"))) {
    if (lowerText.includes("quarterly")) {
      frequency = "quarterly";
    } else if (lowerText.includes("annual") && !lowerText.includes("semi-annual")) {
      frequency = "annual";
    } else if (lowerText.includes("semi-annual")) {
      frequency = "semi-annual";
    }
    evidencePages.push(page);
    if (frequency) break;
  }
}

if (!frequency) {
  // Check all pages for any dividend mention
  for (const page of pages) {
    if ((page.pageResult || "").toLowerCase().includes("dividend") || (page.pageSnippet || "").toLowerCase().includes("dividend")) {
      evidencePages.push(page);
    }
  }
}

return df.answer({
  status: frequency ? "answered" : "unsupported",
  value: frequency || "invalid question",
  evidence: evidencePages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Searched CRAG pages for Utah Medical Products (UTMD) dividend distribution frequency in 2023.",
});
