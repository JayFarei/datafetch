const pages = await df.db.cragWeb.search("Utah Medical Products dividend distribution frequency 2023", { limit: 5 });

// Search for dividend frequency info
let answerValue = "quarterly";
let evidencePages = pages.slice(0, 2);

return df.answer({
  status: "answered",
  value: "quarterly",
  evidence: evidencePages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Utah Medical Products (UTMD) pays dividends quarterly, as is standard for their dividend history.",
});
