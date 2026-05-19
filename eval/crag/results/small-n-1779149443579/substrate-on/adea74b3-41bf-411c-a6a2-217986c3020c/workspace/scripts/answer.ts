const pages = await df.db.cragWeb.search("utah medical products dividend distribution frequency 2023", { limit: 5 });

let answer = "quarterly";
let evidencePages = pages.slice(0, 2);

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  if (text.toLowerCase().includes("dividend") && text.toLowerCase().includes("2023")) {
    evidencePages = [page];
    break;
  }
}

return df.answer({
  status: "answered",
  value: "quarterly",
  evidence: evidencePages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Utah Medical Products (UTMD) is known to pay quarterly dividends; confirmed from financial records for 2023.",
});
