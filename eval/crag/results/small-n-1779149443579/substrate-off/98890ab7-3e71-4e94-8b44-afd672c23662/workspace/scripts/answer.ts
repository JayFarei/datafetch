const pages = await df.db.cragWeb.search("crystal palace final game premier league season", { limit: 5 });

// Search for the last match date
let answerValue = "invalid question";
let answerStatus: "answered" | "unsupported" = "unsupported";
let derivation = "Could not find supporting evidence.";

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for date patterns near "crystal palace" and "final" or "last"
  const lowerText = text.toLowerCase();
  if (lowerText.includes("crystal palace")) {
    // Try to find last match date mentions
    const datePattern = /(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}|\d{4}-\d{2}-\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4})/gi;
    const dates = text.match(datePattern);
    if (dates && dates.length > 0) {
      // The last game likely at end of season - take last date found
      answerValue = dates[dates.length - 1];
      answerStatus = "answered";
      derivation = `Found date ${answerValue} in Crystal Palace Premier League page.`;
      break;
    }
  }
}

return df.answer({
  status: answerStatus,
  value: answerValue,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation,
});
