const pages = await df.db.cragWeb.search("Willow Smith first music release debut", { limit: 5 });

return df.answer({
  status: "answered",
  value: "2010",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Willow Smith (Will Smith's daughter) released her debut single 'Whip My Hair' in 2010.",
});
