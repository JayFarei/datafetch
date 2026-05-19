const pages = await df.db.cragWeb.search("Phoenix Suns December 2022 games losses", { limit: 5 });

// Look through pages for game results
let teams: string[] = [];
let evidencePages = pages.slice(0, 3);

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for mentions of teams that beat the Suns in Dec 2022
  // Common patterns: "defeated the Suns", "beat Phoenix", etc.
  const lower = text.toLowerCase();
  if (lower.includes("suns") && (lower.includes("december 2022") || lower.includes("2022-12") || lower.includes("dec 2022"))) {
    // Extract game results mentioning wins against Suns
    const lines = text.split("\n");
    for (const line of lines) {
      const ll = line.toLowerCase();
      if (ll.includes("suns") && (ll.includes("loss") || ll.includes("defeat") || ll.includes("beat") || ll.includes("won"))) {
        // Try to find team names
      }
    }
  }
}

// Search more specifically
const pages2 = await df.db.cragWeb.search("Suns schedule results December 2022 wins losses", { limit: 5 });
const pages3 = await df.db.cragWeb.search("NBA December 2022 Phoenix Suns game results", { limit: 5 });

const allPages = [...pages, ...pages2, ...pages3];
const seen = new Set<string>();
const uniquePages = allPages.filter(p => {
  if (seen.has(p.pageUrl)) return false;
  seen.add(p.pageUrl);
  return true;
});

// Collect teams that won against Suns
const winningTeams = new Set<string>();
const nbaTeams = [
  "Lakers", "Warriors", "Nuggets", "Clippers", "Kings", "Jazz", "Trail Blazers",
  "Mavericks", "Spurs", "Rockets", "Thunder", "Pelicans", "Grizzlies", "Timberwolves",
  "Celtics", "Nets", "Knicks", "76ers", "Raptors", "Bulls", "Cavaliers", "Pistons",
  "Bucks", "Pacers", "Heat", "Magic", "Wizards", "Hornets", "Hawks"
];

for (const page of uniquePages) {
  const text = page.pageResult || page.pageSnippet || "";
  const lines = text.split("\n");
  for (const line of lines) {
    const ll = line.toLowerCase();
    // Look for lines where Suns lost: pattern like "Team 110, Suns 105" or "Suns lost to Team"
    if (ll.includes("suns")) {
      for (const team of nbaTeams) {
        if (line.includes(team)) {
          // Check if this suggests a win for that team over Suns
          if (ll.includes("loss") || ll.includes("defeat") || ll.includes("lost")) {
            winningTeams.add(team);
          }
        }
      }
    }
  }
}

const evidenceList = uniquePages.slice(0, 2).map(p => ({ pageUrl: p.pageUrl, pageName: p.pageName }));

// If we found teams, return them; otherwise try to get raw info
if (winningTeams.size > 0) {
  return df.answer({
    status: "answered",
    value: Array.from(winningTeams).join(", "),
    evidence: evidenceList,
    derivation: "Extracted teams that defeated the Phoenix Suns in December 2022 from game result pages.",
  });
}

// Look more carefully at the raw text
let rawAnswer = "";
for (const page of uniquePages) {
  const text = page.pageResult || "";
  if (text.length > 100 && text.toLowerCase().includes("suns")) {
    // Find December 2022 section
    const idx = text.indexOf("December 2022");
    if (idx >= 0) {
      rawAnswer = text.substring(Math.max(0, idx - 200), idx + 2000);
      break;
    }
    const idx2 = text.indexOf("2022-12");
    if (idx2 >= 0) {
      rawAnswer = text.substring(Math.max(0, idx2 - 200), idx2 + 2000);
      break;
    }
  }
}

// Parse schedule-style data
const scheduleTeams = new Set<string>();
if (rawAnswer) {
  for (const team of nbaTeams) {
    if (rawAnswer.includes(team)) {
      // Check context around the team mention for loss indicator
      const teamIdx = rawAnswer.indexOf(team);
      const context = rawAnswer.substring(Math.max(0, teamIdx - 100), teamIdx + 200);
      const cl = context.toLowerCase();
      if (cl.includes("l ") || cl.includes("loss") || cl.includes("lost") || cl.includes("w,") === false) {
        // Can't easily determine without structured data
        scheduleTeams.add(team);
      }
    }
  }
}

return df.answer({
  status: "unsupported",
  value: "I don't know",
  evidence: evidenceList,
  derivation: "Could not find sufficient structured game result data to determine which teams beat the Phoenix Suns in December 2022.",
});
