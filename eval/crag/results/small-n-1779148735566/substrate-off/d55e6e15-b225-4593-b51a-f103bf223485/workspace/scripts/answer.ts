const pages = await df.db.cragWeb.search("corporate bonds issued united states 2020 total amount", { limit: 5 });

let answerValue = "";
let evidencePages = pages.slice(0, 2);

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for mentions of corporate bond issuance in 2020
  const match = text.match(/(?:corporate bonds?|bond issuance)[^\n]*2020[^\n]*\$?([\d,.]+\s*(?:trillion|billion))/i)
    || text.match(/2020[^\n]*(?:corporate bonds?|bond issuance)[^\n]*\$?([\d,.]+\s*(?:trillion|billion))/i)
    || text.match(/\$?([\d,.]+\s*(?:trillion|billion))[^\n]*corporate bonds?[^\n]*2020/i);
  if (match) {
    answerValue = match[1].trim();
    evidencePages = [page];
    break;
  }
}

if (!answerValue) {
  // Try broader search
  const pages2 = await df.db.cragWeb.search("US corporate bond market 2020 issuance record", { limit: 5 });
  for (const page of pages2) {
    const text = page.pageResult || page.pageSnippet || "";
    const match = text.match(/(?:corporate bonds?|bond issuance)[^\n]*2020[^\n]*\$?([\d,.]+\s*(?:trillion|billion))/i)
      || text.match(/2020[^\n]*(?:corporate bonds?|bond issuance)[^\n]*\$?([\d,.]+\s*(?:trillion|billion))/i)
      || text.match(/\$?([\d,.]+\s*(?:trillion|billion))[^\n]*corporate[^\n]*2020/i);
    if (match) {
      answerValue = match[1].trim();
      evidencePages = [page];
      break;
    }
  }
}

return df.answer({
  status: answerValue ? "answered" : "unsupported",
  value: answerValue || "unsupported",
  evidence: evidencePages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: answerValue
    ? `Extracted total US corporate bond issuance in 2020 (${answerValue}) from page text matching issuance figures.`
    : "Could not find a supported figure for total US corporate bond issuance in 2020.",
});
