const pages = await df.db.cragWeb.search("algae original title movie", { limit: 5 });

// Search for relevant info about whether "algae" is the original title
let answered = false;
let value = "invalid question";
let status: "answered" | "unsupported" = "unsupported";

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  const lower = text.toLowerCase();
  // Check if there's a movie with original title "algae"
  if (lower.includes("algae") && (lower.includes("original title") || lower.includes("algae") && lower.includes("film"))) {
    // Look for patterns indicating original title
    const yesMatch = lower.match(/original title[:\s]+algae/i) || lower.match(/algae[^a-z]+(original title|originally titled)/i);
    if (yesMatch) {
      value = "yes";
      status = "answered";
      answered = true;
      break;
    }
    const noMatch = lower.match(/original title[:\s]+(?!algae)[a-z]/i);
    if (noMatch) {
      value = "no";
      status = "answered";
      answered = true;
      break;
    }
  }
}

if (!answered) {
  // Try broader search
  const pages2 = await df.db.cragWeb.search("algae film movie original title", { limit: 5 });
  for (const page of pages2) {
    const text = page.pageResult || page.pageSnippet || "";
    if (text.toLowerCase().includes("algae")) {
      // If we find a page about an "Algae" movie, check if it's the original title
      const match = text.match(/[Oo]riginal\s+[Tt]itle[:\s]+([^\n<]+)/);
      if (match) {
        const origTitle = match[1].trim();
        value = origTitle.toLowerCase().includes("algae") ? "yes" : "no";
        status = "answered";
        break;
      }
    }
  }
}

return df.answer({
  status,
  value,
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Searched cached pages for 'algae' as original movie title; no clear supporting evidence found.",
});
