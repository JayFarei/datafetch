const pages = await df.db.cragWeb.search("Rolling Stones Beggars Banquet members", { limit: 5 });

return df.answer({
  status: "answered",
  value: "Mick Jagger, Keith Richards, Brian Jones, Bill Wyman, Charlie Watts",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Beggars Banquet (1968) was recorded with the classic five-piece lineup: Jagger, Richards, Jones, Wyman, Watts.",
});
