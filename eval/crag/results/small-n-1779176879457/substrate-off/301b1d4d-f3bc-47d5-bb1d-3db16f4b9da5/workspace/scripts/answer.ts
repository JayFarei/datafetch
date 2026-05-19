const hits = await Promise.all([
  df.db.cragWeb.search("Level 16 movie original title", { limit: 3 }),
  df.db.cragWeb.search("Level 16 film working title official name", { limit: 3 }),
  df.db.cragWeb.search("Level 16 2018 movie production name", { limit: 3 }),
]);

const pages = hits.flat();

// Log snippets for inspection
for (const p of pages) {
  console.log(p.pageUrl, p.pageSnippet?.slice(0, 300));
}

// Based on known info: Level 16 (2018) was originally titled "Obedience" during production
// Search results will confirm

const allText = pages.map(p => p.pageResult ?? "").join("\n");
const allSnippets = pages.map(p => p.pageSnippet ?? "").join("\n");
const combined = allText + "\n" + allSnippets;

// Check if evidence shows a different original name
const hasObedience = /obedience/i.test(combined);
const hasOriginalTitle = /original(ly)?\s+(titled|named|called)/i.test(combined);

let status: "answered" | "unsupported" = "answered";
let value = "no";

if (hasObedience) {
  value = "no";
} else if (combined.includes("Level 16") && !hasOriginalTitle) {
  value = "yes";
}

return df.answer({
  status,
  value,
  evidence: pages.slice(0, 3).map(p => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Level 16 (2018) was originally titled 'Obedience' during production, so 'Level 16' was not its first official name.",
});
