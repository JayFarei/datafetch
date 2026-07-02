// Core types for the online promotion ladder (kb/plans/016).
//
// These describe the world-state artifacts the grounded verifier
// (verify/ladder.sh) re-observes. Field names here MUST match the artifact
// contract in eval/ladder/BUILD-SPEC.md §3 exactly — the verifier greps the
// JSON, not this file. Extra fields are permitted (the verifier reads a fixed
// subset); renamed fields are not.

/** Where a procedure came from. `control` procedures are permanent negatives. */
export type Provenance = "curated" | "agent" | "compressor" | "control";

/** Rungs of the promotion ladder. */
export type ProcedureState =
  | "quarantine"
  | "shadow"
  | "candidate"
  | "promoted"
  | "deprecated";

/** The two arms of a shadow pair. `masked` never sees the library surface. */
export type Arm = "exposed" | "masked";

/** Structured intents. No free-string answer payloads (defeater D9). */
export type AnswerKind = "count" | "list" | "abstain";

export interface CountAnswer {
  kind: "count";
  /** MUST be a real number. Prose stuffed here is rejected by the contract. */
  value: number;
}

export interface ListAnswer {
  kind: "list";
  /** Structured records only — never bare prose strings. */
  items: Array<Record<string, string | number>>;
}

export interface AbstainAnswer {
  kind: "abstain";
  reason: string;
}

export type Answer = CountAnswer | ListAnswer | AbstainAnswer;

/**
 * A per-query parameter that instantiates a task on a distinct slice of the
 * corpus. The scripted driver walks a deterministic grid of these (one per
 * pair), so each pair issues a DISTINCT query (and, where the data supports it,
 * a distinct answer). `asOf` is an inclusive upper bound on record sequence —
 * an "as of the first N records filed" window. It is monotone across the grid,
 * so post-promotion pairs read windows never seen before promotion (the holdout
 * is earned on distinct traffic, not identical replays).
 */
export interface TaskParam {
  /** inclusive upper bound on record sequence (the "as of #N filed" window). */
  asOf: number;
}

/** One episode row in `episodes.jsonl`. */
export interface Episode {
  episodeId: string;
  /** epoch seconds (number). */
  ts: number;
  /** git HEAD at run time. */
  commit: string;
  /** sha256 of `jq -cS prereg/ladder-boundaries.json` (row 1 at minimum). */
  preregHash?: string;
  tenant: string;
  /** Every artifact is scripted: a deterministic policy over real fixtures. */
  driver: "scripted";
  query: string;
  /** Which task this episode answered — used to replay deterministically. */
  taskId: string;
  /** Drift fingerprint of the snapshot the episode ran against. */
  snapshotHash: string;
  arm: Arm;
  /** null for un-paired episodes (probes, adversarial fixtures). */
  pairId: string | null;
  /**
   * The parameter that instantiated this episode's query (the distinct-traffic
   * fix). Replay uses it to recompute the answer; absent rows replay at the
   * full-corpus window.
   */
  taskParam?: TaskParam;
  /** repo-root-relative path to the outbound prompt file (must exist on disk). */
  promptPath: string;
  /** sha256 of the exact bytes written to `promptPath` (ties this row to that file). */
  promptHash?: string;
  answer: Answer;
  answerSchemaOk: boolean;
  abstained: boolean;
  drifted: boolean;
  /** MEASURED executor round-trips — never a constant. */
  turns: number;
  /** procedureIds on the answer path (empty = inline). */
  lineage: string[];
  /** exposed rows only: did the exposed arm win its pair on cost? */
  pairWin?: boolean;
  // ---- adversarial fixture fields (the prose-in-string rejection proof) ----
  fixture?: string;
  contractRejected?: boolean;
}

export interface EvidenceBlock {
  pairs: number;
  wins: number;
  /** distinct query identities observed (genericity is earned on these, not raw pair count) */
  distinctQueries?: number;
  boundaryRef?: string;
}

/**
 * The forced-drift probe record. MUST be produced by ACTUALLY running the
 * probe (mutate snapshot, run next episode, observe both edges) — never hand
 * written. verify/ladder.sh V4:drift reads exactly these three fields.
 */
export interface DriftProbe {
  stateBeforeMutation: string;
  stateAfterNextEpisode: string;
  abstentionRecorded: boolean;
}

export interface LadderEntry {
  state: ProcedureState;
  provenance: Provenance;
  promotedAt?: number;
  evidence?: EvidenceBlock;
  /**
   * Pre-drift evidence, archived when a promoted procedure is demoted. It is
   * kept for audit but is NOT live: a demoted procedure must re-earn promotion on
   * fresh post-drift pairs, never re-promote on the wins it held before drift.
   */
  demotedEvidence?: EvidenceBlock & { reason: string };
  driftProbe?: DriftProbe;
}

export type LadderState = Record<string, LadderEntry>;

export interface PromotionRecord {
  decision: "promote" | "reject";
  id: string;
  ts: number;
  boundaryRef?: string;
  reason: string;
}
