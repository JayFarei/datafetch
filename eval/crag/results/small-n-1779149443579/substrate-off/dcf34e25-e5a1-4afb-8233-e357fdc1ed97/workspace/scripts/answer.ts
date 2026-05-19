const pages = await df.db.cragWeb.search("One For All group performing together start", { limit: 5 });

let answer = "unsupported";
let value = "invalid question";
let evidence = pages.slice(0, 2).map((p) => ({ pageUrl: p.pageUrl, pageName: p.pageName }));

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  // Look for year/date patterns near "One For All" and "performing" or "together"
  const match = text.match(/[Oo]ne [Ff]or [Aa]ll[^.]*?(\d{4})[^.]*?(?:perform|together|formed|started)/i)
    || text.match(/(?:perform|together|formed|started)[^.]*?[Oo]ne [Ff]or [Aa]ll[^.]*?(\d{4})/i)
    || text.match(/[Oo]ne [Ff]or [Aa]ll[^.]*?formed[^.]*?(\d{4})/i)
    || text.match(/formed in (\d{4})/i);
  if (match) {
    answer = "answered";
    value = match[1];
    evidence = [{ pageUrl: page.pageUrl, pageName: page.pageName }];
    break;
  }
}

return df.answer({
  status: answer === "answered" ? "answered" : "unsupported",
  value,
  evidence,
  derivation: "Searched for when One For All started performing together and extracted the year from page text.",
});
