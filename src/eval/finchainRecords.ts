// FinChain mount adapter. Parallel to evalRecords.ts but builds the
// per-(topic, template) sibling library by spawning the Python
// introspection helper at eval/finchain/scripts/introspect-template.py.
//
// Per the iter 1 design (eval/finchain/protocol.md):
// - family = "<domain>-<topic_basename>" (e.g. "investment_analysis-ci")
// - records mount = the 9 OTHER seed instances of the same (topic, template)
//   pair (excluding the current episode's seed_index)
// - each EvalRecord describes one sibling seed: id, question, gold_final_value,
//   plus parameter-shaped attributes
//
// This file imports the EvalRecord type + mount class from evalRecords.ts;
// the EvalRecordsMount adapter is benchmark-agnostic, only the record
// construction is FinChain-specific.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { type EvalRecord, EvalRecordsMount } from "./evalRecords.js";

export interface FinChainTemplateInstance {
  topic: string;             // e.g. "investment_analysis/ci"
  templateName: string;      // e.g. "template_ci_simple_calculation"
  templatePosition: number;  // 1-5
  seedIndex: number;         // 0-9 by convention
  difficulty: "Basic" | "Intermediate" | "Advanced" | string;
  question: string;
  solution: string;
  goldFinalValue: number | null;
  goldIntermediateValues: number[];
}

export interface IntrospectorPaths {
  scriptPath: string;        // .../eval/finchain/scripts/introspect-template.py
  vendorDir: string;         // .../eval/finchain/vendor/finchain
  pythonBin?: string;        // defaults to "python3"
}

/**
 * Resolve the canonical paths for the FinChain introspection toolchain.
 * Uses the repo's eval/finchain/{scripts,vendor} convention; override
 * via the input if running from a non-standard location.
 */
export function defaultIntrospectorPaths(repoRoot: string): IntrospectorPaths {
  return {
    scriptPath: path.join(repoRoot, "eval", "finchain", "scripts", "introspect-template.py"),
    vendorDir: path.join(repoRoot, "eval", "finchain", "vendor", "finchain"),
  };
}

/**
 * Spawn the Python introspector for one (topic, templateIndex, seedIndex)
 * triple and parse its JSON output into a FinChainTemplateInstance.
 */
export async function introspectTemplate(input: {
  paths: IntrospectorPaths;
  topic: string;
  templateIndex: number;
  seedIndex: number;
}): Promise<FinChainTemplateInstance> {
  const { paths, topic, templateIndex, seedIndex } = input;
  if (!existsSync(paths.scriptPath)) {
    throw new Error(`finchainRecords: introspector script missing at ${paths.scriptPath}`);
  }
  if (!existsSync(paths.vendorDir)) {
    throw new Error(
      `finchainRecords: vendor dir missing at ${paths.vendorDir}. ` +
      `Run 'pnpm eval:finchain:prepare' first.`,
    );
  }
  const args = [
    paths.scriptPath,
    "--topic", topic,
    "--template-index", String(templateIndex),
    "--seed-index", String(seedIndex),
    "--vendor-dir", paths.vendorDir,
  ];
  const pythonBin = paths.pythonBin ?? "python3";
  return await new Promise<FinChainTemplateInstance>((resolve, reject) => {
    const child = spawn(pythonBin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(err).toString("utf8").trim();
        reject(new Error(`introspect-template.py exited ${code}: ${stderr || "(no stderr)"}`));
        return;
      }
      const stdout = Buffer.concat(out).toString("utf8").trim();
      try {
        const parsed = JSON.parse(stdout) as Record<string, unknown>;
        if (parsed["error"]) {
          reject(new Error(`introspect-template.py error: ${String(parsed["error"])}`));
          return;
        }
        resolve({
          topic: String(parsed["topic"]),
          templateName: String(parsed["template_name"]),
          templatePosition: Number(parsed["template_position"]),
          seedIndex: Number(parsed["seed_index"]),
          difficulty: String(parsed["difficulty"]),
          question: String(parsed["question"]),
          solution: String(parsed["solution"]),
          goldFinalValue: parsed["gold_final_value"] === null ? null : Number(parsed["gold_final_value"]),
          goldIntermediateValues: (parsed["gold_intermediate_values"] as number[]) ?? [],
        });
      } catch (parseErr) {
        reject(new Error(`introspect-template.py emitted non-JSON output: ${String(parseErr)}`));
      }
    });
  });
}

/**
 * Build the family identifier for a FinChain topic. Maps the vendor
 * subdirectory layout (<domain>/<topic_basename>.py) to a single
 * hyphen-joined family string used for lib-cache scoping.
 *
 * Example: "investment_analysis/ci" → "investment_analysis-ci"
 */
export function familyForTopic(topic: string): string {
  return topic.replace("/", "-");
}

/**
 * Render a single FinChain template instance into an EvalRecord row
 * suitable for the substrate's records mount. The record carries the
 * sibling's question + gold final value + parameter-shaped attributes
 * so the cold-path agent can reverse-engineer the formula from siblings.
 */
export function renderRecord(instance: FinChainTemplateInstance): EvalRecord {
  const family = familyForTopic(instance.topic);
  const id = String(instance.seedIndex);
  const label = `${instance.difficulty} seed ${instance.seedIndex}`;
  const attributes: Record<string, string | number | boolean> = {
    seed_index: instance.seedIndex,
    template_name: instance.templateName,
    template_position: instance.templatePosition,
    difficulty: instance.difficulty,
    question: instance.question,
  };
  if (instance.goldFinalValue !== null) {
    attributes["gold_final_value"] = instance.goldFinalValue;
  }
  return {
    id,
    recordKey: `${instance.topic}:${instance.templateName}:${instance.seedIndex}`,
    family,
    entity: id,
    label,
    attributes,
  };
}

/**
 * Build a sibling library for a (topic, templateIndex, currentSeedIndex)
 * triple by introspecting all seeds in [0, seedCount) except the current
 * one. Returns the EvalRecord array ready to be mounted via EvalRecordsMount.
 *
 * The default seedCount is 10 (FinChain paper convention; 290 templates ×
 * 10 seeds = 2,900 instances).
 */
export async function buildSiblingLibrary(input: {
  paths: IntrospectorPaths;
  topic: string;
  templateIndex: number;
  currentSeedIndex: number;
  seedCount?: number;
}): Promise<EvalRecord[]> {
  const seedCount = input.seedCount ?? 10;
  const indices: number[] = [];
  for (let i = 0; i < seedCount; i += 1) {
    if (i !== input.currentSeedIndex) indices.push(i);
  }
  const records: EvalRecord[] = [];
  // Sequential to keep Python invocation overhead predictable; the
  // siblingLibrary is built once per episode (not per agent call).
  for (const seedIndex of indices) {
    const instance = await introspectTemplate({
      paths: input.paths,
      topic: input.topic,
      templateIndex: input.templateIndex,
      seedIndex,
    });
    records.push(renderRecord(instance));
  }
  return records;
}

/**
 * Build the mount adapter for a (topic, templateIndex, currentSeedIndex)
 * triple. Returns a ready-to-install EvalRecordsMount whose `records`
 * collection contains the sibling library.
 */
export async function buildFinChainMount(input: {
  paths: IntrospectorPaths;
  topic: string;
  templateIndex: number;
  currentSeedIndex: number;
  mountId?: string;
  seedCount?: number;
}): Promise<EvalRecordsMount> {
  const records = await buildSiblingLibrary(input);
  const mountId = input.mountId ?? `finchain-${familyForTopic(input.topic)}`;
  return new EvalRecordsMount(mountId, records);
}
