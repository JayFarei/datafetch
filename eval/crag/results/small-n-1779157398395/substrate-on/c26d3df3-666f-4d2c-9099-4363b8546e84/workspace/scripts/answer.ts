const pages = await df.db.cragWeb.search("Rolling Stones Beggars Banquet members lineup", { limit: 5 });

return df.answer({
  status: "answered",
  value: "Mick Jagger, Keith Richards, Brian Jones, Bill Wyman, Charlie Watts",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "During the Beggars Banquet era (1968), the Rolling Stones consisted of Mick Jagger, Keith Richards, Brian Jones, Bill Wyman, and Charlie Watts.",
});
