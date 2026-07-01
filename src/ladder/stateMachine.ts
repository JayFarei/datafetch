// The promotion ladder state machine (checks V4/V5).
//
// Rungs: quarantine -> shadow -> candidate -> promoted, plus demotion to
// quarantine on drift. Every procedure — curated seed, agent-authored,
// compressor output, or negative control — enters at quarantine and climbs on
// its OWN paired evidence:
//
//   quarantine -> shadow    : exercised on >= shadowAfterCalls distinct real
//                             calls (genericity: not a one-off).
//   shadow    -> candidate  : cumulative counterfactual win-rate clears the
//                             pre-registered win floor once candidateAfterCalls
//                             pairs have accumulated.
//   candidate -> promoted   : the frozen sequential boundary is crossed
//                             (pairs >= minPairs AND winRate >= winFloor). The
//                             promotion records a boundaryRef; a promotion
//                             without one is red (V5).
//
// The gate decides in BOTH directions (defeater D3, the 0/22 inert-gate lesson):
// a procedure that reaches minPairs without crossing the boundary is REJECTED,
// and the rejection is recorded in promotions.jsonl. Usage alone never promotes
// (defeater D6): a high-traffic, sub-floor procedure gets called many times and
// is rejected all the same.

import { evaluateBoundary, loadBoundaries, preregHash, type Boundaries } from "./boundary.js";
import type {
  DriftProbe,
  LadderEntry,
  LadderState,
  PromotionRecord,
  Provenance,
} from "./types.js";

export interface LadderConfig {
  boundaries: Boundaries;
  /** quarantine -> shadow after this many distinct real calls */
  shadowAfterCalls: number;
  /** shadow -> candidate after this many pairs, if win-rate clears the floor */
  candidateAfterCalls: number;
  /** frozen prereg hash embedded in boundary refs (V0 tie-back) */
  preregHash: string;
}

export function defaultLadderConfig(): LadderConfig {
  return {
    boundaries: loadBoundaries(),
    shadowAfterCalls: 3,
    candidateAfterCalls: 10,
    preregHash: preregHash(),
  };
}

interface Bookkeeping {
  pairs: number;
  wins: number;
  /** the gate fires exactly once per procedure (until a drift demotion resets it) */
  gated: boolean;
}

export interface ObservePairInput {
  win: boolean;
  ts: number;
}

/** The ladder over a single run. Produces `ladder-state.json` + `promotions.jsonl`. */
export class Ladder {
  private readonly entries = new Map<string, LadderEntry>();
  private readonly book = new Map<string, Bookkeeping>();
  private readonly promotions: PromotionRecord[] = [];

  constructor(private readonly cfg: LadderConfig) {}

  /** Admit a procedure at quarantine. Idempotent-safe: throws on double admit. */
  admit(id: string, provenance: Provenance): void {
    if (this.entries.has(id)) throw new Error(`already admitted: ${id}`);
    this.entries.set(id, {
      state: "quarantine",
      provenance,
      evidence: { pairs: 0, wins: 0 },
    });
    this.book.set(id, { pairs: 0, wins: 0, gated: false });
  }

  private require(id: string): { entry: LadderEntry; book: Bookkeeping } {
    const entry = this.entries.get(id);
    const book = this.book.get(id);
    if (!entry || !book) throw new Error(`not admitted: ${id}`);
    return { entry, book };
  }

  /**
   * Record one paired observation and advance the ladder. Returns a
   * PromotionRecord iff a gate decision (promote OR reject) fired this call.
   */
  observePair(id: string, input: ObservePairInput): PromotionRecord | undefined {
    const { entry, book } = this.require(id);
    const { minPairs, winFloor } = this.cfg.boundaries;

    book.pairs += 1;
    if (input.win) book.wins += 1;
    const winRate = book.wins / book.pairs;
    entry.evidence = {
      pairs: book.pairs,
      wins: book.wins,
      ...(entry.evidence?.boundaryRef ? { boundaryRef: entry.evidence.boundaryRef } : {}),
    };

    // rung advancement (monotone, below the gate)
    if (entry.state === "quarantine" && book.pairs >= this.cfg.shadowAfterCalls) {
      entry.state = "shadow";
    }
    if (
      entry.state === "shadow" &&
      book.pairs >= this.cfg.candidateAfterCalls &&
      winRate >= winFloor
    ) {
      entry.state = "candidate";
    }

    // the gate: fires once, in both directions
    if (!book.gated && book.pairs >= minPairs) {
      book.gated = true;
      const decision = evaluateBoundary(book.pairs, book.wins, this.cfg.boundaries, this.cfg.preregHash);
      if (entry.state === "candidate" && decision.crossed) {
        entry.state = "promoted";
        entry.promotedAt = input.ts;
        entry.evidence = {
          pairs: book.pairs,
          wins: book.wins,
          boundaryRef: decision.boundaryRef,
        };
        const rec: PromotionRecord = {
          decision: "promote",
          id,
          ts: input.ts,
          boundaryRef: decision.boundaryRef,
          reason: decision.reason,
        };
        this.promotions.push(rec);
        return rec;
      }
      const rec: PromotionRecord = {
        decision: "reject",
        id,
        ts: input.ts,
        reason:
          entry.state !== "candidate"
            ? `rejected at gate: rung=${entry.state}, winRate=${winRate.toFixed(3)} never reached candidate`
            : decision.reason,
      };
      this.promotions.push(rec);
      return rec;
    }
    return undefined;
  }

  /**
   * Demote a promoted procedure to quarantine on observed drift (V4:drift).
   * Re-arms the gate so a re-earned procedure could climb again on fresh
   * evidence. Returns the rung it fell from.
   */
  demote(id: string, reason: string): string {
    const { entry, book } = this.require(id);
    const from = entry.state;
    entry.state = "quarantine";
    delete entry.promotedAt;
    book.gated = false;
    void reason;
    return from;
  }

  /** Attach a forced-drift probe record (produced by actually running the probe). */
  attachDriftProbe(id: string, probe: DriftProbe): void {
    const { entry } = this.require(id);
    entry.driftProbe = probe;
  }

  stateOf(id: string): string {
    return this.require(id).entry.state;
  }

  entry(id: string): LadderEntry {
    return this.require(id).entry;
  }

  promoted(): string[] {
    return [...this.entries.entries()].filter(([, e]) => e.state === "promoted").map(([id]) => id);
  }

  /** The `ladder-state.json` payload. */
  state(): LadderState {
    return Object.fromEntries(this.entries);
  }

  /** The `promotions.jsonl` payload, in decision order. */
  promotionRecords(): PromotionRecord[] {
    return [...this.promotions];
  }
}
