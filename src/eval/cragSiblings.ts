// CRAG sibling stream for the SaC PoC C4 track (live-prep #3).
//
// You chose "real CRAG text questions, grouped" for the sibling structure. For
// a crystallised helper to be REUSED (the research's 0/16-reuse blocker), the
// build question and the held-out question must share a composition shape. On
// the raw corpus the natural same-structure key is (domain, question_type) —
// the exact grouping the existing crag-harness sibling probe uses
// (run-iter8-sibling-probe.ts: domain==="movie" && questionType==="simple",
// per-family tenant, Q1 authors a helper, Q2+ warm-call it).
//
// This groups real CRAG rows into (domain, question_type) families, keeps those
// with enough members, and splits each into a BUILD set (where the helper
// crystallises) and a HELD-OUT set (where reuse should fire). The drift /
// staleness is injected at run time between build and held-out (the B-2
// mechanism); this module only defines the families.
//
// Pure + deterministic (input order preserved; families sorted by size then
// key), so the selection is reproducible and the manifest can pin it.

import type { CragRow } from "./cragCorpus.js";

export interface CragSiblingFamily {
  key: string; // `${domain}:${questionType}`
  domain: string;
  questionType: string;
  build: CragRow[]; // crystallise the helper on these
  heldOut: CragRow[]; // reuse should fire on these (the governance/drift target)
}

export interface SiblingOpts {
  // Minimum family members to qualify (default buildSize + heldOutSize).
  minFamily?: number;
  buildSize?: number; // default 2
  heldOutSize?: number; // default 1
  domains?: readonly string[];
  questionTypes?: readonly string[];
  // Exclude false-premise families (scored as the -1 governance cells via a
  // separate path; they have no "compose a retrieval" structure to reuse).
  excludeFalsePremise?: boolean;
  // Keep only the N most-populous families (highest reuse density first).
  maxFamilies?: number;
}

export function groupCragSiblings(
  rows: readonly CragRow[],
  opts: SiblingOpts = {},
): CragSiblingFamily[] {
  const buildSize = opts.buildSize ?? 2;
  const heldOutSize = opts.heldOutSize ?? 1;
  const minFamily = opts.minFamily ?? buildSize + heldOutSize;
  const domains = opts.domains ? new Set(opts.domains) : null;
  const types = opts.questionTypes ? new Set(opts.questionTypes) : null;

  const byKey = new Map<string, CragRow[]>();
  for (const r of rows) {
    if (opts.excludeFalsePremise && r.questionType === "false_premise") continue;
    if (domains && !domains.has(r.domain)) continue;
    if (types && !types.has(r.questionType)) continue;
    const key = `${r.domain}:${r.questionType}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(r);
    else byKey.set(key, [r]);
  }

  const families: CragSiblingFamily[] = [];
  for (const [key, members] of byKey) {
    if (members.length < minFamily) continue;
    const sep = key.indexOf(":");
    families.push({
      key,
      domain: key.slice(0, sep),
      questionType: key.slice(sep + 1),
      build: members.slice(0, buildSize),
      heldOut: members.slice(buildSize, buildSize + heldOutSize),
    });
  }
  // Most-populous families first (best reuse density), then stable by key.
  families.sort(
    (a, b) =>
      b.build.length + b.heldOut.length - (a.build.length + a.heldOut.length) ||
      a.key.localeCompare(b.key),
  );
  return opts.maxFamilies ? families.slice(0, opts.maxFamilies) : families;
}
