const pages = await df.db.cragWeb.search("Israel Adesanya UFC fights decision percentage", { limit: 5 });

let value = "unsupported";
let status: "answered" | "unsupported" = "unsupported";
let derivation = "No supporting evidence found in cached pages.";

for (const page of pages) {
  const text = page.pageResult ?? page.pageSnippet ?? "";
  // Look for percentage patterns near "decision"
  const match = text.match(/(\d+(?:\.\d+)?)\s*%[^.]*decision/i) || text.match(/decision[^.]*?(\d+(?:\.\d+)?)\s*%/i);
  if (match) {
    value = match[1] + "%";
    status = "answered";
    derivation = `Found decision percentage in page text: "${match[0]}"`;
    break;
  }
}

return df.answer({
  status,
  value,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation,
});
