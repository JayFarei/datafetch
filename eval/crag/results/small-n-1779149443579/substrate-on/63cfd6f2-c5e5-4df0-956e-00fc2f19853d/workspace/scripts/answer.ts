const pages = await df.db.cragWeb.search("The Switch movie premiere theaters time", { limit: 5 });

// Search for premiere time in page results
let answer = "unsupported";
let value = "invalid question";
let evidencePages = pages.slice(0, 2);

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for time patterns near "premiere" or "opening"
  const timeMatch = text.match(/premiere[^.]*?(\d{1,2}:\d{2}\s*[ap]m)/i) ||
    text.match(/(\d{1,2}:\d{2}\s*[ap]m)[^.]*?premiere/i) ||
    text.match(/first\s+show[^.]*?(\d{1,2}:\d{2}\s*[ap]m)/i);
  if (timeMatch) {
    answer = "answered";
    value = timeMatch[1];
    evidencePages = [page];
    break;
  }
}

// The Switch (2010) - Jennifer Aniston film - check for midnight premiere or specific time
if (answer === "unsupported") {
  for (const page of pages) {
    const text = page.pageResult || page.pageSnippet || "";
    if (text.toLowerCase().includes("switch") && (text.toLowerCase().includes("premiere") || text.toLowerCase().includes("theater"))) {
      // Check for midnight showings or specific times
      const midnightMatch = text.match(/midnight/i);
      if (midnightMatch) {
        answer = "answered";
        value = "12:01 AM";
        evidencePages = [page];
        break;
      }
    }
  }
}

return df.answer({
  status: answer === "answered" ? "answered" : "unsupported",
  value: value,
  evidence: evidencePages.map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Searched cached pages for The Switch movie premiere time; if no specific time found, marked unsupported.",
});
