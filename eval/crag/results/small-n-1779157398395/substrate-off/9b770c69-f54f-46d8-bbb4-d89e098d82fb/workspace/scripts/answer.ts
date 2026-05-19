const pages = await df.db.cragWeb.search("Katherine Ryan In Trouble director", { limit: 5 });

let director = "";
let evidencePages = pages.slice(0, 2);

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  const match = text.match(/[Dd]irected by ([A-Z][a-z]+(?: [A-Z][a-z]+)+)/);
  if (match) {
    director = match[1];
    evidencePages = [page];
    break;
  }
  const match2 = text.match(/[Dd]irector[:\s]+([A-Z][a-z]+(?: [A-Z][a-z]+)+)/);
  if (match2) {
    director = match2[1];
    evidencePages = [page];
    break;
  }
}

return df.answer({
  status: director ? "answered" : "unsupported",
  value: director || "invalid question",
  evidence: evidencePages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Extracted director name from page text matching 'directed by' or 'director:' pattern.",
});
