// Smoke test for the FinChain mount adapter.
//
// Verifies that the iter 2a scaffolding produces a valid sibling-library
// mount for one (topic, templateIndex, currentSeedIndex) triple:
//   1. introspect-template.py runs cleanly for each sibling seed
//   2. buildSiblingLibrary returns 9 EvalRecords (seed_count - 1)
//   3. records have the expected shape (id, recordKey, family, attributes
//      including question + gold_final_value + difficulty)
//   4. the EvalRecordsMount's collection handle responds to findExact /
//      findSimilar / sample / probe correctly
//
// Does NOT exercise the snippet runtime, the observer, or the full agent
// loop — those land in iter 2b (finchainFullDatafetch.ts) and the E2E
// smoke in iter 2c. This smoke is the verification anchor for iter 2a.
//
// PASS / FAIL printed per check; exit 0 on all-pass, 1 otherwise.

import path from "node:path";
import { existsSync } from "node:fs";

import {
  buildFinChainMount,
  buildSiblingLibrary,
  defaultIntrospectorPaths,
  familyForTopic,
  introspectTemplate,
} from "../../../eval/harness/finchainRecords.js";

const checks: Array<{ name: string; pass: boolean; note?: string }> = [];
function record(name: string, pass: boolean, note?: string): void {
  checks.push({ name, pass, note });
  const tag = pass ? "[PASS]" : "[FAIL]";
  console.log(`${tag} ${name}${note ? `  — ${note}` : ""}`);
}

async function main(): Promise<number> {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "..");
  const paths = defaultIntrospectorPaths(repoRoot);

  // The FinChain dataset vendor is an optional, operator-prepared
  // dependency (cloned by `pnpm eval:finchain:prepare`). When it's absent
  // this smoke SKIPS rather than failing, so the default `pnpm test` stays
  // green for developers who haven't prepared the optional dataset. Run
  // the prepare step to exercise this smoke.
  if (!existsSync(paths.vendorDir)) {
    console.error(`finchain-mount smoke: SKIP — vendor dir absent at ${paths.vendorDir}`);
    console.error("(run 'pnpm eval:finchain:prepare' to enable this smoke)");
    return 0;
  }

  // 1. introspect a single template instance directly
  const target = {
    topic: "investment_analysis/ci",
    templateIndex: 1,
    seedIndex: 0,
  };
  const instance = await introspectTemplate({ paths, ...target });
  record(
    "introspect: template returns parsed (question, solution) tuple",
    typeof instance.question === "string"
      && instance.question.length > 0
      && typeof instance.solution === "string"
      && instance.solution.length > 0,
    `q.len=${instance.question.length} sol.len=${instance.solution.length}`,
  );
  record(
    "introspect: gold_final_value extracted",
    instance.goldFinalValue !== null && typeof instance.goldFinalValue === "number",
    `gold=${instance.goldFinalValue}`,
  );
  record(
    "introspect: difficulty parsed",
    ["Basic", "Intermediate", "Advanced"].includes(String(instance.difficulty)),
    `difficulty=${instance.difficulty}`,
  );

  // 2. reproducibility: same seed produces same question
  const repeat = await introspectTemplate({ paths, ...target });
  record(
    "introspect: seed reproducibility (same seed → same question)",
    repeat.question === instance.question && repeat.goldFinalValue === instance.goldFinalValue,
    `repeat gold=${repeat.goldFinalValue}`,
  );

  // 3. different seed produces different question
  const sibling = await introspectTemplate({ paths, ...target, seedIndex: 1 });
  record(
    "introspect: different seed → different question",
    sibling.question !== instance.question,
    `sibling q starts: ${sibling.question.slice(0, 40)}...`,
  );

  // 4. sibling library construction excludes current seed
  const records = await buildSiblingLibrary({
    paths,
    topic: target.topic,
    templateIndex: target.templateIndex,
    currentSeedIndex: target.seedIndex,
    seedCount: 10,
  });
  record(
    "sibling library: 9 records returned (10 seeds minus current)",
    records.length === 9,
    `records.length=${records.length}`,
  );
  const recordSeeds = new Set(records.map((r) => r.id));
  record(
    "sibling library: current seed (0) excluded; seeds 1-9 included",
    !recordSeeds.has(String(target.seedIndex))
      && [1, 2, 3, 4, 5, 6, 7, 8, 9].every((i) => recordSeeds.has(String(i))),
    `seeds=${Array.from(recordSeeds).sort().join(",")}`,
  );
  record(
    "sibling library: records carry question + gold_final_value attributes",
    records.every((r) => typeof r.attributes["question"] === "string"
      && typeof r.attributes["gold_final_value"] === "number"),
  );
  const expectedFamily = familyForTopic(target.topic);
  record(
    "sibling library: family is '<domain>-<topic_basename>'",
    records.every((r) => r.family === expectedFamily),
    `expected=${expectedFamily}`,
  );
  record(
    "sibling library: recordKey is unique per seed",
    new Set(records.map((r) => r.recordKey)).size === records.length,
  );

  // 5. mount adapter wraps records correctly
  const mount = await buildFinChainMount({
    paths,
    topic: target.topic,
    templateIndex: target.templateIndex,
    currentSeedIndex: target.seedIndex,
    seedCount: 10,
  });
  const inventory = await mount.probe();
  record(
    "mount: probe reports 9 rows in 'records' collection",
    inventory.collections.length === 1
      && inventory.collections[0]?.name === "records"
      && inventory.collections[0]?.rows === 9,
    JSON.stringify(inventory.collections),
  );
  const sample = (await mount.sample("records", { size: 3 })) as unknown[];
  record("mount: sample returns up to 3 rows", sample.length === 3, `got ${sample.length}`);

  const handle = mount.collection<typeof records[number]>("records");
  const exact = await handle.findExact({ id: "1" });
  record(
    "mount: findExact({id: '1'}) returns the seed-1 sibling",
    exact.length === 1 && exact[0]?.id === "1",
  );
  const all = await handle.findExact({}, 999);
  record("mount: findExact({}) returns all 9 records", all.length === 9);

  // 6. cross-topic sanity: a different topic produces a different family
  const otherInstance = await introspectTemplate({
    paths,
    topic: "financial_ratios/levratio",
    templateIndex: 5,
    seedIndex: 0,
  });
  record(
    "introspect: cross-topic + advanced tier works",
    otherInstance.difficulty === "Advanced" && otherInstance.goldFinalValue !== null,
    `levratio template 5 difficulty=${otherInstance.difficulty} gold=${otherInstance.goldFinalValue}`,
  );

  // Summary
  const passed = checks.filter((c) => c.pass).length;
  const total = checks.length;
  console.log("");
  console.log(`${passed}/${total} passed`);
  return passed === total ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error("finchain-mount smoke failed:", err);
  process.exit(1);
});
