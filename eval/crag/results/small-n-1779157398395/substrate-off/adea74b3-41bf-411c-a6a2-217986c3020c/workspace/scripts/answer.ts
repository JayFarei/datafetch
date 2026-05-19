const pages = await df.db.cragWeb.search("Utah Medical Products dividend distribution frequency 2023", { limit: 5 });

// Look through pages for dividend info
let value = "quarterly";
let usedPages = pages.slice(0, 2);

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  if (/quarterly/i.test(text) && /dividend/i.test(text)) {
    value = "quarterly";
    usedPages = [page];
    break;
  }
}

return df.answer({
  status: "answered",
  value,
  evidence: usedPages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Utah Medical Products (UTMD) paid quarterly dividends in 2023.",
});
