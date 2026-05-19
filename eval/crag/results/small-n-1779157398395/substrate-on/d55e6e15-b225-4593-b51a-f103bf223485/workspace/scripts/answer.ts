const pages = await df.db.cragWeb.search("corporate bonds issued united states 2020 total amount", { limit: 5 });

let value = "unsupported";
let status: "answered" | "unsupported" = "unsupported";
let derivation = "";

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for dollar amounts near "corporate bonds" and "2020"
  const match = text.match(/(?:corporate bonds?[^.]*?2020|2020[^.]*?corporate bonds?)[^.]*?\$?([\d,\.]+\s*(?:trillion|billion))/i);
  if (match) {
    value = match[1].trim();
    status = "answered";
    derivation = `Extracted total corporate bond issuance in the US in 2020 from page text.`;
    break;
  }
  // Try alternate pattern
  const match2 = text.match(/\$?([\d,\.]+\s*(?:trillion|billion))[^.]*?corporate bonds?[^.]*?2020/i);
  if (match2) {
    value = match2[1].trim();
    status = "answered";
    derivation = `Extracted total corporate bond issuance in the US in 2020 from page text.`;
    break;
  }
}

return df.answer({
  status,
  value,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: derivation || "Could not find a supported answer in cached pages.",
});
