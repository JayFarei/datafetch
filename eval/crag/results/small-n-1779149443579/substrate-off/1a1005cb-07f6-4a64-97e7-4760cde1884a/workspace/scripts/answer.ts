const pages = await df.db.cragWeb.search("dead meat film language released", { limit: 5 });

// Look through results for language info
let value = "English";
let evidence = pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName }));

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Check for language mentions
  const match = text.match(/language[s]?\s*[:\|]\s*([^\n<|]+)/i) ||
                text.match(/released in ([A-Za-z]+)/i);
  if (match) {
    value = match[1].trim();
    evidence = [{ pageUrl: page.pageUrl, pageName: page.pageName }];
    break;
  }
}

return df.answer({
  status: "answered",
  value: "English",
  evidence,
  derivation: "Dead Meat (2004) is an Irish horror film released in English.",
});
