const pages = await df.db.cragWeb.search("corporate bonds issued United States 2020 total amount", { limit: 5 });

let answerValue = "";
let evidencePages = pages.slice(0, 2);

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for patterns like "$1.7 trillion" or "1,700 billion" related to corporate bond issuance 2020
  const match = text.match(/(?:corporate bonds?|bond issuance)[^.]*?2020[^.]*?\$([\d.,]+)\s*(trillion|billion)/i)
    || text.match(/2020[^.]*?(?:corporate bonds?|bond issuance)[^.]*?\$([\d.,]+)\s*(trillion|billion)/i)
    || text.match(/\$([\d.,]+)\s*(trillion|billion)[^.]*?corporate bonds?[^.]*?2020/i);
  if (match) {
    answerValue = `$${match[1]} ${match[2]}`;
    evidencePages = [page];
    break;
  }
}

if (!answerValue) {
  // Try broader search
  const pages2 = await df.db.cragWeb.search("US corporate bond market 2020 issuance record", { limit: 5 });
  for (const page of pages2) {
    const text = page.pageResult || page.pageSnippet || "";
    const match = text.match(/(?:corporate bonds?|bond issuance)[^.]*?\$([\d.,]+)\s*(trillion|billion)/i)
      || text.match(/\$([\d.,]+)\s*(trillion|billion)[^.]*?(?:corporate bond|issued)/i);
    if (match) {
      answerValue = `$${match[1]} ${match[2]}`;
      evidencePages = [page];
      break;
    }
  }
}

return df.answer({
  status: answerValue ? "answered" : "unsupported",
  value: answerValue || "invalid question",
  evidence: evidencePages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Extracted total US corporate bond issuance figure for 2020 from cached web pages.",
});
