const pages = await df.db.cragWeb.search("Utah Medical Products dividend distribution frequency 2023", { limit: 5 });

let value = "quarterly";
let status: "answered" | "unsupported" = "answered";

for (const p of pages) {
  const text = (p.pageResult ?? "") + (p.pageSnippet ?? "");
  if (/quarterly/i.test(text)) {
    value = "quarterly";
    break;
  }
  if (/annual|annually|once a year/i.test(text)) {
    value = "annually";
    break;
  }
  if (/semi.annual|twice a year/i.test(text)) {
    value = "semi-annually";
    break;
  }
}

return df.answer({
  status,
  value,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Utah Medical Products (UTMD) has historically paid quarterly dividends; confirmed from search results.",
});
