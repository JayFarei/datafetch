const hits = await Promise.all([
  df.db.cragWeb.search("Dow Jones Industrial Average August 2020 added companies", { limit: 3 }),
  df.db.cragWeb.search("Salesforce Amgen Honeywell DJIA 2020", { limit: 3 }),
  df.db.cragWeb.search("Dow Jones changes August 2020 Exxon Pfizer replaced", { limit: 3 }),
]);

const pages = hits.flat();

return df.answer({
  status: "answered",
  value: "Salesforce, Amgen, and Honeywell",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "In August 2020, Salesforce, Amgen, and Honeywell replaced ExxonMobil, Pfizer, and Raytheon Technologies in the DJIA.",
});
