const pages = await df.db.cragWeb.search("The Lodger original title", { limit: 5 });

let answer = "unsupported";
let value = "invalid question";
let evidencePages = pages.slice(0, 2);

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for original title mentions
  const match = text.match(/originally[^.]*titled?[^.]*[""]([^""]+)[""]/i)
    || text.match(/working title[^.]*[""]([^""]+)[""]/i)
    || text.match(/original title[^.]*[""]([^""]+)[""]/i)
    || text.match(/[""]([^""]+)[""]\s*was\s*(?:the\s*)?original title/i);
  if (match) {
    answer = "answered";
    value = match[1];
    evidencePages = [page];
    break;
  }
}

return df.answer({
  status: answer === "answered" ? "answered" : "unsupported",
  value,
  evidence: evidencePages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Searched cached pages for 'The Lodger original title' and extracted the original/working title from context.",
});
