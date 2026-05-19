const pages = await df.db.cragWeb.search("usain bolt olympic gold medals sprinting career", { limit: 5 });

return df.answer({
  status: "answered",
  value: "8",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Usain Bolt won 9 Olympic gold medals originally, but one 2008 4x100m relay gold was stripped, leaving him with 8 official Olympic gold medals in sprinting events.",
});
