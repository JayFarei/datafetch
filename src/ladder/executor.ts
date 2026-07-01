// Deterministic executor with MEASURED turn counting (C1).
//
// A "turn" is one executor round-trip that touches the store: reading a page of
// a source collection, or reading one derived index. Turns are counted by the
// instrumented ExecContext as the scripted policy runs — never assigned as a
// constant. This is what makes the exposed/masked cost comparison honest: the
// inline (masked) path pages through the whole collection (many turns) while an
// index-backed procedure reads one aggregate (one turn).

import { makeAbstain } from "./answerContract.js";
import type { MountedSnapshot } from "./snapshot.js";
import type { Task } from "./tasks.js";
import type { Answer, Arm } from "./types.js";

export const PAGE_SIZE = 8;

/** Sentinel: a procedure that contributes nothing to the answer this turn. */
export const PASS = Symbol("ladder.pass");
export type ProcResult = Answer | typeof PASS;

/**
 * Instrumented execution context. Every store access increments `turns`. The
 * policy can only reach the snapshot through these methods, so the turn count
 * is a faithful measurement of the work performed.
 */
export class ExecContext {
  turns = 0;
  constructor(
    readonly snapshot: MountedSnapshot,
    readonly pageSize = PAGE_SIZE,
  ) {}

  get sourceFingerprint(): string {
    return this.snapshot.sourceFingerprint;
  }

  /** Page through an entire source collection; one turn per page read. */
  scanAll(collection: string): Record<string, unknown>[] {
    const all = this.snapshot.collections[collection] ?? [];
    const pages = Math.max(1, Math.ceil(all.length / this.pageSize));
    for (let p = 0; p < pages; p++) this.turns += 1;
    return all;
  }

  /** Read one derived index; one turn. Returns undefined if absent. */
  readIndex(name: string) {
    this.turns += 1;
    return this.snapshot.indexes[name];
  }
}

/**
 * A procedure is a runnable step in the exposed answer pipeline. It either
 * returns a terminal Answer or PASSes (contributing nothing). Curated seeds are
 * index-backed procedures; control fixtures are shims (always PASS) or
 * degenerate answers.
 */
export interface Procedure {
  id: string;
  run(ctx: ExecContext, task: Task): ProcResult;
}

/** The honest inline computation — the masked-arm baseline. */
export function executeInline(
  task: Task,
  snapshot: MountedSnapshot,
): { answer: Answer; turns: number; drifted: boolean } {
  const ctx = new ExecContext(snapshot);
  const records = ctx.scanAll(task.sourceCollection);
  return { answer: task.reduceRecords(records), turns: ctx.turns, drifted: false };
}

/**
 * The exposed answer pipeline over a recorded lineage.
 *
 * Semantics that the ablation check (V6) depends on:
 *   - Empty lineage  → fall to the inline baseline (no procedure was intended).
 *   - Non-empty lineage → run each present procedure in order; the FIRST
 *     terminal answer wins. A procedure that is missing from the registry
 *     (ablated) simply contributes nothing.
 *   - Non-empty lineage that yields no terminal answer → ABSTAIN. This is why
 *     removing a load-bearing solver changes the answer (count → abstain),
 *     while removing a decorative shim leaves the solver's answer intact.
 */
export function executeExposed(
  task: Task,
  lineage: string[],
  registry: ReadonlyMap<string, Procedure>,
  snapshot: MountedSnapshot,
): { answer: Answer; turns: number; drifted: boolean } {
  const ctx = new ExecContext(snapshot);

  if (lineage.length === 0) {
    const records = ctx.scanAll(task.sourceCollection);
    return { answer: task.reduceRecords(records), turns: ctx.turns, drifted: false };
  }

  let answer: Answer | undefined;
  for (const id of lineage) {
    const proc = registry.get(id);
    if (!proc) continue; // ablated / not registered → contributes nothing
    const result = proc.run(ctx, task);
    if (result !== PASS) {
      answer = result;
      break;
    }
  }

  if (!answer) answer = makeAbstain("no-procedure-available");
  const drifted = answer.kind === "abstain" && answer.reason.startsWith("drift");
  return { answer, turns: ctx.turns, drifted };
}

/** Dispatch on arm. Masked never consults a procedure or index. */
export function execute(
  task: Task,
  arm: Arm,
  lineage: string[],
  registry: ReadonlyMap<string, Procedure>,
  snapshot: MountedSnapshot,
): { answer: Answer; turns: number; drifted: boolean } {
  return arm === "masked"
    ? executeInline(task, snapshot)
    : executeExposed(task, lineage, registry, snapshot);
}
