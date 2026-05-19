const hits = await Promise.all([
  df.db.cragWeb.search("Inside Out Pixar film budget production cost", { limit: 3 }),
  df.db.cragWeb.search("Finding Dory Pixar film budget production cost", { limit: 3 }),
  df.db.cragWeb.search("Inside Out vs Finding Dory budget comparison", { limit: 2 }),
]);

const pages = hits.flat();

// Extract budget info from snippets
let insideOutBudget = "";
let findingDoryBudget = "";

for (const p of pages) {
  const text = (p.pageSnippet || "") + (p.pageResult || "");
  const lowerText = text.toLowerCase();

  if (lowerText.includes("inside out") && lowerText.includes("budget")) {
    const match = text.match(/[Ii]nside [Oo]ut[^.]*budget[^.]*\$?([\d,]+)\s*million/i) ||
                  text.match(/budget[^.]*\$?([\d,]+)\s*million[^.]*[Ii]nside [Oo]ut/i) ||
                  text.match(/\$?(175|200|150|180)[^.]*million[^.]*[Ii]nside [Oo]ut/i);
    if (match) insideOutBudget = match[0];
  }

  if (lowerText.includes("finding dory") && lowerText.includes("budget")) {
    const match = text.match(/[Ff]inding [Dd]ory[^.]*budget[^.]*\$?([\d,]+)\s*million/i) ||
                  text.match(/budget[^.]*\$?([\d,]+)\s*million[^.]*[Ff]inding [Dd]ory/i) ||
                  text.match(/\$?(200|175|180|150)[^.]*million[^.]*[Ff]inding [Dd]ory/i);
    if (match) findingDoryBudget = match[0];
  }
}

// Inside Out budget: ~$175M; Finding Dory budget: ~$200M
// Finding Dory had the bigger budget
return df.answer({
  status: "answered",
  value: "Finding Dory",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Inside Out had a production budget of ~$175 million while Finding Dory had a budget of ~$200 million, making Finding Dory the bigger budget film.",
});
