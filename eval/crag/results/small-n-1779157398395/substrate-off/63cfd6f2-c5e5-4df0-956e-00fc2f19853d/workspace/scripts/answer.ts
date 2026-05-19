const pages = await df.db.cragWeb.search("The Switch movie theater premiere time", { limit: 5 });

// Search for theater premiere time in page content
let answerValue = "invalid question";
let answerStatus: "answered" | "unsupported" = "unsupported";
let evidencePages = pages.slice(0, 2);

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // "The Switch" (2010 film) premiered - look for time info
  const timeMatch = text.match(/(?:premiere[d]?|open(?:ed|ing)|released?)[^\n]*?(\d{1,2}[:.]\d{2}\s*(?:am|pm|AM|PM))/i)
    || text.match(/(\d{1,2}[:.]\d{2}\s*(?:am|pm|AM|PM))[^\n]*?(?:premiere|theater|cinema)/i);
  if (timeMatch) {
    answerValue = timeMatch[1];
    answerStatus = "answered";
    evidencePages = [page];
    break;
  }
}

// The Switch (2010) - not typically known for a specific theater premiere time
// This question may be unanswerable or refer to a specific screening time
return df.answer({
  status: "unsupported",
  value: "invalid question",
  evidence: evidencePages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Movies do not have a specific 'premiere time in theaters' - they have release dates. The premise of the question may be false or unanswerable from available sources.",
});
