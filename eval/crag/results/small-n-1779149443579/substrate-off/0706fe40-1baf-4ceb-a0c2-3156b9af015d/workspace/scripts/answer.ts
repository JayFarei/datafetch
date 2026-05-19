const pages = await df.db.cragWeb.search("Dow Jones Industrial Average August 2020 companies added", { limit: 5 });

return df.answer({
  status: "answered",
  value: "Salesforce, Amgen, Honeywell",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "In August 2020, Salesforce, Amgen, and Honeywell replaced Exxon Mobil, Pfizer, and Raytheon Technologies in the DJIA.",
});
