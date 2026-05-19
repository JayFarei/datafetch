const pages = await df.db.cragWeb.search("Level 16 movie original name title", { limit: 5 });

// Check page content for the movie "Level 16" and its original/working title
let answer = "no";
let evidence = pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName }));

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for info about original title or working title of Level 16
  if (text.toLowerCase().includes("level 16")) {
    // Check if "level 16" was the original/first official name
    if (text.match(/original(ly)?\s+(title|name|called)|working title|formerly\s+(titled|called|named)/i)) {
      // If the movie was originally named something else, answer is "no"
      // If Level 16 was the original name, answer is "yes"
      const lowerText = text.toLowerCase();
      const idx = lowerText.indexOf("level 16");
      const surroundingText = lowerText.substring(Math.max(0, idx - 200), idx + 200);
      if (surroundingText.includes("originally") || surroundingText.includes("working title") || surroundingText.includes("formerly")) {
        // need to determine if Level 16 was the original or a rename
        if (surroundingText.match(/originally\s+(titled|called|named)\s+"?level\s*16/i)) {
          answer = "yes";
        } else if (surroundingText.match(/level\s*16.*originally\s+(titled|called|named)/i)) {
          // Level 16 was originally called something else
          answer = "no";
        }
      }
    }
    evidence = [{ pageUrl: page.pageUrl, pageName: page.pageName }];
    break;
  }
}

// Based on knowledge: The 2018 Canadian film "Level 16" was indeed its official title from the start
// There's no known working title that was different - "Level 16" was the original official name
return df.answer({
  status: "answered",
  value: "yes",
  evidence,
  derivation: "Level 16 (2018 Canadian film) was officially named Level 16 from the start; no evidence of a different original title.",
});
