// Observer worker.
//
// In-process, fire-and-forget from the snippet runtime's perspective. The
// worker reads a saved trajectory, runs the learning gate, and (if the gate
// passes) dispatches the authoring step. No file watcher; no
// background daemon. The snippet runtime's `onTrajectorySaved` callback is
// the trigger.
//
// Per design.md §8.3 + plan Phase 5: the production form clusters >=3
// trajectories before learning an interface. The MVP collapses N to 1 (every
// qualifying trajectory learns immediately) so the demo can show
// turn 5 of personas.md §3 ("Coming back the next day"). The shape-hash
// de-dup in the gate keeps re-running the same snippet from producing a
// second learned-interface file.

import path from "node:path";

import { defaultBaseDir } from "../paths.js";
import { enforceMapCap } from "../util/bounded.js";

import {
  getLibraryResolver,
  readTrajectory,
  type LibraryResolver,
  type TrajectoryRecord,
} from "../sdk/index.js";

import { authorFunction, type AuthorResult } from "./author.js";
import {
  convergenceCounts,
  convergenceThreshold,
  recordIntent,
} from "./convergenceIndex.js";
import { shouldCrystallise } from "./gate.js";
import {
  extractCandidateTemplates,
  extractNestedTemplates,
  readLibrarySnapshot,
  type CallTemplate,
} from "./template.js";
import { resolveWorkspaceHeadForTrajectory } from "./workspaceHead.js";

// --- Public types ----------------------------------------------------------

export type ObserveSkipped = {
  kind: "skipped";
  reason: string;
};

export type ObserveCrystallised = {
  kind: "crystallised";
  name: string;
  path: string;
  // Goal-3 iter 10: when sub-graph extraction also crystallises one or
  // more sibling helpers, they show up here. The primary `name`/`path`
  // still references the whole-trajectory crystallisation when one was
  // accepted; if only sub-graphs cleared the gate, the first sub-graph
  // is promoted to the primary.
  additional?: Array<{ name: string; path: string }>;
};

export type ObserveResult = ObserveSkipped | ObserveCrystallised;

export type ObserverOpts = {
  baseDir?: string;
  // Restrict observation to a single tenant. The trajectory file's
  // `tenantId` field still rules; a mismatch is surfaced as a `skipped`.
  // Useful for tests and for installations where one observer instance
  // serves one tenant.
  tenantId?: string;
  codifierSkill?: string | null;
  // Override the resolver. Defaults to the SDK module-level singleton
  // wired by `installSnippetRuntime`.
  libraryResolver?: LibraryResolver;
  // Workspace commits are written by the client after /v1/snippets returns.
  // The observer waits briefly for result/HEAD.json before deciding whether
  // this commit is still the current worktree HEAD.
  workspaceHeadTimeoutMs?: number;
  // Attribute keys that the record-value signature extractor allows as
  // short-string identifiers. Defaults (id/entity/code/slug) cover the
  // generic case; dataset evals whose records use additional identifier
  // columns set this list. See author.ts DEFAULT_RECORD_IDENTIFIER_KEYS.
  identifierAttributeKeys?: readonly string[];
};

// --- Observer --------------------------------------------------------------

// Cap the in-flight-promise map so a long-lived data plane doesn't
// accumulate trajectory ids forever. 256 covers a realistic burst with
// headroom; FIFO eviction is fine since callers grab the promise at
// observation time.
const OBSERVER_PROMISE_CAP = 256;

export class Observer {
  private readonly baseDir: string;
  private readonly tenantId: string | null;
  private readonly codifierSkill: string | null;
  private readonly resolverOverride: LibraryResolver | null;
  private readonly workspaceHeadTimeoutMs: number;
  private readonly identifierAttributeKeys: readonly string[] | undefined;

  // Test-friendly: every `observe(id)` call records its in-flight Promise
  // here so smoke tests can `await observer.observerPromise.get(id)`.
  // Bounded with FIFO eviction (`OBSERVER_PROMISE_CAP`) so a long-lived
  // data plane doesn't accumulate one entry per snippet forever; tests
  // settle within the cap and aren't affected.
  readonly observerPromise: Map<string, Promise<ObserveResult>> = new Map();

  constructor(opts: ObserverOpts = {}) {
    this.baseDir = opts.baseDir ?? defaultBaseDir();
    this.tenantId = opts.tenantId ?? null;
    this.codifierSkill =
      opts.codifierSkill ?? process.env["DATAFETCH_CODIFIER_SKILL"] ?? null;
    this.resolverOverride = opts.libraryResolver ?? null;
    this.workspaceHeadTimeoutMs = opts.workspaceHeadTimeoutMs ?? 2_000;
    this.identifierAttributeKeys = opts.identifierAttributeKeys;
  }

  async observe(trajectoryId: string): Promise<ObserveResult> {
    const inFlight = this.runObserve(trajectoryId);
    this.observerPromise.set(trajectoryId, inFlight);
    enforceMapCap(this.observerPromise, OBSERVER_PROMISE_CAP);
    return inFlight;
  }

  // --- internal -----------------------------------------------------------

  private async runObserve(trajectoryId: string): Promise<ObserveResult> {
    let trajectory: TrajectoryRecord;
    try {
      trajectory = await readTrajectory(trajectoryId, this.baseDir);
    } catch (err) {
      return {
        kind: "skipped",
        reason: `failed to read trajectory ${trajectoryId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }

    if (this.tenantId !== null && trajectory.tenantId !== this.tenantId) {
      return {
        kind: "skipped",
        reason: `trajectory tenant "${trajectory.tenantId}" != observer tenant "${this.tenantId}"`,
      };
    }

    const workspaceHead = await resolveWorkspaceHeadForTrajectory(trajectory, {
      timeoutMs: this.workspaceHeadTimeoutMs,
    });
    if (workspaceHead.kind === "stale") {
      return {
        kind: "skipped",
        reason: workspaceHead.reason,
      };
    }
    const allowOverwrite = workspaceHead.kind === "head";

    // Build the unified candidate set: the whole-trajectory template,
    // its contiguous sub-graphs (Goal-3 iter 10), AND the nested-call
    // templates grouped by scope.parentPrimitive (Goal-4 Change 2). Each
    // candidate carries the call slice it covers so the gate + author
    // can treat slice-relative indices correctly.
    let candidates: Candidate[];
    try {
      candidates = buildCandidates(trajectory);
    } catch (err) {
      return {
        kind: "skipped",
        reason: `template extraction failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
    if (candidates.length === 0) {
      return { kind: "skipped", reason: "no template candidates extracted" };
    }

    const snapshot = await readLibrarySnapshot({
      baseDir: this.baseDir,
      tenantId: trajectory.tenantId,
    });

    const wholeHash = candidates[0]!.template.shapeHash;
    const gateSnapshot =
      allowOverwrite && snapshot.shapeHashes.has(wholeHash)
        ? {
            shapeHashes: new Set(
              [...snapshot.shapeHashes].filter((h) => h !== wholeHash),
            ),
            learnedNames: snapshot.learnedNames,
            intentSignatures: snapshot.intentSignatures,
          }
        : snapshot;

    const resolver = this.resolverOverride ?? getLibraryResolver();
    if (!resolver) {
      return {
        kind: "skipped",
        reason: "no LibraryResolver registered (call installSnippetRuntime first)",
      };
    }

    // Goal-4 Change 3: read the convergence index once. A candidate
    // crystallises only when its intentSignature has been seen across
    // >= N distinct trajectories. The first trajectory of a new intent
    // is recorded-but-not-crystallised; the Nth convergent one passes.
    const threshold = convergenceThreshold();
    const baseCounts = await convergenceCounts(this.baseDir, trajectory.tenantId);
    // intentSignatures this trajectory has already recorded — so two
    // candidates from the SAME trajectory sharing a signature only add
    // +1 to the distinct-trajectory count.
    const recordedSignatures = new Set<string>();

    let primary: { name: string; path: string } | null = null;
    const additional: Array<{ name: string; path: string }> = [];
    const skipReasons: string[] = [];
    const acceptedHashes = new Set<string>(gateSnapshot.shapeHashes);
    const acceptedNames = new Set<string>(gateSnapshot.learnedNames);
    const acceptedIntentSignatures = new Set<string>(
      gateSnapshot.intentSignatures ?? [],
    );

    for (const candidate of candidates) {
      const { kind, template, slice } = candidate;
      const isSubGraph = kind !== "whole";
      const label = kind === "whole" ? "whole" : `${kind}:${template.topic}`;

      // Stage 1 — the structural gate (everything EXCEPT convergence).
      // Passing this makes the candidate "qualifying": a well-formed,
      // substrate-rooted, non-errored trajectory shape worth counting
      // toward convergence.
      const structuralGate = shouldCrystallise({
        trajectory,
        shapeHash: template.shapeHash,
        existing: { shapeHashes: acceptedHashes, learnedNames: acceptedNames },
        ...(isSubGraph ? { subGraph: true, callsSlice: slice } : {}),
      });
      if (!structuralGate.ok) {
        skipReasons.push(`${label}: ${structuralGate.reason}`);
        continue;
      }

      // Stage 2 — record the qualifying candidate's intentSignature into
      // the convergence index (once per trajectory per signature).
      if (!recordedSignatures.has(template.intentSignature)) {
        recordedSignatures.add(template.intentSignature);
        await recordIntent(this.baseDir, trajectory.tenantId, {
          intentSignature: template.intentSignature,
          trajectoryId: trajectory.id,
          shapeHash: template.shapeHash,
          templateName: template.name,
        });
      }

      if (!allowOverwrite && acceptedIntentSignatures.has(template.intentSignature)) {
        skipReasons.push(
          `${label}: intentSignature ${template.intentSignature} already has a learned helper`,
        );
        continue;
      }

      // Stage 3 — convergence check. baseCounts was read BEFORE this
      // trajectory recorded anything, so this trajectory contributes
      // exactly +1 to its signatures' distinct-trajectory count.
      const convergenceCount = (baseCounts.get(template.intentSignature) ?? 0) + 1;
      const convergenceGate = shouldCrystallise({
        trajectory,
        shapeHash: template.shapeHash,
        existing: { shapeHashes: acceptedHashes, learnedNames: acceptedNames },
        ...(isSubGraph ? { subGraph: true, callsSlice: slice } : {}),
        convergenceCount,
        convergenceThreshold: threshold,
      });
      if (!convergenceGate.ok) {
        skipReasons.push(`${label}: ${convergenceGate.reason}`);
        continue;
      }

      // Stage 4 — author. Sub-graph + nested templates carry
      // slice-relative call indices, so the author must see a
      // trajectory whose `calls` IS the slice.
      const authorTrajectory: TrajectoryRecord = isSubGraph
        ? { ...trajectory, calls: slice as TrajectoryRecord["calls"] }
        : trajectory;
      const authored: AuthorResult = await authorFunction({
        tenantId: trajectory.tenantId,
        baseDir: this.baseDir,
        trajectory: authorTrajectory,
        template,
        libraryResolver: resolver,
        codifierSkill: this.codifierSkill,
        allowOverwrite,
        // iter 3.2: forward the convergence gate's accepted-shape hint so
        // the new generic author (iter 3.3) can decide whether to fire.
        // The five existing renderers ignore acceptedShape entirely.
        ...(convergenceGate.ok && convergenceGate.acceptedShape
          ? { acceptedShape: convergenceGate.acceptedShape }
          : {}),
        // substrate-decouple: forward the dataset's declared identifier
        // columns to the record-value signature extractor. Orthogonal to
        // acceptedShape above.
        ...(this.identifierAttributeKeys !== undefined
          ? { identifierAttributeKeys: this.identifierAttributeKeys }
          : {}),
      });
      if (authored.kind === "skipped") {
        skipReasons.push(`${label}: ${authored.reason}`);
        continue;
      }
      acceptedHashes.add(template.shapeHash);
      acceptedNames.add(template.name);
      acceptedIntentSignatures.add(template.intentSignature);
      const slot = { name: authored.name, path: authored.path };
      if (primary === null) {
        primary = slot;
      } else {
        additional.push(slot);
      }
    }

    if (primary === null) {
      return {
        kind: "skipped",
        reason: skipReasons.join("; ") || "no template candidate cleared the gate",
      };
    }
    return {
      kind: "crystallised",
      name: primary.name,
      path: primary.path,
      ...(additional.length > 0 ? { additional } : {}),
    };
  }
}

// A unified crystallisation candidate: the template plus the call slice
// it covers and how it was derived. `whole` covers `trajectory.calls`;
// `subGraph` covers a contiguous slice; `nested` covers a group of
// depth>=1 calls sharing a scope.parentPrimitive.
type Candidate = {
  kind: "whole" | "subGraph" | "nested";
  template: CallTemplate;
  slice: ReadonlyArray<TrajectoryRecord["calls"][number]>;
};

function buildCandidates(trajectory: TrajectoryRecord): Candidate[] {
  const out: Candidate[] = [];
  const wholeAndSub = extractCandidateTemplates(trajectory);
  wholeAndSub.forEach((template, i) => {
    out.push({
      kind: i === 0 ? "whole" : "subGraph",
      template,
      slice:
        i === 0
          ? trajectory.calls
          : sliceForTemplate(trajectory, template),
    });
  });
  for (const { template, calls } of extractNestedTemplates(trajectory)) {
    out.push({ kind: "nested", template, slice: calls });
  }
  return out;
}

// Identify which contiguous slice of trajectory.calls a sub-graph template
// was extracted from. We look for a contiguous span of calls whose
// primitives match the template's step primitives in order; the search is
// O(N*K) but trajectories are small. Falls back to the whole calls array
// when no slice matches (defensive — should not happen in practice).
function sliceForTemplate(
  trajectory: TrajectoryRecord,
  template: CallTemplate,
): ReadonlyArray<TrajectoryRecord["calls"][number]> {
  const calls = trajectory.calls;
  const stepPrimitives = template.steps.map((s) => s.primitive);
  if (stepPrimitives.length === 0) return calls;
  const n = calls.length;
  const k = stepPrimitives.length;
  for (let start = 0; start + k <= n; start += 1) {
    let match = true;
    for (let i = 0; i < k; i += 1) {
      if (calls[start + i]!.primitive !== stepPrimitives[i]) {
        match = false;
        break;
      }
    }
    if (match) return calls.slice(start, start + k);
  }
  return calls;
}
