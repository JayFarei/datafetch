const pages = await df.db.cragWeb.search("corporate bonds issued united states 2020 total amount", { limit: 5 });

let value = "unsupported";
let status: "answered" | "unsupported" = "unsupported";
let derivation = "";

for (const page of pages) {
  const text = page.pageResult ?? page.pageSnippet ?? "";
  // Look for patterns like "$1.7 trillion" or "1,700 billion" near "corporate bonds" and "2020"
  const match = text.match(/\$?([\d,.]+)\s*(trillion|billion)\s*(?:in|of)?\s*(?:corporate bonds?|bond issuance)/i)
    ?? text.match(/corporate bonds?\s*[^.]*?([\d,.]+)\s*(trillion|billion)/i)
    ?? text.match(/issued[^.]*?([\d,.]+)\s*(trillion|billion)[^.]*?2020/i)
    ?? text.match(/2020[^.]*?([\d,.]+)\s*(trillion|billion)[^.]*?(?:corporate bonds?|bond issuance)/i);
  if (match) {
    value = `$${match[1]} ${match[2]}`;
    status = "answered";
    derivation = `Extracted from page text: "${match[0]}"`;
    break;
  }
}

return df.answer({
  status,
  value,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: derivation || "No clear match found in cached pages",
});
