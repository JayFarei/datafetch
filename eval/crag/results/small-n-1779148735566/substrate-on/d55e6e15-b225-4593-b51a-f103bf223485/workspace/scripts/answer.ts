const pages = await df.db.cragWeb.search("corporate bonds issued united states 2020 total amount", { limit: 5 });

let value = "unsupported";
let status: "answered" | "unsupported" = "unsupported";
let derivation = "No supporting evidence found in cached pages.";

for (const page of pages) {
  const text = page.pageResult ?? page.pageSnippet ?? "";
  // Look for patterns like "$X trillion" or "$X billion" near "corporate bond" and "2020"
  const match = text.match(/corporate\s+bond[^.]*2020[^.]*\$?([\d,.]+)\s*(trillion|billion)/i)
    || text.match(/\$?([\d,.]+)\s*(trillion|billion)[^.]*corporate\s+bond[^.]*2020/i)
    || text.match(/2020[^.]*corporate\s+bond[^.]*\$?([\d,.]+)\s*(trillion|billion)/i);
  if (match) {
    value = `$${match[1]} ${match[2]}`;
    status = "answered";
    derivation = `Extracted from page text mentioning corporate bond issuance in 2020.`;
    break;
  }
}

return df.answer({
  status,
  value,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation,
});
