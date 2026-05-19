const pages = await df.db.cragWeb.search("Chris Evans actor most famous role Captain America Iron Man", { limit: 5 });

return df.answer({
  status: "answered",
  value: "No, Chris Evans is most famous for playing Captain America, not Iron Man.",
  evidence: pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName })),
  derivation: "Iron Man is played by Robert Downey Jr.; Chris Evans is known for Captain America in the MCU.",
});
