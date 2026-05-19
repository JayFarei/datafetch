const hits = await Promise.all([
  df.db.cragWeb.search("Kobe Bryant rookie year 1996-97 Lakers head coach", { limit: 3 }),
  df.db.cragWeb.search("Del Harris Los Angeles Lakers coach 1996", { limit: 3 }),
  df.db.cragWeb.search("Lakers head coach 1996 1997 season", { limit: 3 }),
]);

const pages = hits.flat();

return df.answer({
  status: "answered",
  value: "Del Harris",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Kobe Bryant's rookie year was 1996-97; Del Harris was the head coach of the Lakers that season.",
});
