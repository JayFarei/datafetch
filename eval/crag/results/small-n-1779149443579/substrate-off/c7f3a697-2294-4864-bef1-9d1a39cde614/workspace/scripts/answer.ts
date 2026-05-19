const pages = await df.db.cragWeb.search("TRIS CYCC stock trading volume week", { limit: 5 });

// Look for trading volume data
let trisVolume = 0;
let cyccVolume = 0;
let evidence: { pageUrl: string; pageName: string }[] = [];

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  evidence.push({ pageUrl: page.pageUrl, pageName: page.pageName });

  // Try to find volume numbers for TRIS and CYCC
  const trisMatch = text.match(/TRIS[^]*?[Vv]olume[^]*?([\d,]+)/);
  const cyccMatch = text.match(/CYCC[^]*?[Vv]olume[^]*?([\d,]+)/);

  if (trisMatch) {
    const vol = parseInt(trisMatch[1].replace(/,/g, ""));
    if (vol > trisVolume) trisVolume = vol;
  }
  if (cyccMatch) {
    const vol = parseInt(cyccMatch[1].replace(/,/g, ""));
    if (vol > cyccVolume) cyccVolume = vol;
  }
}

let value: string;
let status: "answered" | "unsupported" = "answered";

if (trisVolume === 0 && cyccVolume === 0) {
  status = "unsupported";
  value = "I don't know";
} else if (trisVolume >= cyccVolume) {
  value = "TRIS";
} else {
  value = "CYCC";
}

return df.answer({
  status,
  value,
  evidence: evidence.slice(0, 2),
  derivation: "Compared weekly trading volumes for TRIS and CYCC from cached pages.",
});
