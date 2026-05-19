const hits = await Promise.all([
  df.db.cragWeb.search("The Switch movie premiere theaters time", { limit: 3 }),
  df.db.cragWeb.search("The Switch 2010 film theatrical release", { limit: 3 }),
  df.db.cragWeb.search("Switch Jennifer Aniston Jason Bateman premiere", { limit: 3 }),
]);

const pages = hits.flat();

// Search for premiere time in page content
let answer = "unsupported";
let value = "invalid question";

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for time mentions near premiere/theater
  const timeMatch = text.match(/premiere[^.]*?(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/i) ||
    text.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))[^.]*?premiere/i) ||
    text.match(/first\s+(?:showed?|screened?|premiered?)[^.]*?(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/i);
  if (timeMatch) {
    answer = "answered";
    value = timeMatch[1];
    break;
  }
}

return df.answer({
  status: answer === "answered" ? "answered" : "unsupported",
  value: value,
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Searched for The Switch movie premiere time; movies typically don't have a specific 'time' of first premiere noted in common sources - this question may have a false premise.",
});
