// CRAG shape probe — HYBRID db+tool modeling.
//
// Companion to crag-shape-probe.ts (which models everything as tool.*).
// This variant models the goal's hybrid surface: CRAG entity/ticker
// resolution as a `db.*` corpus lookup, and the finance metric mock-APIs
// as `tool.*`. Per the Stage-0 deep-research brief
// (runs/code-harness-evals/research/crag-finance-structure-scorer.md),
// ~56% of CRAG-Finance is the 2-call "Simple" shape:
//   finance_get_ticker_by_name(name) -> finance_get_<metric>(ticker)
// Under hybrid modeling that becomes:
//   db.cragFinance.companies.findExact({name}) -> tool.cragFinance.<metric>({ticker})
// i.e. a mixed `db -> tool` 2-call dependent chain.
//
// This probe is a ZERO-LLM red/green test for the Stage-0.5 substrate fix:
// it reports, for each shape, the intentSignature, the author outcome, and
// whether the authored helper body is a LITERAL CLONE (hardcodes a specific
// tool name) or a GENERIC intent-shaped body (reads toolBundle/toolNames
// from input). Before the fix the dominant Simple chain should author a
// literal clone (P1 landmine); after the fix it should author a generic
// body or cleanly refuse.
//
// Run with:  <repo>/node_modules/.bin/tsx scripts/crag-probe/crag-shape-probe-hybrid.ts
// (the worktree node_modules is empty; node resolves up to the parent repo.)

import { promises as fsp } from "node:fs";
import path from "node:path";

import { authorFunction } from "../../src/observer/author.js";
import {
  computeIntentSignature,
  extractTemplate,
  extractSubGraphTemplates,
} from "../../src/observer/template.js";
import { DiskLibraryResolver } from "../../src/snippet/library.js";
import type {
  LibraryResolver,
  PrimitiveCallRecord,
  TrajectoryRecord,
} from "../../src/sdk/index.js";

const ISO = new Date().toISOString();

function call(
  index: number,
  primitive: string,
  input: unknown,
  output: unknown,
): PrimitiveCallRecord {
  return { index, primitive, input, output, startedAt: ISO, durationMs: 1 };
}

function trajectory(
  id: string,
  question: string,
  calls: PrimitiveCallRecord[],
): TrajectoryRecord {
  return { id, tenantId: "crag-probe-hybrid", question, mode: "novel", calls, createdAt: ISO };
}

// A1. SIMPLE chain (45% of Finance) — "What is Apple's PE ratio?"
// db entity-resolution -> tool metric lookup. Mixed `db -> tool`.
function simpleChainApplePe(): TrajectoryRecord {
  return trajectory("hybrid-simple-apple-pe", "What is Apple's PE ratio?", [
    call(0, "db.cragFinance.companies.findExact",
      { name: "Apple" }, [{ ticker: "AAPL", name: "Apple Inc." }]),
    call(1, "tool.cragFinance.finance_get_pe_ratio",
      { ticker_name: "AAPL" }, { ticker: "AAPL", pe_ratio: 32.5 }),
  ]);
}

// A2. tightest sibling — same metric, different entity (should DEDUP on shapeHash).
function simpleChainMsftPe(): TrajectoryRecord {
  return trajectory("hybrid-simple-msft-pe", "What is Microsoft's PE ratio?", [
    call(0, "db.cragFinance.companies.findExact",
      { name: "Microsoft" }, [{ ticker: "MSFT", name: "Microsoft Corporation" }]),
    call(1, "tool.cragFinance.finance_get_pe_ratio",
      { ticker_name: "MSFT" }, { ticker: "MSFT", pe_ratio: 35.2 }),
  ]);
}

// A3. sibling — DIFFERENT metric (the correctness landmine case).
function simpleChainMsftCap(): TrajectoryRecord {
  return trajectory("hybrid-simple-msft-cap", "What is Microsoft's market cap?", [
    call(0, "db.cragFinance.companies.findExact",
      { name: "Microsoft" }, [{ ticker: "MSFT", name: "Microsoft Corporation" }]),
    call(1, "tool.cragFinance.finance_get_market_capitalization",
      { ticker_name: "MSFT" }, { ticker: "MSFT", market_cap: 3.1e12 }),
  ]);
}

// B. COMPARISON (14%) — "Which has higher market cap, Apple or Microsoft?"
// db fan-out (2 entities) + tool fan-out (2 metric calls). Mixed FANOUT(db)->FANOUT(tool).
function comparison(): TrajectoryRecord {
  return trajectory("hybrid-comparison-cap", "Which has higher market cap, Apple or Microsoft?", [
    call(0, "db.cragFinance.companies.findExact", { name: "Apple" }, [{ ticker: "AAPL" }]),
    call(1, "db.cragFinance.companies.findExact", { name: "Microsoft" }, [{ ticker: "MSFT" }]),
    call(2, "tool.cragFinance.finance_get_market_capitalization", { ticker_name: "AAPL" }, { market_cap: 3.5e12 }),
    call(3, "tool.cragFinance.finance_get_market_capitalization", { ticker_name: "MSFT" }, { market_cap: 3.1e12 }),
  ]);
}

// E. AGGREGATION (7%) — one entity-resolution + tool fan-out over a metric set.
function aggregation(): TrajectoryRecord {
  return trajectory("hybrid-aggregation-divs", "Total dividends Apple paid across its share classes?", [
    call(0, "db.cragFinance.companies.findExact", { name: "Apple" }, [{ ticker: "AAPL" }, { ticker: "AAPL.PR" }]),
    call(1, "tool.cragFinance.finance_get_dividends_history", { ticker_name: "AAPL" }, { total: 100 }),
    call(2, "tool.cragFinance.finance_get_dividends_history", { ticker_name: "AAPL.PR" }, { total: 5 }),
  ]);
}

type Row = {
  family: string;
  callCount: number;
  primitiveSequence: string[];
  intentSignature: string;
  subgraphCount: number;
  subgraphSignatures: string[];
  authorOutcome: string;
  authorDetail: string;
  bodyKind: string; // "literal-clone" | "generic-intent-shape" | "n/a"
  hardcodedTools: string[];
};

function classifyBody(source: string): { bodyKind: string; hardcodedTools: string[] } {
  // Generic intent-shape bodies index df.tool dynamically: df.tool[toolBundle][toolName]
  // or df.tool[plan.toolBundle]. Literal clones name the tool directly:
  // df.tool.cragFinance.finance_get_pe_ratio(...) or df.tool.cragFinance["finance_get_..."].
  const dynamicIndex = /df\.tool\[[^\]]+\]\[[^\]]+\]|df\.tool\[\s*(?:plan\.|input\.)?toolBundle/.test(source);
  const hardcoded = [
    ...source.matchAll(/df\.tool\.cragFinance\.(finance_get_[a-z_]+)/g),
    ...source.matchAll(/df\.tool\.cragFinance\["(finance_get_[a-z_]+)"\]/g),
  ].map((m) => m[1]!).filter((v, i, a) => a.indexOf(v) === i);
  if (hardcoded.length > 0 && !dynamicIndex) return { bodyKind: "literal-clone", hardcodedTools: hardcoded };
  if (dynamicIndex) return { bodyKind: "generic-intent-shape", hardcodedTools: [] };
  return { bodyKind: "other", hardcodedTools: hardcoded };
}

async function probeOne(
  family: string,
  traj: TrajectoryRecord,
  baseDir: string,
  resolver: LibraryResolver,
): Promise<Row> {
  const primSeq = traj.calls.map((c) => c.primitive);
  const intentSig = computeIntentSignature(traj.calls);
  const base: Row = {
    family, callCount: traj.calls.length, primitiveSequence: primSeq,
    intentSignature: intentSig, subgraphCount: 0, subgraphSignatures: [],
    authorOutcome: "skipped", authorDetail: "", bodyKind: "n/a", hardcodedTools: [],
  };
  if (traj.calls.length < 2) {
    return { ...base, authorDetail: "trajectory has <2 calls" };
  }
  const template = extractTemplate(traj);
  const subgraphs = extractSubGraphTemplates(traj);
  base.subgraphCount = subgraphs.length;
  base.subgraphSignatures = subgraphs.map((s) => `${s.name}=${s.intentSignature}`);
  const author = await authorFunction({
    tenantId: traj.tenantId, baseDir, trajectory: traj, template,
    libraryResolver: resolver, codifierSkill: null,
  });
  if (author.kind === "authored") {
    let source = "";
    try { source = await fsp.readFile(author.path, "utf8"); } catch { /* ignore */ }
    const { bodyKind, hardcodedTools } = classifyBody(source);
    return {
      ...base, authorOutcome: "authored",
      authorDetail: `name=${author.name}; ${path.relative(baseDir, author.path)}`,
      bodyKind, hardcodedTools,
    };
  }
  return { ...base, authorOutcome: "skipped", authorDetail: author.reason };
}

async function main(): Promise<void> {
  if (!process.env["DATAFETCH_INTERFACE_MODE"]) process.env["DATAFETCH_INTERFACE_MODE"] = "legacy";
  const baseDir = path.join("/tmp", `crag-probe-hybrid-${process.pid}-${Date.now()}`);
  await fsp.mkdir(baseDir, { recursive: true });
  const resolver: LibraryResolver = new DiskLibraryResolver({ baseDir });

  const families: Array<[string, TrajectoryRecord]> = [
    ["A1. SIMPLE chain (45%) Apple PE         [cold]", simpleChainApplePe()],
    ["A2. SIMPLE sibling MSFT PE (same metric) [dedup?]", simpleChainMsftPe()],
    ["A3. SIMPLE sibling MSFT cap (diff metric)[landmine?]", simpleChainMsftCap()],
    ["B.  COMPARISON (14%) cap                 ", comparison()],
    ["E.  AGGREGATION (7%) dividends           ", aggregation()],
  ];

  const rows: Row[] = [];
  for (const [name, traj] of families) rows.push(await probeOne(name, traj, baseDir, resolver));

  process.stdout.write("\n=== CRAG HYBRID (db+tool) SHAPE PROBE ===\n");
  process.stdout.write(`baseDir: ${baseDir}\n\n`);
  for (const r of rows) {
    process.stdout.write(`> ${r.family}\n`);
    process.stdout.write(`  calls (${r.callCount}): ${r.primitiveSequence.join(" -> ")}\n`);
    process.stdout.write(`  intentSignature: ${r.intentSignature}\n`);
    if (r.subgraphCount > 0) process.stdout.write(`  subgraphs (${r.subgraphCount}): ${r.subgraphSignatures.join(", ")}\n`);
    process.stdout.write(`  author: ${r.authorOutcome} — ${r.authorDetail}\n`);
    if (r.authorOutcome === "authored") {
      process.stdout.write(`  bodyKind: ${r.bodyKind}${r.hardcodedTools.length ? ` (hardcoded: ${r.hardcodedTools.join(", ")})` : ""}\n`);
    }
    process.stdout.write("\n");
  }

  process.stdout.write("=== MACHINE SUMMARY (JSON) ===\n");
  process.stdout.write(JSON.stringify({
    baseDir,
    rows: rows.map((r) => ({
      family: r.family.trim(), callCount: r.callCount, intentSignature: r.intentSignature,
      subgraphCount: r.subgraphCount, authorOutcome: r.authorOutcome, bodyKind: r.bodyKind,
      hardcodedTools: r.hardcodedTools,
    })),
  }, null, 2));
  process.stdout.write("\n");
}

main().catch((err) => {
  process.stderr.write(`probe crashed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
