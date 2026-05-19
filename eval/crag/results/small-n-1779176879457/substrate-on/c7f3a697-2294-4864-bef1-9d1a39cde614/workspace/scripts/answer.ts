const hits = await Promise.all([
  df.db.cragWeb.search("TRIS stock trading volume this week", { limit: 3 }),
  df.db.cragWeb.search("CYCC stock trading volume this week", { limit: 3 }),
  df.db.cragWeb.search("TRIS CYCC stock comparison frequency", { limit: 3 }),
]);

const pages = hits.flat();

// Search through page content for trading volume data
let trisVolume = 0;
let cyccVolume = 0;
let evidence: { pageUrl: string; pageName: string }[] = [];

for (const page of pages) {
  const text = (page.pageResult || "") + " " + (page.pageSnippet || "");

  // Look for TRIS volume
  const trisMatch = text.match(/TRIS[^]*?volume[^]*?([0-9,]+)/i) ||
                    text.match(/([0-9,]+)[^]*?shares[^]*?TRIS/i);
  if (trisMatch && page.pageUrl) {
    const vol = parseInt(trisMatch[1].replace(/,/g, ""));
    if (vol > trisVolume) trisVolume = vol;
  }

  // Look for CYCC volume
  const cyccMatch = text.match(/CYCC[^]*?volume[^]*?([0-9,]+)/i) ||
                    text.match(/([0-9,]+)[^]*?shares[^]*?CYCC/i);
  if (cyccMatch && page.pageUrl) {
    const vol = parseInt(cyccMatch[1].replace(/,/g, ""));
    if (vol > cyccVolume) cyccVolume = vol;
  }

  if (page.pageUrl && (text.includes("TRIS") || text.includes("CYCC"))) {
    evidence.push({ pageUrl: page.pageUrl, pageName: page.pageName || page.pageUrl });
  }
}

let value: string;
let status: "answered" | "unsupported";

if (trisVolume > 0 || cyccVolume > 0) {
  if (trisVolume > cyccVolume) {
    value = "TRIS";
  } else if (cyccVolume > trisVolume) {
    value = "CYCC";
  } else {
    value = "unsupported";
  }
  status = "answered";
} else {
  // Try to find mentions in text without extracting volumes
  const allText = pages.map(p => (p.pageResult || "") + " " + (p.pageSnippet || "")).join(" ");
  if (allText.toLowerCase().includes("tris") || allText.toLowerCase().includes("cycc")) {
    status = "unsupported";
    value = "I don't know";
  } else {
    status = "unsupported";
    value = "I don't know";
  }
}

return df.answer({
  status,
  value,
  evidence: evidence.slice(0, 3),
  derivation: "Compared weekly trading volumes for TRIS and CYCC stocks from cached web pages.",
});
