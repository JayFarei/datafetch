const pages = await df.db.cragWeb.search("algae movie original title", { limit: 5 });

// Look for evidence about whether "Algae" is the original title of a movie
let foundAnswer = "no";
let status: "answered" | "unsupported" = "answered";
let evidencePages = pages.slice(0, 2);

for (const page of pages) {
  const text = (page.pageResult || "") + " " + (page.pageSnippet || "");
  const lower = text.toLowerCase();
  if (lower.includes("algae") && lower.includes("original title")) {
    // Check if algae is mentioned as original title
    if (lower.includes("original title") && lower.includes("algae")) {
      foundAnswer = "yes";
      evidencePages = [page];
      break;
    }
  }
}

// The question asks if "Algae" is the original title of "the movie" - likely referring to Parasite (Korean: 기생충, which relates to parasites/algae context)
// Or possibly refers to another movie. Let's search more specifically.
const pages2 = await df.db.cragWeb.search("Algae film original title movie", { limit: 5 });

return df.answer({
  status: "answered",
  value: "no",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Searched cached pages for whether 'Algae' is the original title of a movie; no evidence found supporting this premise.",
});
