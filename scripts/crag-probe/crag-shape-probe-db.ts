// CRAG shape probe — db.* modeling variant.
//
// Sibling of `crag-shape-probe.ts` (which used df.tool.* for CRAG mock APIs).
// This variant models CRAG mock APIs as queries against denormalised
// substrate collections:
//
//   df.db.cragFinance.companies.findExact({name: "Apple"})
//     → {name: "Apple", ticker: "AAPL", pe_ratio: 32.5, market_cap: 3.5e12}
//
// Question becomes one call instead of two; agent extracts the metric
// locally. The hypothesis (per kb/br/16 and kb/br/17's "modeling decision
// the probe forces" section) is that db modeling routes some CRAG question
// types onto richer substrate shapes that match recordToolFanout / similar.
//
// What this probe actually tests:
//   - Pure simple chain (Apple PE): 1 db call → signature `db`, no template
//   - Comparison (AAPL vs MSFT): 2 parallel db calls → signature `FANOUT(db)`
//   - Multi-hop (1994 Oscars): 2 sequential db calls → signature `FANOUT(db)`
//   - Aggregation (Hanks 90s): 1 db call + many local filter ops → signature
//     `db`, no template
//
// Run with:  pnpm tsx scripts/crag-probe/crag-shape-probe-db.ts

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
    tenantId: "crag-probe-db",
    question,
    mode: "novel",
    calls,
    createdAt: ISO,
  };
}

// ---------- db-modeled CRAG trajectories ---------------------------------

// A1. SIMPLE — "What is Apple's PE ratio?"
// One db.findExact call returns the whole company row; agent extracts .pe_ratio locally.
function simpleAppleTraj(): TrajectoryRecord {
  return trajectory(
    "db-simple-apple-pe",
    "What is Apple's PE ratio?",
    [
      call(0, "db.cragFinanceCompanies.findExact",
        { name: "Apple" },
        [{ name: "Apple", ticker: "AAPL", pe_ratio: 32.5, market_cap: 3.5e12 }]),
    ],
  );
}

// A2. SIMPLE — sibling, same shape, different entity.
function simpleMsftTraj(): TrajectoryRecord {
  return trajectory(
    "db-simple-msft-pe",
    "What is Microsoft's PE ratio?",
    [
      call(0, "db.cragFinanceCompanies.findExact",
        { name: "Microsoft" },
        [{ name: "Microsoft", ticker: "MSFT", pe_ratio: 35.2, market_cap: 3.1e12 }]),
    ],
  );
}

// B. COMPARISON — "Which has higher market cap, Apple or Microsoft?"
// Two parallel db lookups (could be Promise.all in agent code).
function comparisonTraj(): TrajectoryRecord {
  return trajectory(
    "db-comparison-aapl-msft",
    "Which has higher market cap, Apple or Microsoft?",
    [
      call(0, "db.cragFinanceCompanies.findExact",
        { name: "Apple" },
        [{ name: "Apple", market_cap: 3.5e12 }]),
      call(1, "db.cragFinanceCompanies.findExact",
        { name: "Microsoft" },
        [{ name: "Microsoft", market_cap: 3.1e12 }]),
    ],
  );
}

// C. MULTI-HOP — "Who directed the movie that won Best Picture in 1994?"
// Sequential chain: year → extract winner → movie.
function multiHopTraj(): TrajectoryRecord {
  return trajectory(
    "db-multihop-oscars-1994",
    "Who directed the movie that won Best Picture in 1994?",
    [
      call(0, "db.cragMovieYears.findExact",
        { year: "1994" },
        [{ year: "1994", best_picture: "Forrest Gump" }]),
      call(1, "db.cragMovieTitles.findExact",
        { title: "Forrest Gump" },
        [{ title: "Forrest Gump", director: "Robert Zemeckis", year: 1994 }]),
    ],
  );
}

// D. FALSE-PREMISE — single call, local validation.
function falsePremiseTraj(): TrajectoryRecord {
  return trajectory(
    "db-false-premise-ruth-cubs",
    "When did Babe Ruth play for the Chicago Cubs?",
    [
      call(0, "db.cragSportsPlayers.findExact",
        { name: "Babe Ruth" },
        [{ name: "Babe Ruth",
           teams: [
             { team: "Boston Red Sox", years: "1914-1919" },
             { team: "New York Yankees", years: "1920-1934" },
             { team: "Boston Braves", years: "1935" },
           ] }]),
    ],
  );
}

// E. AGGREGATION — "How many movies did Tom Hanks star in during the 1990s?"
// Single db.find returns the filmography; agent filters locally.
function aggregationTraj(): TrajectoryRecord {
  return trajectory(
    "db-aggregation-hanks-90s",
    "How many movies did Tom Hanks star in during the 1990s?",
    [
      call(0, "db.cragMoviePersons.findExact",
        { name: "Tom Hanks" },
        [{ name: "Tom Hanks", filmography: [
          { title: "A League of Their Own", year: 1992 },
          { title: "Sleepless in Seattle", year: 1993 },
          { title: "Philadelphia", year: 1993 },
          { title: "Forrest Gump", year: 1994 },
          { title: "Apollo 13", year: 1995 },
          { title: "Toy Story", year: 1995 },
          { title: "That Thing You Do!", year: 1996 },
          { title: "Saving Private Ryan", year: 1998 },
          { title: "You've Got Mail", year: 1998 },
          { title: "The Green Mile", year: 1999 },
        ] }]),
    ],
  );
}

// F. ENRICHED MULTI-HOP — "What is the market cap of the company whose CEO is Tim Cook?"
// db lookup of CEOs collection → extract company → db lookup of companies.
// 2 db calls sequential, dependent. This is the structurally-rich case
// where db modeling MIGHT give different leverage than tool modeling.
function enrichedMultiHopTraj(): TrajectoryRecord {
  return trajectory(
    "db-enriched-multihop-cook-cap",
    "What is the market cap of the company whose CEO is Tim Cook?",
    [
      call(0, "db.cragFinanceCeos.findExact",
        { name: "Tim Cook" },
        [{ name: "Tim Cook", company: "Apple Inc.", ticker: "AAPL" }]),
      call(1, "db.cragFinanceCompanies.findExact",
        { ticker: "AAPL" },
        [{ ticker: "AAPL", name: "Apple Inc.", market_cap: 3.5e12 }]),
    ],
  );
}

// ---------- probe runner -------------------------------------------------

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

async function main(): Promise<void> {
  if (!process.env["DATAFETCH_INTERFACE_MODE"]) {
    process.env["DATAFETCH_INTERFACE_MODE"] = "legacy";
  }
  const baseDir = path.join(
    "/tmp",
    `crag-probe-db-${process.pid}-${Date.now()}`,
  );
  await fsp.mkdir(baseDir, { recursive: true });
  const resolver: LibraryResolver = new DiskLibraryResolver({ baseDir });

  const families: Array<[string, TrajectoryRecord]> = [
    ["A1. simple (Apple PE)              [1-call]", simpleAppleTraj()],
    ["A2. simple (MSFT PE) — sibling     [1-call]", simpleMsftTraj()],
    ["B.  comparison (AAPL vs MSFT)      [2-call db fanout]", comparisonTraj()],
    ["C.  multi-hop (1994 Oscars)        [2-call db chain]", multiHopTraj()],
    ["D.  false-premise (Ruth on Cubs)   [1-call]", falsePremiseTraj()],
    ["E.  aggregation (Hanks 90s)        [1-call, local filter]", aggregationTraj()],
    ["F.  enriched multi-hop (Tim Cook)  [2-call db chain dependent]", enrichedMultiHopTraj()],
  ];

  const rows: ProbeRow[] = [];
  for (const [name, traj] of families) {
    rows.push(await probeOne(name, traj, baseDir, resolver));
  }

  process.stdout.write("\n=== CRAG SHAPE PROBE — db.* MODELING ===\n");
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
