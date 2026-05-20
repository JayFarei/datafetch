// CRAG shape probe — empirical test of whether the substrate's existing
// intent-signature extractor + authorFunction can crystallise CRAG-shaped
// trajectories, without requiring an LLM, the CRAG Python server, or the
// real mock-API corpus.
//
// Mirrors the pattern used by `src/observer/__smoke__/cross-shape-transfer.ts`:
// hand-construct TrajectoryRecord objects matching the call patterns that a
// CRAG-running agent would produce, then feed them through the live
// `extractTemplate` + `authorFunction` pipeline and report what comes out.
//
// Run with:  pnpm tsx scripts/crag-probe/crag-shape-probe.ts

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

// ---------- helpers --------------------------------------------------------

function call(
  index: number,
  primitive: string,
  input: unknown,
  output: unknown,
): PrimitiveCallRecord {
  return {
    index,
    primitive,
    input,
    output,
    startedAt: ISO,
    durationMs: 1,
  };
}

function trajectory(
  id: string,
  question: string,
  calls: PrimitiveCallRecord[],
): TrajectoryRecord {
  return {
    id,
    tenantId: "crag-probe",
    question,
    mode: "novel",
    calls,
    createdAt: ISO,
  };
}

// ---------- CRAG-shaped trajectories ---------------------------------------
//
// Each builder is a CRAG question category from the dataset. Inputs/outputs
// are realistic enough that the substrate's `consumesEarlierOutput` heuristic
// will see chain dependencies; the trajectory is otherwise minimal.

// A. SIMPLE-CHAIN — "What is Apple's PE ratio?"
// Two dependent sequential calls. Different tool names, different inputs.
function simpleChainAppleTraj(): TrajectoryRecord {
  return trajectory(
    "simple-chain-apple",
    "What is Apple's PE ratio?",
    [
      call(0,
        "tool.cragFinance.getTickerByName",
        { query: "Apple" },
        { ticker: "AAPL", company_name: "Apple Inc." }),
      call(1,
        "tool.cragFinance.getPeRatio",
        { tickerName: "AAPL" },
        { ticker: "AAPL", pe_ratio: 32.5 }),
    ],
  );
}

// Sibling for warm-call test: same shape, different entity + metric.
function simpleChainMicrosoftTraj(): TrajectoryRecord {
  return trajectory(
    "simple-chain-msft",
    "What is Microsoft's market cap?",
    [
      call(0,
        "tool.cragFinance.getTickerByName",
        { query: "Microsoft" },
        { ticker: "MSFT", company_name: "Microsoft Corporation" }),
      call(1,
        "tool.cragFinance.getMarketCapitalization",
        { tickerName: "MSFT" },
        { ticker: "MSFT", market_cap: 3.1e12 }),
    ],
  );
}

// Tighter sibling: same tools, same param names, different entity. This is
// the maximum-similarity sibling — if THIS doesn't warm, nothing does.
function simpleChainMicrosoftPeTraj(): TrajectoryRecord {
  return trajectory(
    "simple-chain-msft-pe",
    "What is Microsoft's PE ratio?",
    [
      call(0,
        "tool.cragFinance.getTickerByName",
        { query: "Microsoft" },
        { ticker: "MSFT" }),
      call(1,
        "tool.cragFinance.getPeRatio",
        { tickerName: "MSFT" },
        { ticker: "MSFT", pe_ratio: 35.2 }),
    ],
  );
}

// B. COMPARISON — "Which has higher market cap, Apple or Microsoft?"
// Two parallel ticker lookups + two parallel cap lookups. Classic FANOUT.
function comparisonTraj(): TrajectoryRecord {
  return trajectory(
    "comparison-aapl-msft",
    "Which has higher market cap, Apple or Microsoft?",
    [
      call(0, "tool.cragFinance.getTickerByName",
        { query: "Apple" }, { ticker: "AAPL" }),
      call(1, "tool.cragFinance.getTickerByName",
        { query: "Microsoft" }, { ticker: "MSFT" }),
      call(2, "tool.cragFinance.getMarketCapitalization",
        { tickerName: "AAPL" }, { ticker: "AAPL", market_cap: 3.5e12 }),
      call(3, "tool.cragFinance.getMarketCapitalization",
        { tickerName: "MSFT" }, { ticker: "MSFT", market_cap: 3.1e12 }),
    ],
  );
}

// C. MULTI-HOP — "Who directed the movie that won Best Picture in 1994?"
// Sequential chain: year info → extract winner → movie info.
function multiHopTraj(): TrajectoryRecord {
  return trajectory(
    "multihop-oscars-1994",
    "Who directed the movie that won Best Picture in 1994?",
    [
      call(0, "tool.cragMovie.getYearInfo",
        { year: "1994" },
        { year: "1994", oscar_best_picture: "Forrest Gump" }),
      call(1, "tool.cragMovie.getMovieInfo",
        { movieName: "Forrest Gump" },
        { title: "Forrest Gump", director: "Robert Zemeckis", year: 1994 }),
    ],
  );
}

// D. FALSE-PREMISE — "When did Babe Ruth play for the Chicago Cubs?"
// Single tool call + local validation. Local validation does NOT produce
// a primitive call record (it's pure TS), so the trajectory has 1 call.
function falsePremiseTraj(): TrajectoryRecord {
  return trajectory(
    "false-premise-babe-ruth-cubs",
    "When did Babe Ruth play for the Chicago Cubs?",
    [
      call(0, "tool.cragSports.getPlayerCareer",
        { name: "Babe Ruth" },
        { name: "Babe Ruth",
          teams: [
            { team: "Boston Red Sox", years: "1914-1919" },
            { team: "New York Yankees", years: "1920-1934" },
            { team: "Boston Braves", years: "1935" },
          ] }),
    ],
  );
}

// E. AGGREGATION — "How many movies did Tom Hanks star in during the 1990s?"
// One person lookup + a fan-out over candidate movies for year confirmation.
function aggregationTraj(): TrajectoryRecord {
  const personLookup = call(0, "tool.cragMovie.getPersonInfo",
    { personName: "Tom Hanks" },
    { name: "Tom Hanks", filmography: ["A League of Their Own", "Sleepless in Seattle", "Philadelphia", "Forrest Gump", "Apollo 13", "Toy Story", "That Thing You Do!", "Saving Private Ryan", "You've Got Mail", "The Green Mile"] });
  const movieCalls = personLookup.output && typeof personLookup.output === "object"
    ? (personLookup.output as { filmography: string[] }).filmography.map((m, i) =>
        call(i + 1, "tool.cragMovie.getMovieInfo",
          { movieName: m },
          { title: m, year: 1990 + (i % 10) }))
    : [];
  return trajectory(
    "aggregation-tom-hanks-1990s",
    "How many movies did Tom Hanks star in during the 1990s?",
    [personLookup, ...movieCalls],
  );
}

// ---------- main probe -----------------------------------------------------

type ProbeRow = {
  family: string;
  question: string;
  callCount: number;
  primitiveSequence: string[];
  intentSignature: string;
  subgraphCount: number;
  subgraphSignatures: string[];
  authorOutcome: string;
  authorDetail: string;
};

async function probeOne(
  family: string,
  traj: TrajectoryRecord,
  baseDir: string,
  resolver: LibraryResolver,
): Promise<ProbeRow> {
  const primSeq = traj.calls.map((c) => c.primitive);
  const intentSig = computeIntentSignature(traj.calls);

  // Trajectories with <2 calls can't produce a template.
  if (traj.calls.length < 2) {
    return {
      family,
      question: traj.question,
      callCount: traj.calls.length,
      primitiveSequence: primSeq,
      intentSignature: intentSig,
      subgraphCount: 0,
      subgraphSignatures: [],
      authorOutcome: "skipped",
      authorDetail: "trajectory has <2 calls — extractTemplate requires ≥2",
    };
  }

  const template = extractTemplate(traj);
  const subgraphs = extractSubGraphTemplates(traj);
  const subgraphSigs = subgraphs.map((s) => `${s.name}=${s.intentSignature}`);

  const author = await authorFunction({
    tenantId: traj.tenantId,
    baseDir,
    trajectory: traj,
    template,
    libraryResolver: resolver,
    codifierSkill: null,
  });

  if (author.kind === "authored") {
    return {
      family,
      question: traj.question,
      callCount: traj.calls.length,
      primitiveSequence: primSeq,
      intentSignature: intentSig,
      subgraphCount: subgraphs.length,
      subgraphSignatures: subgraphSigs,
      authorOutcome: "authored",
      authorDetail: `name=${author.name}; ${path.relative(baseDir, author.path)}`,
    };
  }

  return {
    family,
    question: traj.question,
    callCount: traj.calls.length,
    primitiveSequence: primSeq,
    intentSignature: intentSig,
    subgraphCount: subgraphs.length,
    subgraphSignatures: subgraphSigs,
    authorOutcome: "skipped",
    authorDetail: author.reason,
  };
}

async function tryReuseChain(
  baseDir: string,
  resolver: LibraryResolver,
  helperName: string,
): Promise<{ resolved: boolean; invokeOk?: boolean; output?: unknown; error?: string }> {
  const fn = await resolver.resolve("crag-probe", helperName);
  if (!fn) return { resolved: false };

  // Stub df.tool on globalThis the way the helper body expects.
  const calls: Array<{ tool: string; input: unknown }> = [];
  const stub = (tool: string) =>
    async (input: Record<string, unknown>): Promise<unknown> => {
      calls.push({ tool, input });
      // Return a structurally-shaped response so the helper's
      // result-shaping doesn't crash on undefined fields.
      return { tool, ok: true, ...input };
    };
  const priorDf = (globalThis as Record<string, unknown>)["df"];
  (globalThis as Record<string, unknown>)["df"] = {
    tool: {
      cragFinance: {
        getTickerByName: stub("getTickerByName"),
        getPeRatio: stub("getPeRatio"),
        getMarketCapitalization: stub("getMarketCapitalization"),
      },
    },
  };

  try {
    // Two attempts — once with the original-shape input, once with intent-shape.
    // The Phase 4 pivot says the helper expects {intent, limit?} + planner-
    // populated internal plan. Without a planner the call should return
    // {error: "missing_internal_plan"} rather than throwing.
    // Fn is callable directly (src/sdk/fn.ts: `Fn = ((input, ctx?) => Promise<Result<O>>) & {spec, name}`).
    // Try TWO inputs:
    //   (1) the exact shape the helper was authored from (warm-call SHOULD work)
    //   (2) intent-shape (warm-call SHOULD NOT work yet — no planner)
    const out1 = await (fn as unknown as (input: unknown) => Promise<unknown>)({
      query: "Microsoft",
      tickerName: "MSFT",
    });
    let intentShapeError: string | null = null;
    try {
      await (fn as unknown as (input: unknown) => Promise<unknown>)({
        intent: "company financial metric",
        company: "Microsoft",
        metric: "pe_ratio",
      });
    } catch (err) {
      intentShapeError = err instanceof Error ? err.message : String(err);
    }
    return {
      resolved: true,
      invokeOk: true,
      output: { dataShapeOutput: out1, intentShapeFailed: intentShapeError },
    };
  } catch (err) {
    return {
      resolved: true,
      invokeOk: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    (globalThis as Record<string, unknown>)["df"] = priorDf;
  }
}

async function main(): Promise<void> {
  if (!process.env["DATAFETCH_INTERFACE_MODE"]) {
    process.env["DATAFETCH_INTERFACE_MODE"] = "legacy";
  }
  const baseDir = path.join(
    "/tmp",
    `crag-probe-${process.pid}-${Date.now()}`,
  );
  await fsp.mkdir(baseDir, { recursive: true });
  const resolver: LibraryResolver = new DiskLibraryResolver({ baseDir });

  const families: Array<[string, TrajectoryRecord]> = [
    ["A1. simple-chain (Apple PE)                    [cold]", simpleChainAppleTraj()],
    ["A2. simple-chain (MSFT PE) — same tools        [warm?]", simpleChainMicrosoftPeTraj()],
    ["A3. simple-chain (MSFT cap) — different metric [warm?]", simpleChainMicrosoftTraj()],
    ["B.  comparison (AAPL vs MSFT)",                            comparisonTraj()],
    ["C.  multi-hop (1994 Oscars)",                              multiHopTraj()],
    ["D.  false-premise (Ruth on Cubs)",                         falsePremiseTraj()],
    ["E.  aggregation (Hanks 90s)",                              aggregationTraj()],
  ];

  const rows: ProbeRow[] = [];
  for (const [name, traj] of families) {
    rows.push(await probeOne(name, traj, baseDir, resolver));
  }

  // ----- print human report -----
  process.stdout.write("\n=== CRAG SHAPE PROBE ===\n");
  process.stdout.write(`baseDir: ${baseDir}\n\n`);

  for (const r of rows) {
    process.stdout.write(`▶ ${r.family}\n`);
    process.stdout.write(`  Q: ${r.question}\n`);
    process.stdout.write(`  calls (${r.callCount}): ${r.primitiveSequence.join(" → ")}\n`);
    process.stdout.write(`  intentSignature: ${r.intentSignature}\n`);
    if (r.subgraphCount > 0) {
      process.stdout.write(`  subgraphs (${r.subgraphCount}): ${r.subgraphSignatures.join(", ")}\n`);
    }
    process.stdout.write(`  author: ${r.authorOutcome} — ${r.authorDetail}\n\n`);
  }

  // ----- reuse probe -----
  // Take the FIRST authored helper and try invoking it under a different
  // entity to see whether the helper actually fires warm or returns
  // missing_internal_plan (the expected behaviour per the intent-shape
  // pivot when no planner is wired).
  const authored = rows.find((r) => r.authorOutcome === "authored");
  if (authored) {
    const helperName = authored.authorDetail.match(/name=(\S+);/)?.[1] ?? "?";
    process.stdout.write("=== REUSE PROBE (warm invocation) ===\n");
    process.stdout.write(`helper: ${helperName}\n`);
    const reuse = await tryReuseChain(baseDir, resolver, helperName);
    if (!reuse.resolved) {
      process.stdout.write("  helper failed to resolve from disk\n");
    } else if (reuse.invokeOk) {
      process.stdout.write("  invoke OK\n");
      process.stdout.write(`  output: ${JSON.stringify(reuse.output).slice(0, 200)}\n`);
    } else {
      process.stdout.write(`  invoke threw: ${reuse.error}\n`);
    }
  } else {
    process.stdout.write("=== REUSE PROBE ===\n");
    process.stdout.write("  no helper authored — skipping reuse probe\n");
  }

  // ----- machine-readable summary -----
  process.stdout.write("\n=== MACHINE SUMMARY (JSON) ===\n");
  process.stdout.write(JSON.stringify(
    {
      baseDir,
      rows: rows.map((r) => ({
        family: r.family,
        callCount: r.callCount,
        intentSignature: r.intentSignature,
        subgraphCount: r.subgraphCount,
        authorOutcome: r.authorOutcome,
      })),
    },
    null,
    2,
  ));
  process.stdout.write("\n");
}

main().catch((err) => {
  process.stderr.write(`probe crashed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
