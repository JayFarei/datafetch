// Cost-frontier figure generator (Phase-1 deliverable).
//
// Dependency-free (Node stdlib only; no venv, no matplotlib). Reads the REAL
// scorer output from the valid confirmatory run and emits an SVG break-even
// frontier. The figure is HONEST: it visualises the falsified result, i.e. the
// arm4 warm-reuse line diverging ABOVE the arm1 inline line (no break-even,
// M* = +Infinity), because arm4's per-session slope exceeds arm1's.
//
// Usage:  node experiments/episodes/03-sac-poc/figures/make-cost-frontier.mjs
// Output: experiments/episodes/03-sac-poc/figures/cost-frontier.svg  (+ stdout
//         echoes the plotted anchor points so the data->geometry mapping is
//         verifiable without rendering).

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const scorePath = path.resolve(
  here,
  "../../../eval/skillcraft/results/sac-poc/confirm-k5-pokeapi-h1x/score.json",
);
const score = JSON.parse(readFileSync(scorePath, "utf8"));

const bk = score.primaryBreakEven;
const BUILD = bk.buildCostTokens; // one-time governed-helper build (arm4)
const ARM1_PERQ = bk.arm1InlineCostPerQ; // inline re-derivation per question
const ARM4_PERQ = bk.arm4WarmCallCostPerQ; // warm reuse call per question
const M0 = bk.m0;
const DENOM = bk.denominatorTokens; // arm1_perq - arm4_perq (negative => no break-even)

// arm1 reuses nothing -> linear through origin. arm4 pays BUILD once, then
// ARM4_PERQ per warm-reuse question.
const arm1 = (m) => ARM1_PERQ * m;
const arm4 = (m) => BUILD + ARM4_PERQ * m;

const M_MAX = 16; // show past M0=8 so the divergence is unmistakable
const yMax = Math.max(arm1(M_MAX), arm4(M_MAX)) * 1.06;

// --- SVG geometry ----------------------------------------------------------
const W = 1010;
const H = 560;
const ML = 96;
const MR = 300; // right margin holds the annotation box
const MT = 64;
const MB = 70;
const plotW = W - ML - MR;
const plotH = H - MT - MB;

const sx = (m) => ML + (m / M_MAX) * plotW;
const sy = (y) => MT + plotH - (y / yMax) * plotH;

const fmt = (n) => Math.round(n).toLocaleString("en-US");
const fmtK = (n) => `${(n / 1000).toFixed(0)}k`;

function linePts(fn) {
  const pts = [];
  for (let m = 0; m <= M_MAX; m += 1) pts.push(`${sx(m).toFixed(1)},${sy(fn(m)).toFixed(1)}`);
  return pts.join(" ");
}

const yticks = 6;
const gridY = [];
for (let i = 0; i <= yticks; i += 1) {
  const yv = (yMax / yticks) * i;
  gridY.push({ yv, py: sy(yv) });
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <text x="${ML}" y="28" font-size="18" font-weight="700" fill="#111">Cost-frontier: warm reuse (arm4) vs inline re-derivation (arm1)</text>
  <text x="${ML}" y="48" font-size="12.5" fill="#b00020" font-weight="600">Honest NEGATIVE result: arm4 diverges ABOVE arm1 — no break-even (M* = +Infinity). pokeapi-pokedex, k=5, sonnet-4-6.</text>

  <!-- y grid + labels -->
  ${gridY
    .map(
      (g) =>
        `<line x1="${ML}" y1="${g.py.toFixed(1)}" x2="${ML + plotW}" y2="${g.py.toFixed(1)}" stroke="#eee" stroke-width="1"/>` +
        `<text x="${ML - 10}" y="${(g.py + 4).toFixed(1)}" font-size="11" fill="#666" text-anchor="end">${fmtK(g.yv)}</text>`,
    )
    .join("\n  ")}

  <!-- axes -->
  <line x1="${ML}" y1="${MT}" x2="${ML}" y2="${MT + plotH}" stroke="#333" stroke-width="1.5"/>
  <line x1="${ML}" y1="${MT + plotH}" x2="${ML + plotW}" y2="${MT + plotH}" stroke="#333" stroke-width="1.5"/>
  <text x="${ML + plotW / 2}" y="${H - 24}" font-size="13" fill="#333" text-anchor="middle">Number of warm-reuse sessions M (questions answered against the frozen interface)</text>
  <text x="26" y="${MT + plotH / 2}" font-size="13" fill="#333" text-anchor="middle" transform="rotate(-90 26 ${MT + plotH / 2})">Cumulative full-weight model-context tokens</text>

  <!-- x ticks -->
  ${[0, 2, 4, 6, 8, 10, 12, 14, 16]
    .map(
      (m) =>
        `<line x1="${sx(m).toFixed(1)}" y1="${MT + plotH}" x2="${sx(m).toFixed(1)}" y2="${MT + plotH + 5}" stroke="#333"/>` +
        `<text x="${sx(m).toFixed(1)}" y="${MT + plotH + 20}" font-size="11" fill="#666" text-anchor="middle">${m}</text>`,
    )
    .join("\n  ")}

  <!-- M0 reference -->
  <line x1="${sx(M0).toFixed(1)}" y1="${MT}" x2="${sx(M0).toFixed(1)}" y2="${MT + plotH}" stroke="#888" stroke-width="1" stroke-dasharray="4 4"/>
  <text x="${(sx(M0) + 5).toFixed(1)}" y="${MT + 14}" font-size="11" fill="#888">M0 = ${M0} (success threshold)</text>

  <!-- arm4 build-cost intercept -->
  <circle cx="${sx(0).toFixed(1)}" cy="${sy(arm4(0)).toFixed(1)}" r="4" fill="#b00020"/>
  <text x="${(sx(0) + 8).toFixed(1)}" y="${(sy(arm4(0)) - 8).toFixed(1)}" font-size="11" fill="#b00020">build cost ${fmt(BUILD)}</text>

  <!-- lines -->
  <polyline points="${linePts(arm1)}" fill="none" stroke="#1565c0" stroke-width="2.5"/>
  <polyline points="${linePts(arm4)}" fill="none" stroke="#b00020" stroke-width="2.5"/>

  <!-- end labels -->
  <text x="${(sx(M_MAX) - 4).toFixed(1)}" y="${(sy(arm1(M_MAX)) + 4).toFixed(1)}" font-size="12" fill="#1565c0" text-anchor="end" font-weight="600">arm1 inline</text>
  <text x="${(sx(M_MAX) - 4).toFixed(1)}" y="${(sy(arm4(M_MAX)) - 8).toFixed(1)}" font-size="12" fill="#b00020" text-anchor="end" font-weight="600">arm4 warm</text>

  <!-- annotation box -->
  <g transform="translate(${ML + plotW + 18}, ${MT + 6})">
    <text x="0" y="0" font-size="12.5" font-weight="700" fill="#111">Per-session slope</text>
    <text x="0" y="18" font-size="11.5" fill="#1565c0">arm1: ${fmt(ARM1_PERQ)} tok/session</text>
    <text x="0" y="34" font-size="11.5" fill="#b00020">arm4: ${fmt(ARM4_PERQ)} tok/session</text>
    <text x="0" y="56" font-size="11.5" fill="#111" font-weight="600">slope gap (arm1 - arm4):</text>
    <text x="0" y="72" font-size="11.5" fill="#b00020">${fmt(DENOM)} (negative)</text>
    <text x="0" y="96" font-size="11.5" fill="#111">M* = build / (arm1 - arm4)</text>
    <text x="0" y="112" font-size="11.5" fill="#b00020">= ${fmt(BUILD)} / (${fmt(DENOM)})</text>
    <text x="0" y="128" font-size="12" fill="#b00020" font-weight="700">= +Infinity (never pays back)</text>
    <text x="0" y="156" font-size="11" fill="#444" font-weight="600">All three cost units agree:</text>
    <text x="0" y="172" font-size="10.8" fill="#666">full-weight gap  -66,521</text>
    <text x="0" y="186" font-size="10.8" fill="#666">fresh+output gap     -97</text>
    <text x="0" y="200" font-size="10.8" fill="#666">dollar-equiv gap  -6,740</text>
    <text x="0" y="224" font-size="10.5" fill="#444" font-weight="600">Why arm4 loses:</text>
    <text x="0" y="239" font-size="10.2" fill="#666">crystallised helper was</text>
    <text x="0" y="252" font-size="10.2" fill="#666">shallow + non-invocable;</text>
    <text x="0" y="265" font-size="10.2" fill="#666">+66k is a turn-count tax.</text>
    <text x="0" y="288" font-size="10.2" fill="#666">(arm4 DID beat the no-reuse</text>
    <text x="0" y="301" font-size="10.2" fill="#666">floors arm5a/arm5b by ~137k,</text>
    <text x="0" y="314" font-size="10.2" fill="#666">but loses to cheap inline arm1.)</text>
  </g>
</svg>
`;

const outPath = path.resolve(here, "cost-frontier.svg");
writeFileSync(outPath, svg, "utf8");

// --- verifiable echo of the data->geometry mapping -------------------------
console.log("cost-frontier figure written:", outPath);
console.log("source:", scorePath);
console.log("--- plotted anchors (full-weight tokens) ---");
console.log(`BUILD=${fmt(BUILD)}  ARM1_PERQ=${fmt(ARM1_PERQ)}  ARM4_PERQ=${fmt(ARM4_PERQ)}  DENOM(arm1-arm4)=${fmt(DENOM)}`);
for (const m of [0, M0, M_MAX]) {
  console.log(`  M=${String(m).padStart(2)}  arm1=${fmt(arm1(m)).padStart(11)}  arm4=${fmt(arm4(m)).padStart(11)}  arm4-arm1=${fmt(arm4(m) - arm1(m)).padStart(10)}`);
}
const everCrosses = DENOM > 0;
console.log(`lines cross (break-even exists)? ${everCrosses}  => M* = ${everCrosses ? fmt(BUILD / DENOM) : "+Infinity"}`);
console.log(`sanity: arm4 strictly above arm1 for all M>=0 ? ${[0, 1, 4, 8, 16, 100].every((m) => arm4(m) > arm1(m))}`);
