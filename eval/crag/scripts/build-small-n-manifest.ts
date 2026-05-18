// Build the small-N stratified manifest for the iter4+ paired comparison.
//
// 50 questions: 5 domains × 8 question_types × ≈1-2 instances per cell,
// drawn from validation (split == 0) only so public test is held back for
// the full eval. Deterministic via fixed seed.
//
// Output: eval/crag/manifests/small-n-50.json — array of interaction_ids
// the runner will iterate.
//
// Run with:  pnpm tsx eval/crag/scripts/build-small-n-manifest.ts

import { writeFileSync, mkdirSync, createReadStream } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type CragRecord = {
  interaction_id: string;
  domain: string;
  question_type: string;
  static_or_dynamic: string;
  split: number;
  query: string;
};

const ROOT = resolve(__dirname, "..", "..", "..");
const JSONL_PATH = resolve(ROOT, "eval/crag/vendor/raw/crag_task_1_and_2_dev_v4.jsonl");
const OUT_PATH = resolve(ROOT, "eval/crag/manifests/small-n-50.json");

// Deterministic seeded RNG so the manifest is reproducible.
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

async function main(): Promise<void> {
  const SEED = 20260519;
  const rng = mulberry32(SEED);

  // Stream the jsonl line-by-line so we never hold the 4.8 GB file in memory.
  // Drop search_results immediately; keep only the slice fields.
  const records: CragRecord[] = [];
  const rl = createInterface({
    input: createReadStream(JSONL_PATH, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.length === 0) continue;
    const r = JSON.parse(line) as Record<string, unknown>;
    if (r["split"] !== 0) continue;
    records.push({
      interaction_id: r["interaction_id"] as string,
      domain: r["domain"] as string,
      question_type: r["question_type"] as string,
      static_or_dynamic: r["static_or_dynamic"] as string,
      split: r["split"] as number,
      query: r["query"] as string,
    });
  }

  console.log(`Loaded ${records.length} validation records.`);

  // Stratify: 5 domains × 8 question_types = 40 cells. Target ≈1-2 per cell,
  // total 50.
  const DOMAINS = ["finance", "movie", "music", "open", "sports"];
  const QTYPES = [
    "simple", "simple_w_condition", "comparison", "aggregation",
    "false_premise", "set", "multi-hop", "post-processing",
  ];

  const cells = new Map<string, CragRecord[]>();
  for (const r of records) {
    const key = `${r.domain}|${r.question_type}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key)!.push(r);
  }

  console.log(`Stratified into ${cells.size} cells (target: ${DOMAINS.length * QTYPES.length}).`);

  // First pass: take 1 per cell where the cell is non-empty (≤ 40 records).
  const picked: CragRecord[] = [];
  for (const domain of DOMAINS) {
    for (const qtype of QTYPES) {
      const key = `${domain}|${qtype}`;
      const cell = cells.get(key);
      if (!cell || cell.length === 0) {
        console.log(`  empty cell: ${key}`);
        continue;
      }
      const shuffled = shuffle(cell, rng);
      picked.push(shuffled[0]!);
    }
  }

  // Second pass: top up to 50 from the largest cells.
  const needed = 50 - picked.length;
  if (needed > 0) {
    const remaining: CragRecord[] = [];
    for (const [key, cell] of cells.entries()) {
      const alreadyPicked = picked.find(p => `${p.domain}|${p.question_type}` === key);
      const shuffled = shuffle(cell, rng);
      for (const r of shuffled) {
        if (r.interaction_id === alreadyPicked?.interaction_id) continue;
        remaining.push(r);
      }
    }
    // Sort remaining by cell size descending so we top up from rich cells first.
    const cellSize = new Map<string, number>();
    for (const [key, cell] of cells.entries()) cellSize.set(key, cell.length);
    remaining.sort((a, b) => {
      const sa = cellSize.get(`${a.domain}|${a.question_type}`) ?? 0;
      const sb = cellSize.get(`${b.domain}|${b.question_type}`) ?? 0;
      return sb - sa;
    });
    picked.push(...remaining.slice(0, needed));
  }

  console.log(`Selected ${picked.length} records.`);

  // Per-slice distribution check.
  const dist = (key: keyof CragRecord) => {
    const counts = new Map<string, number>();
    for (const r of picked) {
      const k = String(r[key]);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  };

  console.log("\nDistribution (selected):");
  console.log("  domain:", Object.fromEntries(dist("domain")));
  console.log("  question_type:", Object.fromEntries(dist("question_type")));
  console.log("  static_or_dynamic:", Object.fromEntries(dist("static_or_dynamic")));

  // Write manifest.
  const manifest = {
    name: "small-n-50",
    description: "Stratified small-N manifest for iter4 paired comparison. 5 domains × 8 question_types, ≈1-2 per cell, total 50. Drawn from CRAG validation split (split==0). Deterministic via seed " + SEED + ".",
    source: "eval/crag/vendor/raw/crag_task_1_and_2_dev_v4.jsonl",
    seed: SEED,
    count: picked.length,
    interaction_ids: picked.map(r => r.interaction_id),
    records: picked.map(r => ({
      interaction_id: r.interaction_id,
      domain: r.domain,
      question_type: r.question_type,
      static_or_dynamic: r.static_or_dynamic,
      query: r.query,
    })),
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\n✓ Manifest written: ${OUT_PATH}`);
}

main();
