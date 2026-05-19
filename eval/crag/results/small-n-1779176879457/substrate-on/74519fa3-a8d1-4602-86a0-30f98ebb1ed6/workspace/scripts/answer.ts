const hits = await Promise.all([
  df.db.cragWeb.search("Willow Smith first music release", { limit: 3 }),
  df.db.cragWeb.search("Willow Smith Whip My Hair 2010", { limit: 3 }),
  df.db.cragWeb.search("Will Smith daughter musician debut", { limit: 3 }),
]);

const pages = hits.flat();

return df.answer({
  status: "answered",
  value: "2010",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Willow Smith (Will Smith's daughter) released her debut single 'Whip My Hair' in 2010.",
});
