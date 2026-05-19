const pages = await df.db.cragWeb.search("Sonia Sotomayor president administration", { limit: 3 });

return df.answer({
  status: "unsupported",
  value: "invalid question",
  evidence: [],
  derivation: "Sonia Sotomayor is a U.S. Supreme Court Justice, not a president, so the premise is false.",
});
