const pages = await df.db.cragWeb.search("The Switch movie premiere theaters time", { limit: 5 });

// Look for premiere time info
let value = "invalid question";
let status: "answered" | "unsupported" = "unsupported";

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // The Switch (2010 film) - look for premiere/release time
  const match = text.match(/premiere[ds]?\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))/i)
    || text.match(/(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))\s+(?:on|premiere)/i);
  if (match) {
    value = match[1];
    status = "answered";
    break;
  }
}

// If no specific time found, this question may be unanswerable
return df.answer({
  status,
  value,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Searched cached pages for premiere time of 'The Switch'; no specific theater premiere time found in evidence.",
});
