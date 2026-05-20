// Build the full-2706 manifest covering all public-split records.
// Saves to eval/crag/manifests/full-2706.json.

import { writeFileSync, mkdirSync, createReadStream } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..", "..", "..");
const JSONL_PATH = resolve(ROOT, "eval/crag/vendor/raw/crag_task_1_and_2_dev_v4.jsonl");
const OUT_PATH = resolve(ROOT, "eval/crag/manifests/full-2706.json");

interface CragRecord {
  interaction_id: string;
  domain: string;
  question_type: string;
  static_or_dynamic: string;
  split: number;
  query: string;
}

async function main(): Promise<void> {
  const records: CragRecord[] = [];
  const rl = createInterface({
    input: createReadStream(JSONL_PATH, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.length === 0) continue;
    const r = JSON.parse(line) as Record<string, unknown>;
    records.push({
      interaction_id: r["interaction_id"] as string,
      domain: r["domain"] as string,
      question_type: r["question_type"] as string,
      static_or_dynamic: r["static_or_dynamic"] as string,
      split: r["split"] as number,
      query: r["query"] as string,
    });
  }
  console.log(`Loaded ${records.length} records.`);
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  const manifest = {
    name: "full-2706",
    description: "Full public split — validation + public test = 2,706 records.",
    source: "eval/crag/vendor/raw/crag_task_1_and_2_dev_v4.jsonl",
    count: records.length,
    interaction_ids: records.map(r => r.interaction_id),
    records: records.map(r => ({
      interaction_id: r.interaction_id,
      domain: r.domain,
      question_type: r.question_type,
      static_or_dynamic: r.static_or_dynamic,
      query: r.query,
    })),
  };
  writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2));
  console.log(`✓ Manifest written: ${OUT_PATH}`);
}

main().catch(err => {
  process.stderr.write(`crashed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
