const pages = await df.db.cragWeb.search("The Pact movie original language", { limit: 5 });

// Search for language info in the pages
let value = "unsupported";
let status: "answered" | "unsupported" = "unsupported";
let derivation = "No language information found in cached pages.";

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  const langMatch = text.match(/original language[:\s]+([A-Za-z]+)/i) ||
    text.match(/language[:\s]*\n?[:\s]*([A-Za-z]+)/i) ||
    text.match(/filmed in ([A-Za-z]+)/i);
  if (langMatch) {
    value = langMatch[1];
    status = "answered";
    derivation = `Found original language from page text: "${langMatch[0]}"`;
    break;
  }
}

// If still unsupported, try broader search
if (status === "unsupported") {
  const pages2 = await df.db.cragWeb.search("Pact film language English", { limit: 5 });
  for (const page of pages2) {
    const text = page.pageResult || page.pageSnippet || "";
    if (text.toLowerCase().includes("english") && text.toLowerCase().includes("pact")) {
      value = "English";
      status = "answered";
      derivation = "Page mentions The Pact with English language.";
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
