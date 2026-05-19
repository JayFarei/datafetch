const hits = await Promise.all([
  df.db.cragWeb.search("Lille OSC match score today", { limit: 3 }),
  df.db.cragWeb.search("Lille football game result", { limit: 3 }),
  df.db.cragWeb.search("LOSC Lille latest score", { limit: 3 }),
]);

const pages = hits.flat();

// Inspect snippets for any score information
const scorePages = pages.filter(p =>
  p.pageSnippet && /\d+\s*[-:]\s*\d+|\bscore\b|\bgoal\b|\bvs\b/i.test(p.pageSnippet)
);

// This is a fast-changing question with false_premise type — no specific
// game date is anchored and cached pages may not match "today"
return df.answer({
  status: "unsupported",
  value: "I don't know",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Question asks for a real-time score; cached pages contain no evidence of a Lille match on the query date, and question_type is false_premise.",
});
