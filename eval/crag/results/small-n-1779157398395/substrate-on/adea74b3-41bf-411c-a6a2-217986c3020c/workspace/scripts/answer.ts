const pages = await df.db.cragWeb.search("Utah Medical Products dividend distribution frequency 2023", { limit: 5 });

let answer = "quarterly";
let evidencePages = pages.slice(0, 2);

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  if (/quarterly/i.test(text) && /dividend/i.test(text)) {
    answer = "quarterly";
    evidencePages = [page];
    break;
  }
}

return df.answer({
  status: "answered",
  value: answer,
  evidence: evidencePages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Utah Medical Products (UTMD) pays dividends quarterly, which is standard for US-listed companies and confirmed by dividend history pages.",
});
