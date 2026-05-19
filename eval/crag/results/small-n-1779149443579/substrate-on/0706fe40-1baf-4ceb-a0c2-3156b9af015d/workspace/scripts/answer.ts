const pages = await df.db.cragWeb.search("companies added dow jones industrial average august 2020", { limit: 5 });

return df.answer({
  status: "answered",
  value: "Salesforce, Amgen, and Honeywell",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "In August 2020, Salesforce, Amgen, and Honeywell replaced Exxon Mobil, Pfizer, and Raytheon Technologies in the DJIA.",
});
