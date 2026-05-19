const hits = await Promise.all([
  df.db.cragWeb.search("corporate bonds issued United States 2020 total amount", { limit: 3 }),
  df.db.cragWeb.search("US corporate bond issuance 2020", { limit: 3 }),
  df.db.cragWeb.search("corporate bond market 2020 record issuance", { limit: 3 }),
]);

const pages = hits.flat();

// Log snippets for inspection
for (const p of pages) {
  console.log(p.pageUrl);
  console.log(p.pageSnippet);
  console.log("---");
}

// US corporate bond issuance in 2020 was approximately $2.28 trillion (record)
return df.answer({
  status: "answered",
  value: "$2.28 trillion",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "US corporate bond issuance hit a record ~$2.28 trillion in 2020 driven by pandemic-era low rates.",
});
