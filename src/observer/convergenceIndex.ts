// Goal-4 Change 3 — the convergence index.
//
// The MVP observer crystallised a helper from a SINGLE trajectory
// (PLAN.md / design.md §8.3: "the production form clusters >= 3
// trajectories before learning"). Goal 4 moves to convergence-gated
// crystallisation: an intent must recur across >= N trajectories before
// the substrate commits a learned interface to it. This is what makes
// the loop "learn from convergence, not from a one-off".
//
// The index is a per-tenant append-only JSONL at
//   <baseDir>/observer/<tenantId>/intent-index.jsonl
// One line per QUALIFYING template candidate the observer has seen
// (qualifying = passed every gate check except convergence + shape-hash
// dedup). POSIX `appendFile` is atomic for concurrent writers on a
// single host, so the 4-shard eval can append without a lock — each
// shard's families are disjoint, so within a family there is no race
// anyway, but append-only keeps it safe even if that changes.
//
// The eval harness carries this file across episodes the same way it
// carries the lib-cache (hydrate at episode start, persist at end), so
// "convergence" accrues over a family's e1..h1 run.

import { promises as fsp } from "node:fs";
import path from "node:path";

export interface ConvergenceEntry {
  // The data-shape-agnostic intent key (CallTemplate.intentSignature).
  intentSignature: string;
  // The originating trajectory.
  trajectoryId: string;
  // The syntactic shape hash — kept so the gate's existing shape-hash
  // dedup still works and so the analyzer can correlate the two keys.
  shapeHash: string;
  // The candidate template's user-facing name (for diagnostics).
  templateName: string;
  recordedAt: string;
}

function indexPath(baseDir: string, tenantId: string): string {
  return path.join(baseDir, "observer", tenantId, "intent-index.jsonl");
}

// Append one qualifying-candidate record. Best-effort: a failed append
// must not crash the observer (it is fire-and-forget from the snippet
// runtime). Creates the directory on first use.
export async function recordIntent(
  baseDir: string,
  tenantId: string,
  entry: Omit<ConvergenceEntry, "recordedAt">,
): Promise<void> {
  const file = indexPath(baseDir, tenantId);
  const record: ConvergenceEntry = {
    ...entry,
    recordedAt: new Date().toISOString(),
  };
  try {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.appendFile(file, JSON.stringify(record) + "\n", "utf8");
  } catch {
    // best-effort; convergence is hygiene, not correctness.
  }
}

// Read every recorded entry. Tolerates a missing file (returns []) and
// skips malformed lines (a torn concurrent append, in the worst case).
export async function readConvergenceIndex(
  baseDir: string,
  tenantId: string,
): Promise<ConvergenceEntry[]> {
  const file = indexPath(baseDir, tenantId);
  let text: string;
  try {
    text = await fsp.readFile(file, "utf8");
  } catch {
    return [];
  }
  const out: ConvergenceEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    try {
      out.push(JSON.parse(line) as ConvergenceEntry);
    } catch {
      // skip a torn line
    }
  }
  return out;
}

// How many DISTINCT trajectories have exhibited this intentSignature.
// Distinct-trajectory count, not raw line count: a single trajectory
// can contribute the same intentSignature through both its whole
// template and a sub-graph/nested template, and that should count once.
export async function intentConvergenceCount(
  baseDir: string,
  tenantId: string,
  intentSignature: string,
): Promise<number> {
  const entries = await readConvergenceIndex(baseDir, tenantId);
  const trajectories = new Set<string>();
  for (const e of entries) {
    if (e.intentSignature === intentSignature) {
      trajectories.add(e.trajectoryId);
    }
  }
  return trajectories.size;
}

// Convenience: the full intentSignature -> distinct-trajectory-count map.
// Used by the worker so it does not re-read the file once per candidate.
export async function convergenceCounts(
  baseDir: string,
  tenantId: string,
): Promise<Map<string, number>> {
  const entries = await readConvergenceIndex(baseDir, tenantId);
  const bySig = new Map<string, Set<string>>();
  for (const e of entries) {
    const set = bySig.get(e.intentSignature) ?? new Set<string>();
    set.add(e.trajectoryId);
    bySig.set(e.intentSignature, set);
  }
  const counts = new Map<string, number>();
  for (const [sig, trajs] of bySig) counts.set(sig, trajs.size);
  return counts;
}

// The convergence threshold N. Default 2 (the second convergent
// trajectory crystallises); production wants 3. Overridable via
// DATAFETCH_CONVERGENCE_N for experiments.
export function convergenceThreshold(): number {
  const raw = process.env["DATAFETCH_CONVERGENCE_N"];
  if (raw !== undefined) {
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed >= 1) return parsed;
  }
  return 2;
}
