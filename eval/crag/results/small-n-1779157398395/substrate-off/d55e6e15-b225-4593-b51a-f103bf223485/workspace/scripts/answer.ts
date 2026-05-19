const pages = await df.db.cragWeb.search("total corporate bonds issued united states 2020", { limit: 5 });

let value = "unsupported";
let status: "answered" | "unsupported" = "unsupported";
let derivation = "";

for (const page of pages) {
  const text = page.pageResult ?? page.pageSnippet ?? "";
  // Look for patterns like "$X trillion" or "$X billion" near "corporate bond" and "2020"
  const match = text.match(/(?:corporate bond[s]?\s+issuance[^.]*?(?:2020)[^.]*?\$?([\d,.]+\s*(?:trillion|billion))|(?:2020)[^.]*?corporate bond[s]?[^.]*?\$?([\d,.]+\s*(?:trillion|billion)))/i);
  if (match) {
    value = (match[1] || match[2]).trim();
    status = "answered";
    derivation = "Extracted corporate bond issuance figure for 2020 from page text.";
    break;
  }
  // Try simpler pattern
  const m2 = text.match(/\$?([\d,.]+)\s*(trillion|billion)[^.]*?(?:corporate bond|bond issuance)[^.]*?2020/i);
  const m3 = text.match(/(?:corporate bond|bond issuance)[^.]*?2020[^.]*?\$?([\d,.]+)\s*(trillion|billion)/i);
  const m = m2 || m3;
  if (m) {
    value = `$${m[1]} ${m[2]}`;
    status = "answered";
    derivation = "Extracted corporate bond issuance figure for 2020 from page text.";
    break;
  }
}

return df.answer({
  status,
  value,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: derivation || "Could not find a supported answer in the cached pages.",
});
