// Seed procedure model. A curated seed is the index-backed answer path for a
// task: how to BUILD its derived index from raw records, and how to READ that
// index into an answer. The seed sources live in lib/seeds/ (grepped by
// V7:G3 for gold references); this module turns a Seed into a runnable
// Procedure with the drift guard wired in.

import { makeAbstain } from "./answerContract.js";
import type { ExecContext, Procedure, ProcResult } from "./executor.js";
import type { IndexArtifact } from "./snapshot.js";
import type { Task } from "./tasks.js";
import type { Answer, Provenance } from "./types.js";

export interface Seed {
  id: string;
  taskId: string;
  provenance: Provenance;
  /** name of the derived index file (indexes/<indexName>.json) */
  indexName: string;
  /** compute the derived payload from raw records (no fingerprint) */
  buildIndex(records: Record<string, unknown>[]): Record<string, unknown>;
  /** read the derived index into an answer */
  reduceIndex(index: IndexArtifact): Answer;
}

/**
 * Turn a seed into a runnable procedure. The drift guard is the load-bearing
 * primitive: if the index is missing, or was built against a different source
 * fingerprint than the live snapshot, the procedure ABSTAINS with a `drift:`
 * reason rather than serve a stale answer.
 */
export function seedProcedure(seed: Seed): Procedure {
  return {
    id: seed.id,
    run(ctx: ExecContext, _task: Task): ProcResult {
      const index = ctx.readIndex(seed.indexName);
      if (!index) return makeAbstain("drift:index-missing");
      if (index.sourceFingerprint !== ctx.sourceFingerprint) {
        return makeAbstain("drift:stale-index");
      }
      return seed.reduceIndex(index);
    },
  };
}
