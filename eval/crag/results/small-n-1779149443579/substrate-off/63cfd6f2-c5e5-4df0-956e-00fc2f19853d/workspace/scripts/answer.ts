const pages = await df.db.cragWeb.search("The Switch movie premiere theaters time", { limit: 5 });

// Search for premiere time info
let value = "invalid question";
let status: "answered" | "unsupported" = "unsupported";
let derivation = "No supporting evidence found in cached pages.";

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for theater premiere time references
  const match = text.match(/(?:premiere[ds]?|opens?|released?|showing).*?(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM))/i) ||
                text.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)).*?(?:premiere|theater|theatre)/i);
  if (match) {
    value = match[1].trim();
    status = "answered";
    derivation = `Found premiere time "${value}" in page text.`;
    break;
  }
}

return df.answer({
  status,
  value,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation,
});
