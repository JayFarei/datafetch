import { promises as fsp } from "node:fs";
import path from "node:path";

import { readFrontmatterHead } from "../sdk/frontmatter.js";
import type {
  Fn,
  FnSpec,
  LibraryEntry,
  LibraryResolver,
} from "../sdk/index.js";
import {
  renderSchemaBlock,
  renderSynopsisArg,
} from "../sdk/schemaRender.js";
import { hookManifestPath, listManifests, readManifest } from "../hooks/manifest.js";
import { hooksEnabled } from "../hooks/mode.js";
import type { HookCallability, HookMaturity, VfsHookManifest } from "../hooks/types.js";

export type LibraryFunctionKind = "tool" | "primitive";

export type RankedFunction = {
  name: string;
  kind: LibraryFunctionKind;
  score: number;
  intent: string;
  description?: string;
  governance?: LibraryFunctionGovernance;
  why: string[];
  invocation: string;
  sourcePath: string;
};

export type LibraryFunctionGovernance = {
  maturity: HookMaturity;
  callability: HookCallability;
  manifestPath: string;
  attempts: number;
  successes: number;
  replaysPassed: number;
  replaysFailed: number;
  quarantineReason?: string;
  quarantineMessage?: string;
};

export type LibraryFunctionDescription = {
  name: string;
  kind: LibraryFunctionKind;
  intent: string;
  description?: string;
  contract: Record<string, string>;
  governance?: LibraryFunctionGovernance;
  invocation: string;
  sourcePath: string;
  spec?: FnSpec<unknown, unknown>;
};

export type SearchLibraryArgs = {
  baseDir: string;
  tenantId: string;
  resolver: LibraryResolver;
  query: string;
  threshold?: number;
};

export type DescribeLibraryFunctionArgs = {
  baseDir: string;
  tenantId: string;
  resolver: LibraryResolver;
  name: string;
};

const SCORE_THRESHOLD = 0.25;
const SOURCE_HEAD_BYTES = 4096;

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "have",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "with",
]);

export async function searchLibrary(
  args: SearchLibraryArgs,
): Promise<RankedFunction[]> {
  const threshold = args.threshold ?? SCORE_THRESHOLD;
  const queryTokens = tokenise(args.query);
  if (queryTokens.size === 0) return [];

  // Hook callability filter:
  //   - Quarantined hooks are hidden unless DATAFETCH_HOOKS_SHOW_QUARANTINED=1.
  //   - When the diagnostic flag is set, surface quarantined hooks
  //     EVEN IF the underlying .ts file can't be loaded by the resolver
  //     (the manifest is the source of truth).
  //   - We carry the callability/maturity through to influence ranking
  //     (validated > draft > observed > quarantined).
  const showQuarantined = process.env["DATAFETCH_HOOKS_SHOW_QUARANTINED"] === "1";
  const hookIndex = new Map<string, VfsHookManifest>();
  if (hooksEnabled()) {
    const manifests = await listManifests(args.baseDir, args.tenantId);
    for (const m of manifests) {
      hookIndex.set(m.name, m);
    }
  }

  const entries = await args.resolver.list(args.tenantId);
  const scored = await Promise.all(
    entries.map(async (entry) => {
      const meta = await functionMetadata({
        baseDir: args.baseDir,
        tenantId: args.tenantId,
        name: entry.name,
      });
      return scoreEntry({
        entry,
        meta,
        queryTokens,
        hook: hookIndex.get(entry.name),
        baseDir: args.baseDir,
      });
    }),
  );

  const seen = new Set(scored.map((s) => s.name));
  let diagnostic: RankedFunction[] = [];
  if (hooksEnabled() && showQuarantined) {
    // Synthesise diagnostic entries for quarantined hooks whose
    // implementation file is unloadable — they never reach the resolver
    // list, but the operator asked to see them.
    for (const [name, hook] of hookIndex) {
      if (seen.has(name)) continue;
      if (hook.callability !== "quarantined") continue;
      const synthScore = scoreSynthetic(name, hook.intent, queryTokens);
      if (synthScore < threshold) continue;
      const governance = hookGovernance(args.baseDir, hook);
      diagnostic.push({
        name,
        kind: "primitive",
        score: synthScore,
        intent: hook.intent,
        governance,
        why: governanceWhy(governance),
        invocation: `df.lib.${name}(...) // quarantined`,
        sourcePath: "",
      });
    }
  }

  return [
    ...scored
      .filter((m) => m.score >= threshold)
      .filter((m) => {
        const hook = hookIndex.get(m.name);
        if (!hook) return true;
        if (hook.callability === "quarantined") return showQuarantined;
        return true;
      }),
    ...diagnostic,
  ].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ah = callabilityRank(hookIndex.get(a.name));
    const bh = callabilityRank(hookIndex.get(b.name));
    if (ah !== bh) return bh - ah;
    if (a.kind !== b.kind) return a.kind === "tool" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function scoreSynthetic(name: string, intent: string, queryTokens: Set<string>): number {
  const nameTokens = tokenise(name);
  const intentTokens = tokenise(intent);
  let overlap = 0;
  for (const t of queryTokens) {
    if (nameTokens.has(t) || intentTokens.has(t)) overlap += 1;
  }
  return overlap === 0 ? 0 : overlap / queryTokens.size;
}

// Higher is better. validated > draft > observed > quarantined > unknown.
function callabilityRank(hook: VfsHookManifest | undefined): number {
  if (!hook) return 1;
  if (hook.callability === "quarantined") return -1;
  if (hook.callability === "not-callable") return 0;
  if (hook.maturity === "validated-typescript" || hook.maturity === "provider-native") return 3;
  if (hook.callability === "callable-with-fallback") return 2;
  return 1;
}

export async function describeLibraryFunction(
  args: DescribeLibraryFunctionArgs,
): Promise<LibraryFunctionDescription | null> {
  const hook = hooksEnabled()
    ? await readHookGovernance(args.baseDir, args.tenantId, args.name)
    : undefined;
  const fn = await args.resolver.resolve(args.tenantId, args.name);
  if (!fn) {
    return hook
      ? describeManifestOnlyHook({
          baseDir: args.baseDir,
          tenantId: args.tenantId,
          name: args.name,
          governance: hook,
        })
      : null;
  }
  const meta = await functionMetadata({
    baseDir: args.baseDir,
    tenantId: args.tenantId,
    name: args.name,
  });
  return {
    name: args.name,
    kind: meta.kind,
    intent: fn.spec.intent,
    ...(meta.description ? { description: meta.description } : {}),
    contract: learnedContract(meta.fields),
    ...(hook ? { governance: hook } : {}),
    invocation: renderGovernedInvocation(renderInvocation(args.name, fn.spec), hook),
    sourcePath: meta.sourcePath,
    spec: fn.spec,
  };
}

export function renderManPage(desc: LibraryFunctionDescription): string {
  const lines: string[] = [];
  lines.push("NAME");
  lines.push(`       ${desc.name} - ${desc.intent}`);
  lines.push("KIND");
  lines.push(`       ${desc.kind}`);
  if (desc.description) {
    lines.push("DESCRIPTION");
    for (const line of desc.description.split("\n")) {
      lines.push(`       ${line}`);
    }
  }
  lines.push("SYNOPSIS");
  lines.push(
    desc.spec
      ? `       df.lib.${desc.name}(${renderSynopsisArg(desc.spec.input)})`
      : `       ${desc.invocation}`,
  );
  if (desc.spec) {
    lines.push("INPUT SCHEMA");
    lines.push(...renderSchemaBlock(desc.spec.input));
    lines.push("OUTPUT");
    lines.push(...renderSchemaBlock(desc.spec.output));
  }
  if (desc.spec && desc.spec.examples.length > 0) {
    lines.push("EXAMPLES");
    for (const example of desc.spec.examples) {
      const inputJson = jsonOneLine(example.input);
      const outputJson = jsonOneLine(example.output);
      lines.push(`       df.lib.${desc.name}(${inputJson}) => ${outputJson}`);
    }
  }
  if (Object.keys(desc.contract).length > 0) {
    lines.push("CONTRACT");
    for (const [key, value] of Object.entries(desc.contract)) {
      lines.push(`       ${key}: ${value}`);
    }
  }
  if (desc.governance) {
    lines.push("GOVERNANCE");
    for (const line of renderGovernanceLines(desc.governance)) {
      lines.push(`       ${line}`);
    }
  }
  lines.push("INVOCATION");
  lines.push(`       ${desc.invocation}`);
  lines.push("SOURCE");
  lines.push(`       ${desc.sourcePath}`);
  return `${lines.join("\n")}\n`;
}

export function renderAproposMatches(matches: RankedFunction[]): string {
  if (matches.length === 0) {
    return "(no matches)\n";
  }
  const maxName = Math.min(
    24,
    matches.reduce((m, x) => Math.max(m, x.name.length), 0),
  );
  const lines = matches.map((m) => {
    const padded = m.name.padEnd(maxName, " ");
    const governance = m.governance
      ? ` [${m.governance.callability}/${m.governance.maturity}]`
      : "";
    return `${padded} (${m.kind})${governance} - ${m.intent}`;
  });
  return `${lines.join("\n")}\n`;
}

type FunctionMetadata = {
  kind: LibraryFunctionKind;
  description: string | null;
  fields: Record<string, string>;
  sourcePath: string;
  sourceHead: string;
};

async function functionMetadata(args: {
  baseDir: string;
  tenantId: string;
  name: string;
}): Promise<FunctionMetadata> {
  const candidates = [
    path.join(args.baseDir, "lib", args.tenantId, `${args.name}.ts`),
    path.join(args.baseDir, "lib", "__seed__", `${args.name}.ts`),
  ];

  for (const file of candidates) {
    if (!(await isFile(file))) continue;
    const head = await readFrontmatterHead(file);
    return {
      kind: head.isTool ? "tool" : "primitive",
      description: head.description,
      fields: head.fields,
      sourcePath: file,
      sourceHead: await readHead(file, SOURCE_HEAD_BYTES),
    };
  }

  return {
    kind: "primitive",
    description: null,
    fields: {},
    sourcePath: path.join(args.baseDir, "lib", args.tenantId, `${args.name}.ts`),
    sourceHead: "",
  };
}

function learnedContract(fields: Record<string, string>): Record<string, string> {
  const keys = [
    "trajectory",
    "shape-hash",
    "source-hash",
    "promotion-state",
    "coverage-density",
    "step-count",
    "distinct-tools",
    "regal-gate-active",
    "replay-contract",
    "change-contract",
    "verifier",
    "rollback",
  ];
  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = fields[key];
    if (value !== undefined && value.length > 0 && value !== "|") {
      out[key] = value;
    }
  }
  return out;
}

function scoreEntry(args: {
  entry: LibraryEntry;
  meta: FunctionMetadata;
  queryTokens: Set<string>;
  hook: VfsHookManifest | undefined;
  baseDir: string;
}): RankedFunction {
  const { entry, meta, queryTokens } = args;
  const buckets: Array<{ label: string; tokens: Set<string>; weight: number }> = [
    { label: "name", tokens: tokenise(entry.name), weight: 0.9 },
    { label: "intent", tokens: tokenise(entry.spec.intent), weight: 1 },
    {
      label: "description",
      tokens: tokenise(meta.description ?? ""),
      weight: 1,
    },
    {
      label: "examples",
      tokens: tokenise(examplesText(entry.spec)),
      weight: 0.95,
    },
    {
      label: "source",
      tokens: tokenise(meta.sourceHead),
      weight: 0.55,
    },
  ];

  const combined = new Set<string>();
  for (const bucket of buckets) {
    for (const tok of bucket.tokens) combined.add(tok);
  }

  let score = Math.max(coverage(queryTokens, combined), jaccard(queryTokens, combined));
  const why: string[] = [];
  for (const bucket of buckets) {
    const cov = coverage(queryTokens, bucket.tokens);
    const jac = jaccard(queryTokens, bucket.tokens);
    const bucketScore = Math.max(cov, jac) * bucket.weight;
    if (bucketScore > score) score = bucketScore;
    const hits = intersection(queryTokens, bucket.tokens);
    if (hits.length > 0) {
      why.push(`${bucket.label}: ${hits.slice(0, 5).join(", ")}`);
    }
  }

  if (meta.kind === "tool" && score > 0) {
    score = Math.min(1, score + 0.05);
  }
  const governance = args.hook ? hookGovernance(args.baseDir, args.hook) : undefined;
  if (governance) {
    why.push(...governanceWhy(governance));
  }

  return {
    name: entry.name,
    kind: meta.kind,
    score,
    intent: entry.spec.intent,
    ...(meta.description ? { description: meta.description } : {}),
    ...(governance ? { governance } : {}),
    why,
    invocation: renderGovernedInvocation(renderInvocation(entry.name, entry.spec), governance),
    sourcePath: meta.sourcePath,
  };
}

function renderGovernedInvocation(
  invocation: string,
  governance: LibraryFunctionGovernance | undefined,
): string {
  if (!governance) return invocation;
  if (governance.callability === "callable" || governance.callability === "callable-with-fallback") {
    return invocation;
  }
  return `${invocation} // ${governance.callability}; inspect ${governance.manifestPath}`;
}

async function readHookGovernance(
  baseDir: string,
  tenantId: string,
  name: string,
): Promise<LibraryFunctionGovernance | undefined> {
  const manifest = await readManifest(baseDir, tenantId, name);
  return manifest ? hookGovernance(baseDir, manifest) : undefined;
}

async function describeManifestOnlyHook(args: {
  baseDir: string;
  tenantId: string;
  name: string;
  governance: LibraryFunctionGovernance;
}): Promise<LibraryFunctionDescription | null> {
  const manifest = await readManifest(args.baseDir, args.tenantId, args.name);
  if (!manifest) return null;
  return {
    name: args.name,
    kind: "primitive",
    intent: manifest.intent,
    contract: {},
    governance: args.governance,
    invocation: renderGovernedInvocation(`df.lib.${args.name}(...)`, args.governance),
    sourcePath: manifest.implementation.ref ?? args.governance.manifestPath,
  };
}

function hookGovernance(
  baseDir: string,
  manifest: VfsHookManifest,
): LibraryFunctionGovernance {
  return {
    maturity: manifest.maturity,
    callability: manifest.callability,
    manifestPath: hookManifestPath(baseDir, manifest.origin.tenantId, manifest.name),
    attempts: manifest.stats.attempts,
    successes: manifest.stats.successes,
    replaysPassed: manifest.stats.replaysPassed,
    replaysFailed: manifest.stats.replaysFailed,
    ...(manifest.quarantine?.reason ? { quarantineReason: manifest.quarantine.reason } : {}),
    ...(manifest.quarantine?.message ? { quarantineMessage: manifest.quarantine.message } : {}),
  };
}

function governanceWhy(governance: LibraryFunctionGovernance): string[] {
  const why = [
    `callability: ${governance.callability}`,
    `maturity: ${governance.maturity}`,
  ];
  if (governance.quarantineReason) {
    why.push(`quarantine: ${governance.quarantineReason}`);
  }
  return why;
}

function renderGovernanceLines(governance: LibraryFunctionGovernance): string[] {
  const lines = [
    `callability: ${governance.callability}`,
    `maturity: ${governance.maturity}`,
    `manifest: ${governance.manifestPath}`,
    `attempts: ${governance.attempts}`,
    `successes: ${governance.successes}`,
    `replaysPassed: ${governance.replaysPassed}`,
    `replaysFailed: ${governance.replaysFailed}`,
  ];
  if (governance.quarantineReason) {
    lines.push(`quarantineReason: ${governance.quarantineReason}`);
  }
  if (governance.quarantineMessage) {
    lines.push(`quarantineMessage: ${governance.quarantineMessage}`);
  }
  return lines;
}

function renderInvocation(name: string, spec: FnSpec<unknown, unknown>): string {
  const example = spec.examples[0];
  if (example !== undefined) {
    return `df.lib.${name}(${jsonOneLine(example.input)})`;
  }
  return `df.lib.${name}(${renderSynopsisArg(spec.input)})`;
}

function examplesText(spec: FnSpec<unknown, unknown>): string {
  const strings: string[] = [];
  for (const example of spec.examples) {
    collectStringValues(example.input, strings);
    collectStringValues(example.output, strings);
    strings.push(jsonOneLine(example.input));
  }
  return strings.join(" ");
}

function collectStringValues(value: unknown, into: string[]): void {
  if (typeof value === "string") {
    into.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStringValues(item, into);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectStringValues(v, into);
    }
  }
}

function tokenise(s: string): Set<string> {
  const tokens = s
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersectionCount = 0;
  for (const tok of a) if (b.has(tok)) intersectionCount += 1;
  const union = a.size + b.size - intersectionCount;
  return union === 0 ? 0 : intersectionCount / union;
}

function coverage(query: Set<string>, entry: Set<string>): number {
  if (query.size === 0) return 0;
  let intersectionCount = 0;
  for (const tok of query) if (entry.has(tok)) intersectionCount += 1;
  return intersectionCount / query.size;
}

function intersection(a: Set<string>, b: Set<string>): string[] {
  const out: string[] = [];
  for (const tok of a) {
    if (b.has(tok)) out.push(tok);
  }
  return out;
}

function jsonOneLine(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "...";
  }
}

async function isFile(file: string): Promise<boolean> {
  try {
    const st = await fsp.stat(file);
    return st.isFile();
  } catch {
    return false;
  }
}

async function readHead(file: string, maxBytes: number): Promise<string> {
  const fh = await fsp.open(file, "r");
  try {
    const buf = Buffer.alloc(maxBytes);
    const { bytesRead } = await fh.read(buf, 0, maxBytes, 0);
    return buf.subarray(0, bytesRead).toString("utf8");
  } catch {
    return "";
  } finally {
    await fh.close();
  }
}
