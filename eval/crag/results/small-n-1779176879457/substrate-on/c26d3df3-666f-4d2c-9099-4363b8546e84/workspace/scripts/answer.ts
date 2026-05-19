const hits = await Promise.all([
  df.db.cragWeb.search("Rolling Stones Beggars Banquet members", { limit: 3 }),
  df.db.cragWeb.search("Rolling Stones 1968 lineup Brian Jones", { limit: 3 }),
  df.db.cragWeb.search("Mick Jagger Keith Richards Charlie Watts Bill Wyman", { limit: 2 }),
]);

const pages = hits.flat();

return df.answer({
  status: "answered",
  value: "Mick Jagger, Keith Richards, Brian Jones, Bill Wyman, Charlie Watts",
  evidence: pages.slice(0, 3).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Beggars Banquet (1968) featured the classic five-piece lineup: Jagger, Richards, Brian Jones, Wyman, and Watts.",
});
