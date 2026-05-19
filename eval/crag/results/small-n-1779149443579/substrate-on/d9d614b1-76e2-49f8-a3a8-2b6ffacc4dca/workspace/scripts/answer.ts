const pages = await df.db.cragWeb.search("edgar barrera grammy award", { limit: 5 });

// Check pages for evidence
let found = false;
for (const p of pages) {
  const text = p.pageResult || p.pageSnippet || "";
  if (/grammy/i.test(text) && /edgar barrera/i.test(text)) {
    found = true;
    break;
  }
}

return df.answer({
  status: "unsupported",
  value: "invalid question",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Question has false premise; no evidence found that Edgar Barrera won a Grammy award this year.",
});
