const pages = await df.db.cragWeb.search("TRIS CYCC stock trading volume week", { limit: 5 });

// Search for trading volume data
let trisVolume = 0;
let cyccVolume = 0;
let evidence: Array<{ pageUrl: string; pageName: string }> = [];

for (const page of pages) {
  const text = page.pageResult || page.pageSnippet || "";
  evidence.push({ pageUrl: page.pageUrl, pageName: page.pageName });

  // Look for volume numbers associated with TRIS or CYCC
  const trisMatch = text.match(/TRIS[^]*?volume[^]*?([0-9,]+)/i) || text.match(/([0-9,]+)[^]*?TRIS/i);
  const cyccMatch = text.match(/CYCC[^]*?volume[^]*?([0-9,]+)/i) || text.match(/([0-9,]+)[^]*?CYCC/i);

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
  derivation: "Compared weekly trading volumes for TRIS and CYCC from cached stock pages.",
});
