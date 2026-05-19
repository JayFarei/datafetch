// Crystallisation gate.
//
// Conservative heuristic deciding whether a saved trajectory should be learned
// into a /lib/<tenant>/<name>.ts interface. Phase 5 (R6) wants the observer to
// "only propose crystallisation when the trajectory looks complete and the call
// graph is plausible".
//
// The gate is intentionally simple — it errs on the side of skipping. A
// permissive observer would write garbage /lib/ files; a strict one only
// learns shapes the runtime can mechanically replay. Per the plan's
// Architecture and design.md §8.3, the production form requires N >= 3
// convergent trajectories before promotion. The MVP collapses N to 1
// (every qualifying trajectory is learned immediately) so the demo
// shows turn 5 of personas.md §3 ("Coming back the next day"). The
// shape-hash de-dup below means re-running the same snippet doesn't
// produce a second learned-interface copy.
//
// Heuristics applied (all must pass):
//   1. Phase metadata, when present, must identify a committed execute
//      artifact. Plan attempts are exploration and cannot be learned from.
//   2. >= 2 distinct primitive calls in the trajectory.
//   3. The trajectory's `errored` flag is false AND no call has a
//      thrown-error output (no `error`/`errors`/`stack` key on its
//      output). Error-path detection lives on the trajectory's `errored`
//      field, NOT on `mode` — per PRD §8.1, `mode: "novel"` means
//      "first-time successful ad-hoc composition" (tier 4).
//   4. Mode is "novel" (first-time composition we want to learn)
//      or "interpreted" (already-composed; usually filtered by the
//      shape-hash dedup below). LLM-backed / cache trajectories are
//      excluded per D-015 — the observer learns composition
//      patterns, not standalone LLM functions or cached results.
//   5. The first call is a substrate retrieval (`db.*`) returning a list,
//      and at least one subsequent call is a `lib.*` whose input
//      references the first call's output (data-flow check).
//   6. The shape-hash isn't already represented in the on-disk
//      /lib/<tenant>/ overlay (avoid re-learning the same shape).

import type { TrajectoryRecord } from "../sdk/index.js";

import type { LibrarySnapshot } from "./template.js";

export type GateOutcome =
  | { ok: true }
  | { ok: false; reason: string };

export type ShouldCrystalliseArgs = {
  trajectory: TrajectoryRecord;
  // Pre-computed shape hash from the template extractor. Used to check against
  // `existing.shapeHashes` so we don't re-learn the same shape.
  shapeHash: string;
  existing: LibrarySnapshot;
  // When true, this candidate is a sub-graph slice of the trajectory
  // rather than the whole trajectory. Goal-3 iter 10: sub-graphs let us
  // crystallise additional helpers (e.g. a "lookup + first consumer"
  // wrapper, or a "post-lookup fan-out" wrapper) per trajectory, lifting
  // `avgLearnedInterfacesAvailable` above 1. The relaxation: a sub-graph
  // does not require a db.* entry with downstream lib.* + data-flow;
  // instead it requires two distinct primitives in the slice (which is
  // already enforced for the whole-trajectory case) and the rest of the
  // safety checks (no error, mode in novel/interpreted, shape-hash dedup).
  subGraph?: boolean;
  // The contiguous call slice this sub-graph candidate is built from.
  // When undefined (whole-trajectory case), the gate uses
  // `trajectory.calls`. This is purely informational for the slice-aware
  // distinct-primitive count; the gate treats the slice the same way it
  // treats the whole.
  callsSlice?: ReadonlyArray<TrajectoryRecord["calls"][number]>;
  // Goal-4 Change 3 — intent-convergence gate. When both are supplied,
  // the candidate is crystallised only once its `intentSignature` has
  // been seen across >= `convergenceThreshold` DISTINCT trajectories
  // (the count comes from the on-disk convergence index, which the
  // worker reads once per observe() call). The first trajectory of a
  // new intent is recorded-but-not-crystallised; the Nth convergent one
  // passes this check. When `convergenceCount` is undefined the gate
  // skips this check entirely — preserves the pre-Goal-4 behaviour for
  // callers (tests, the demo, the legacy path) that have not wired the
  // convergence index.
  convergenceCount?: number;
  convergenceThreshold?: number;
};

export function shouldCrystallise(args: ShouldCrystalliseArgs): GateOutcome {
  const { trajectory, shapeHash, existing } = args;
  const slice = args.callsSlice ?? trajectory.calls;
  const isSubGraph = args.subGraph === true;

  // 1. Phase-aware execution: legacy trajectories had no phase field, so
  //    keep them eligible. Once a run declares a phase, only committed
  //    artifacts are learnable. `execute` remains as the legacy committed
  //    phase; `commit` is the intent-workspace answer gate.
  if (
    trajectory.phase !== undefined &&
    trajectory.phase !== "execute" &&
    trajectory.phase !== "commit"
  ) {
    return {
      ok: false,
      reason: `trajectory.phase is "${trajectory.phase}"; only committed artifacts can be learned from`,
    };
  }
  if (
    trajectory.phase === "commit" &&
    !answerValidationAccepted(trajectory.answerValidation)
  ) {
    return {
      ok: false,
      reason: "commit answer validation did not accept the trajectory",
    };
  }
  if (trajectory.crystallisable === false) {
    return {
      ok: false,
      reason: "trajectory.crystallisable=false; only committed artifacts can be learned from",
    };
  }

  // 2. >= 2 distinct primitive calls in the slice (or, for sub-graphs of
  //    the fan-out kind, >= 2 calls of the same primitive — pure fan-out
  //    where the agent loops the same tool over N entities is a valid
  //    crystallisation target).
  //
  //    Opt-in pure-compute exception (DATAFETCH_GATE_PURE_COMPUTE=1):
  //    accept single-call db.* trajectories whose committed df.answer
  //    carries a numerical value + derivation steps. This is the
  //    composition-density lever for pure-computation benchmarks where
  //    the agent reads records, computes inline, and commits a final
  //    value without any df.lib.* call. Generic (no benchmark identifiers);
  //    opt-in so SkillCraft + other tool-fanout benchmarks remain
  //    unaffected. The crystallised helper captures the inline computation
  //    so future siblings can call it instead of re-deriving.
  const pureComputeOptIn =
    (process.env["DATAFETCH_GATE_PURE_COMPUTE"] ?? "").trim().toLowerCase() === "1";
  const singleIsDbStarWithNumericAnswer = (() => {
    if (slice.length !== 1) return false;
    if (!slice[0]!.primitive.startsWith("db.")) return false;
    const answerValue = (trajectory.answer as { value?: unknown } | undefined)?.value;
    return typeof answerValue === "number" && Number.isFinite(answerValue);
  })();
  const pureComputeAllowed = pureComputeOptIn && singleIsDbStarWithNumericAnswer;
  if (slice.length < 2 && !pureComputeAllowed) {
    return {
      ok: false,
      reason: `slice has ${slice.length} call(s); need at least 2 (DATAFETCH_GATE_PURE_COMPUTE=1 opt-in for single-call db.* + numerical-answer is permitted)`,
    };
  }
  const distinctPrimitives = new Set(slice.map((c) => c.primitive));
  if (distinctPrimitives.size < 2 && !isSubGraph && !isPureToolFanout(slice) && !pureComputeAllowed) {
    return {
      ok: false,
      reason: `trajectory has ${distinctPrimitives.size} distinct primitive(s); need at least 2`,
    };
  }
  if (
    isSubGraph &&
    distinctPrimitives.size < 2 &&
    slice.length < 3
  ) {
    // Pure fan-out sub-graphs need at least 3 calls of the same primitive
    // to be considered a reusable pattern (otherwise a one-shot pair of
    // identical calls is too thin a signal).
    return {
      ok: false,
      reason: `sub-graph slice has ${slice.length} call(s) of one primitive; fan-out crystallisation needs >= 3`,
    };
  }

  // 3. The snippet didn't error AND no recorded call has an error-shaped
  //    output. Error-path detection is on `trajectory.errored`, NOT on
  //    `mode` — per PRD §8.1 a successful first-time composition is
  //    `mode: "novel"`, tier 4.
  if (trajectory.errored === true) {
    return {
      ok: false,
      reason: "trajectory.errored=true (snippet threw or no body executed)",
    };
  }
  const firstDbIdxForErrors = slice.findIndex((c) => c.primitive.startsWith("db."));
  const recordSignaturesForErrors =
    firstDbIdxForErrors >= 0 && Array.isArray(slice[firstDbIdxForErrors]?.output)
      ? pickSignatures(slice[firstDbIdxForErrors]!.output as unknown[])
      : [];
  const successfulRecordToolCallsForErrors = recordSignaturesForErrors.length > 0
    ? slice.filter((candidate) =>
        candidate.primitive.startsWith("tool.") &&
        !looksLikeErrorOutput(candidate.output) &&
        toolInputConsumesRecord(candidate.input, recordSignaturesForErrors),
      ).length
    : 0;
  for (const call of slice) {
    if (looksLikeErrorOutput(call.output)) {
      if (call.primitive.startsWith("tool.") && recordSignaturesForErrors.length > 0) {
        if (!toolInputConsumesRecord(call.input, recordSignaturesForErrors)) {
          continue;
        }
        if (successfulRecordToolCallsForErrors >= 2) {
          continue;
        }
      }
      return {
        ok: false,
        reason: `call #${call.index} (${call.primitive}) output looks like an error`,
      };
    }
  }

  // 4. Mode must be a composition pattern. "novel" (first-time successful
  //    ad-hoc composition) is the headline crystallisation target;
  //    "interpreted" trajectories are also accepted but the shape-hash
  //    dedup below typically filters them. LLM-backed / cache /compiled
  //    are excluded per D-015.
  if (trajectory.mode !== "novel" && trajectory.mode !== "interpreted") {
    return {
      ok: false,
      reason: `trajectory.mode is "${trajectory.mode}"; observer only learns composition patterns (mode "novel" or "interpreted"). Per D-015 the agent authors agent-backed functions directly.`,
    };
  }

  // Interpreted trajectories that already dispatched through a learned
  // interface should reinforce that interface, not learn a second wrapper
  // around it. Semantic names are recognised through the library metadata
  // snapshot; the old `crystallise_*` prefix remains supported for legacy
  // files already present on disk.
  const learnedCall = trajectory.calls.find((c) =>
    callsKnownLearnedInterface(c.primitive, existing),
  );
  if (
    learnedCall &&
    !isLearnedInterfaceWithDependentToolTail(trajectory.calls, learnedCall.index) &&
    !isLearnedToolFanoutWithDependentToolTail(trajectory.calls, learnedCall.index) &&
    !isLearnedInterfaceWithRecordToolReplay(trajectory.calls, learnedCall.index)
  ) {
    return {
      ok: false,
      reason: `trajectory already calls learned interface ${learnedCall.primitive}; treat as reuse evidence, not a new template`,
    };
  }

  // 5. Substrate-rooted chain check.
  //    Whole-trajectory case (default): a db.* call producing a list, with
  //    at least one downstream lib.* whose input consumes the db output.
  //    Sub-graph case (Goal-3 iter 10): the slice need not be db-rooted;
  //    if it has a db.* call AND a downstream consumer, we keep the
  //    data-flow check; otherwise we accept fan-out shapes (multiple
  //    calls of the same primitive with a shared parameter pattern).
  const firstDbIdx = slice.findIndex((c) => c.primitive.startsWith("db."));
  if (isSubGraph) {
    if (firstDbIdx !== -1) {
      if (!Array.isArray(slice[firstDbIdx]?.output)) {
        return {
          ok: false,
          reason: `sub-graph first db.* call (#${firstDbIdx}) did not return a list`,
        };
      }
      if (!consumesEarlierOutput(slice, firstDbIdx)) {
        return {
          ok: false,
          reason: "sub-graph data-flow check failed: no downstream call consumes the db.* output",
        };
      }
    } else {
      // Pure fan-out sub-graph: every call is lib.* or tool.*. Require at
      // least 3 calls AND at least one primitive that repeats — this is
      // the structural marker of a reusable per-entity workflow.
      const allSubstrate = slice.every(
        (c) => c.primitive.startsWith("lib.") || c.primitive.startsWith("tool."),
      );
      if (!allSubstrate) {
        return {
          ok: false,
          reason: "sub-graph is not substrate-rooted (no db.* and contains non-lib/tool calls)",
        };
      }
      if (slice.length < 3) {
        return {
          ok: false,
          reason: `pure-fan-out sub-graph has ${slice.length} call(s); need >= 3`,
        };
      }
      const counts = new Map<string, number>();
      for (const c of slice) {
        counts.set(c.primitive, (counts.get(c.primitive) ?? 0) + 1);
      }
      const hasRepeat = Array.from(counts.values()).some((n) => n >= 2);
      if (!hasRepeat) {
        return {
          ok: false,
          reason: "pure-fan-out sub-graph has no repeated primitive (no fan-out structure)",
        };
      }
    }
  } else {
    if (firstDbIdx === -1) {
      if (isPureToolFanout(slice)) {
        // Pure tool fan-out is a legitimate reusable helper family for
        // SkillCraft tenants without mounted records, or for dependent
        // enrichment tails. It still needs the no-error, composition-mode,
        // shape-dedup, and convergence checks below.
      } else if (hasLearnedToolFanoutWithDependentToolTail(slice, existing)) {
        // A learned pure tool fan-out helper can be followed by a dependent
        // tool fan-out over ids/names produced by the base rows. That is a
        // new exact composition shape (`toolFanoutEnrichment`), not just
        // plain helper reuse, even though there is no db.* substrate call.
      } else {
        return {
          ok: false,
          reason: "no db.* call present; observer requires a substrate-rooted chain",
        };
      }
    } else {
      if (!Array.isArray(slice[firstDbIdx]?.output)) {
        return {
          ok: false,
          reason: `first db.* call (#${firstDbIdx}) did not return a list`,
        };
      }
      const downstreamLib = slice.slice(firstDbIdx + 1).find((c) =>
        c.primitive.startsWith("lib."),
      );
      const directRecordToolFanout = isDirectRecordToolFanout(slice, firstDbIdx);
      if (!downstreamLib && !directRecordToolFanout && !pureComputeAllowed) {
        return {
          ok: false,
          reason: "no lib.* call after the first db.* call (DATAFETCH_GATE_PURE_COMPUTE=1 opt-in for db.* + inline-compute + numerical-answer is permitted)",
        };
      }
      // Skip the data-flow consumer check for pure-compute opt-in: the
      // single db.* call's output is consumed by inline TS computation,
      // not by another recorded primitive call.
      if (!pureComputeAllowed && !consumesEarlierOutput(slice, firstDbIdx)) {
        return {
          ok: false,
          reason: "no downstream call appears to consume the substrate output (data-flow check failed)",
        };
      }
    }
  }

  // 6. Shape-hash de-dup. The existing snapshot is built from the on-disk
  //    /lib/<tenant>/*.ts files; any file whose body comment carries the
  //    same `@shape-hash:` tag means we already learned this shape.
  if (existing.shapeHashes.has(shapeHash)) {
    return {
      ok: false,
      reason: `call shape already learned (shapeHash=${shapeHash})`,
    };
  }

  // 7. Intent convergence (Goal-4 Change 3). The MVP crystallised from a
  //    single trajectory; Goal 4 requires an intent to RECUR across
  //    >= N distinct trajectories before the substrate commits a learned
  //    interface to it. Only enforced when the caller wired the
  //    convergence index (`convergenceCount` supplied) — otherwise this
  //    check is a no-op and pre-Goal-4 callers behave unchanged.
  if (args.convergenceCount !== undefined) {
    const threshold = args.convergenceThreshold ?? 2;
    if (args.convergenceCount < threshold) {
      return {
        ok: false,
        reason:
          `intent has not converged: seen in ${args.convergenceCount} trajectory(ies), ` +
          `need ${threshold}. Recorded; will crystallise once it recurs.`,
      };
    }
  }

  return { ok: true };
}

function answerValidationAccepted(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  return (value as { accepted?: unknown }).accepted === true;
}

// --- Helpers ---------------------------------------------------------------

function callsKnownLearnedInterface(
  primitive: string,
  existing: LibrarySnapshot,
): boolean {
  if (!primitive.startsWith("lib.")) return false;
  const name = primitive.slice("lib.".length);
  return existing.learnedNames.has(name) || name.startsWith("crystallise_");
}

function isDirectRecordToolFanout(
  calls: ReadonlyArray<TrajectoryRecord["calls"][number]>,
  firstDbIdx: number,
): boolean {
  if (firstDbIdx < 0) return false;
  const afterDb = calls.slice(firstDbIdx + 1);
  if (afterDb.some((c) => c.primitive.startsWith("lib."))) return false;
  return afterDb.filter((c) => c.primitive.startsWith("tool.")).length >= 2;
}

function isLearnedInterfaceWithDependentToolTail(
  calls: ReadonlyArray<TrajectoryRecord["calls"][number]>,
  learnedCallIndex: number,
): boolean {
  const learnedPosition = calls.findIndex((call) => call.index === learnedCallIndex);
  if (learnedPosition < 0) return false;
  const priorDb = calls
    .slice(0, learnedPosition)
    .some((call) => call.primitive.startsWith("db."));
  if (!priorDb) return false;
  const tailToolCalls = calls
    .slice(learnedPosition + 1)
    .filter((call) => call.primitive.startsWith("tool."));
  return tailToolCalls.length >= 2;
}

function hasLearnedToolFanoutWithDependentToolTail(
  calls: ReadonlyArray<TrajectoryRecord["calls"][number]>,
  existing: LibrarySnapshot,
): boolean {
  const learnedCall = calls.find(
    (call) =>
      call.primitive === "lib.toolFanout" &&
      callsKnownLearnedInterface(call.primitive, existing),
  );
  return learnedCall
    ? isLearnedToolFanoutWithDependentToolTail(calls, learnedCall.index)
    : false;
}

function isLearnedToolFanoutWithDependentToolTail(
  calls: ReadonlyArray<TrajectoryRecord["calls"][number]>,
  learnedCallIndex: number,
): boolean {
  const learnedPosition = calls.findIndex((call) => call.index === learnedCallIndex);
  if (learnedPosition < 0) return false;
  const learnedCall = calls[learnedPosition];
  if (!learnedCall || learnedCall.primitive !== "lib.toolFanout") return false;
  const baseToolCalls = calls
    .slice(0, learnedPosition)
    .filter(
      (call) =>
        call.primitive.startsWith("tool.") &&
        call.scope?.parentPrimitive === learnedCall.primitive,
    );
  if (baseToolCalls.length < 2) return false;
  const tailToolCalls = calls
    .slice(learnedPosition + 1)
    .filter((call) => call.primitive.startsWith("tool."));
  return tailToolCalls.length >= 2;
}

function isLearnedInterfaceWithRecordToolReplay(
  calls: ReadonlyArray<TrajectoryRecord["calls"][number]>,
  learnedCallIndex: number,
): boolean {
  const learnedPosition = calls.findIndex((call) => call.index === learnedCallIndex);
  if (learnedPosition < 0) return false;
  const prefix = calls.slice(0, learnedPosition);
  const firstDbIdx = prefix.findIndex((call) => call.primitive.startsWith("db."));
  if (firstDbIdx < 0 || !Array.isArray(prefix[firstDbIdx]?.output)) return false;
  const toolCalls = prefix.slice(firstDbIdx + 1).filter((call) => call.primitive.startsWith("tool."));
  if (toolCalls.length < 2) return false;
  return consumesEarlierOutput(calls.slice(0, learnedPosition + 1), firstDbIdx);
}

function isPureToolFanout(
  calls: ReadonlyArray<TrajectoryRecord["calls"][number]>,
): boolean {
  if (calls.length < 3) return false;
  if (!calls.every((c) => c.primitive.startsWith("tool."))) return false;
  const counts = new Map<string, number>();
  for (const call of calls) {
    counts.set(call.primitive, (counts.get(call.primitive) ?? 0) + 1);
  }
  return [...counts.values()].some((count) => count >= 2);
}

// A call's output shape that "looks like an error" — defensive check; the
// trajectory recorder doesn't store thrown exceptions per se (it bubbles
// them up to the snippet runtime which records mode "novel"), but a
// pure-TS body that returns `{error: "..."}` is something the gate
// should refuse.
function looksLikeErrorOutput(output: unknown): boolean {
  if (output === null || typeof output !== "object" || Array.isArray(output)) {
    return false;
  }
  const rec = output as Record<string, unknown>;
  if (typeof rec["error"] === "string") return true;
  if (Array.isArray(rec["errors"]) && rec["errors"].length > 0) return true;
  if (typeof rec["stack"] === "string") return true;
  return false;
}

// Returns true if any call after `firstDbIdx` has an input that
// references a value present somewhere in an earlier call's output.
// "References" is checked structurally: serialise both, walk the
// downstream input looking for any object/array whose JSON encoding
// matches any sub-tree of the upstream output.
function consumesEarlierOutput(
  calls: ReadonlyArray<TrajectoryRecord["calls"][number]>,
  firstDbIdx: number,
): boolean {
  const upstream = calls[firstDbIdx]?.output;
  if (!Array.isArray(upstream) || upstream.length === 0) return false;
  // Quick serialise-and-substring check. This is a loose heuristic but
  // covers the common case where the output of findSimilar(...) flows in
  // as `{candidates: cands}` to pickFiling. Agents often filter/rerank the
  // candidate list before the next primitive call, so checking only the
  // first upstream row creates false negatives. Treat any distinctive row
  // signature from the upstream result set as evidence of substrate flow.
  const signatures = pickSignatures(upstream);
  if (signatures.length === 0) return false;
  for (let i = firstDbIdx + 1; i < calls.length; i += 1) {
    const downstream = calls[i];
    if (!downstream) continue;
    const downstreamJson = safeJson(downstream.input);
    if (downstreamJson === null) continue;
    if (signatures.some((signature) => downstreamJson.includes(signature))) {
      return true;
    }
  }
  return false;
}

function safeJson(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function toolInputConsumesRecord(input: unknown, signatures: string[]): boolean {
  const json = safeJson(input);
  return json !== null && signatures.some((signature) => json.includes(signature));
}

function pickSignatures(arr: unknown[]): string[] {
  const preferredKeys = [
    "id",
    "caseId",
    "filename",
    "question",
    "searchableText",
    "program",
  ];
  const signatures: string[] = [];
  const seen = new Set<string>();

  const addSignature = (raw: string): void => {
    if (!seen.has(raw)) {
      seen.add(raw);
      signatures.push(raw);
    }
  };
  const addStringSignatureVariants = (raw: string): void => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return;
    addSignature(JSON.stringify(trimmed));
    const lower = trimmed.toLowerCase();
    addSignature(JSON.stringify(lower));
    addSignature(JSON.stringify(lower.replace(/\s+/g, "-")));
    addSignature(JSON.stringify(lower.replace(/\b[a-z]/g, (ch) => ch.toUpperCase())));
  };
  const addRecordIdentifierSignature = (value: unknown): void => {
    if (typeof value === "string" && value.length >= 1) {
      addStringSignatureVariants(value);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      const numStr = String(value);
      addSignature(numStr);
      addSignature(JSON.stringify(numStr));
    }
  };

  for (const item of arr) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      // Treat numeric and string primitives as their own signatures.
      // Common when df.db.records returns a list of ids or labels.
      if (typeof item === "string" && item.length >= 3) {
        addSignature(JSON.stringify(item));
        if (signatures.length >= 64) return signatures;
      } else if (typeof item === "number" && Number.isFinite(item)) {
        const numStr = String(item);
        if (numStr.length >= 2) {
          addSignature(numStr);
          addSignature(JSON.stringify(numStr));
          if (signatures.length >= 64) return signatures;
        }
      }
      continue;
    }
    const rec = item as Record<string, unknown>;
    if (isRecordRow(rec)) {
      addRecordIdentifierSignature(rec["id"]);
      addRecordIdentifierSignature(rec["entity"]);
      const attributes = rec["attributes"];
      if (
        attributes !== null &&
        typeof attributes === "object" &&
        !Array.isArray(attributes)
      ) {
        const attrs = attributes as Record<string, unknown>;
        addRecordIdentifierSignature(attrs["id"]);
        addRecordIdentifierSignature(attrs["entity"]);
      }
      if (signatures.length >= 64) return signatures;
    }
    const keys = [
      ...preferredKeys.filter((key) => Object.prototype.hasOwnProperty.call(rec, key)),
      ...Object.keys(rec).filter((key) => !preferredKeys.includes(key)),
    ];
    for (const key of keys) {
      const v = rec[key];
      if (typeof v === "string" && v.length >= 4) {
        addStringSignatureVariants(v);
        if (signatures.length >= 64) return signatures;
      } else if (typeof v === "number" && Number.isFinite(v)) {
        // Numeric identifier-like values (>=2 digits) are common
        // signatures for tool inputs like `{show_id: 169}` or
        // `{user_id: 42}`. Emit both bare and quoted forms so the
        // substring check matches whether downstream JSON carries
        // the value as a number or a string.
        const numStr = String(v);
        if (numStr.length >= 2) {
          addSignature(numStr);
          addSignature(JSON.stringify(numStr));
          if (signatures.length >= 64) return signatures;
        }
      } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        // One level deep into nested object values (covers
        // `attributes: {tvmaze_id: 169}` style records). Don't
        // recurse further; we just want distinctive identifiers.
        for (const inner of Object.values(v as Record<string, unknown>)) {
          if (typeof inner === "number" && Number.isFinite(inner)) {
            const numStr = String(inner);
            if (numStr.length >= 2) {
              addSignature(numStr);
              addSignature(JSON.stringify(numStr));
              if (signatures.length >= 64) return signatures;
            }
          } else if (typeof inner === "string" && inner.length >= 4) {
            addStringSignatureVariants(inner);
            if (signatures.length >= 64) return signatures;
          }
        }
      }
    }
  }
  return signatures;
}

function isRecordRow(rec: Record<string, unknown>): boolean {
  return (
    typeof rec["recordKey"] === "string" ||
    (typeof rec["family"] === "string" &&
      rec["attributes"] !== null &&
      typeof rec["attributes"] === "object" &&
      !Array.isArray(rec["attributes"]))
  );
}
