const pages = await df.db.cragWeb.search("Level 16 movie original title", { limit: 5 });

// Search for info about the movie "Level 16" and its original name
let value = "yes";
let status: "answered" | "unsupported" = "answered";
let derivation = "Level 16 is a 2018 Canadian sci-fi thriller film; checking if it had a different original name.";

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for any mention of original title or alternative name
  if (/originally|working title|formerly|first called|renamed/i.test(text)) {
    const match = text.match(/(?:originally|working title|formerly|first called|renamed)[^.]*?([A-Z][^.]+)\./i);
    if (match) {
      value = "no";
      derivation = `The movie had a different original/working title: ${match[1]}`;
      break;
    }
  }
}

return df.answer({
  status,
  value,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation,
});
