// SaC-aligned PoC arm selector + lifecycle-ledger helpers (S1 runner-core).
//
// Authoritative spec: kb/plans/009-sac-aligned-poc-skillcraft.md (v2).
// Binding contract: experiments/2026-06-sac-poc/CONTRACT.md.
//
// This module is owned exclusively by the S1 runner-core stream, alongside
// eval/harness/skillcraftFullDatafetch.ts. It pins:
//   - the SAC_ARM enum + resolveSacArm() (no silent default; throws on unknown)
//   - the armConfig(arm) derivation table (CONTRACT §a) that drives the
//     existing DATAFETCH_INTERFACE_MODE / DATAFETCH_DISABLE_LEARNING toggles
//     plus the three NEW axes (governanceGate, resultsCache, recipeHint) and
//     the phase count
//   - the shared prompt-parity-hash machinery (CONTRACT §d): a single binding
//     slot + the promptHash / promptParityHash / bindingLineHash triple
//   - the arm5a strict results-cache key (sha256(toolName + " " +
//     stableStringify(args)), object keys sorted)
//   - the arm5b recipe distillation shape (<=600 chars)
//
// The runner consumes these at its existing toggle sites; this module holds
// no I/O so it stays trivially testable.

import { createHash } from "node:crypto";

import type { InterfaceMode } from "../../src/hooks/mode.js";

export type SacArm =
  | "arm0"
  | "arm1"
  | "arm2"
  | "arm3"
  | "arm4"
  | "arm5a"
  | "arm5b"
  // C2 comparator: a brand-new dataset ONBOARDED (generated df.d.ts) but with NO
  // online crystallisation/governance — distinct from arm2 (learning-on). Tests
  // zero-src onboarding SUFFICIENCY vs the arm1 inline-rewrite bar (B-3).
  | "armOnb"
  // C8 control: persistence-as-TRANSCRIPT — raw prior trajectories injected into
  // context at an EQUAL token budget vs arm2's df.lib abstraction (B-4). NO
  // callable learned interface; the br19 control the 7-arm ladder omitted.
  | "armT";

export const SAC_ARMS: readonly SacArm[] = [
  "arm0",
  "arm1",
  "arm2",
  "arm3",
  "arm4",
  "arm5a",
  "arm5b",
  "armOnb",
  "armT",
] as const;

export type SacArmId =
  | "sac-arm0"
  | "sac-arm1"
  | "sac-arm2"
  | "sac-arm3"
  | "sac-arm4"
  | "sac-arm5a"
  | "sac-arm5b"
  | "sac-armOnb"
  | "sac-armT";

export type PhaseTag = "single" | "phase1-build" | "phase2-reuse";

// The complete per-arm derivation (CONTRACT §a). `withholdTools` is the
// arm0-only flag the runner reads to pass an empty tool bundle.
export interface ArmConfig {
  arm: SacArm;
  armId: SacArmId;
  // The interface mode this arm pins (CONTRACT R1). The runner sets
  // process.env["DATAFETCH_INTERFACE_MODE"] from this BEFORE any
  // getInterfaceMode() read (Risk R-1 in the contract).
  interfaceMode: InterfaceMode;
  // false for arm0/arm1/arm5a/arm5b -> the runner takes the existing
  // disableLearning path; true for arm2/arm3/arm4.
  learningEnabled: boolean;
  // true for arm2 and arm4-phase1; false for arm3 (the decoupled axis).
  // null for arms where no learned helper is crystallised (arm0/1/5a/5b).
  governanceGate: boolean | null;
  // true only for arm5a (strict name+args results cache, no authored code).
  resultsCache: boolean;
  // true only for arm5b (NL/schema recipe hint distilled from phase-1).
  recipeHint: boolean;
  // 2 for arm4/arm5a/arm5b (phase-1 build, phase-2 fresh-process held-out);
  // 1 otherwise.
  phases: 1 | 2;
  // arm0 only: tools are withheld from the prompt + snippet runtime.
  withholdTools: boolean;
  // arm1 only: wipe the lib overlay between every question (no persistence).
  wipeLibBetweenQuestions: boolean;
  // armT only (C8 control): inject the raw prior trajectories into context at an
  // equal token budget instead of exposing a callable df.lib abstraction. The
  // runner threads captured TrajectoryRecords through truncateTrajectoriesToBudget.
  // Omitted/false for every other arm.
  rawTranscriptInjection?: boolean;
}

export function armConfig(arm: SacArm): ArmConfig {
  const armId = `sac-${arm}` as SacArmId;
  switch (arm) {
    case "arm0":
      return {
        arm,
        armId,
        interfaceMode: "legacy",
        learningEnabled: false,
        governanceGate: null,
        resultsCache: false,
        recipeHint: false,
        phases: 1,
        withholdTools: true,
        wipeLibBetweenQuestions: false,
      };
    case "arm1":
      return {
        arm,
        armId,
        interfaceMode: "hooks-candidate-only",
        learningEnabled: false,
        governanceGate: null,
        resultsCache: false,
        recipeHint: false,
        phases: 1,
        withholdTools: false,
        wipeLibBetweenQuestions: true,
      };
    case "arm2":
      return {
        arm,
        armId,
        interfaceMode: "hooks-draft",
        learningEnabled: true,
        governanceGate: true,
        resultsCache: false,
        recipeHint: false,
        phases: 1,
        withholdTools: false,
        wipeLibBetweenQuestions: false,
      };
    case "arm3":
      return {
        arm,
        armId,
        interfaceMode: "hooks-draft",
        learningEnabled: true,
        // The decoupled ablation: crystallise + make callable, SKIP the
        // quarantine/replay promotion gate (CONTRACT §f).
        governanceGate: false,
        resultsCache: false,
        recipeHint: false,
        phases: 1,
        withholdTools: false,
        wipeLibBetweenQuestions: false,
      };
    case "arm4":
      return {
        arm,
        armId,
        interfaceMode: "hooks-draft",
        learningEnabled: true,
        // Gate runs during phase-1 build; phase-2 is hydrate-only.
        governanceGate: true,
        resultsCache: false,
        recipeHint: false,
        phases: 2,
        withholdTools: false,
        wipeLibBetweenQuestions: false,
      };
    case "arm5a":
      return {
        arm,
        armId,
        interfaceMode: "hooks-candidate-only",
        learningEnabled: false,
        governanceGate: null,
        resultsCache: true,
        recipeHint: false,
        phases: 2,
        withholdTools: false,
        wipeLibBetweenQuestions: false,
      };
    case "arm5b":
      return {
        arm,
        armId,
        interfaceMode: "hooks-candidate-only",
        learningEnabled: false,
        governanceGate: null,
        resultsCache: false,
        recipeHint: true,
        phases: 2,
        withholdTools: false,
        wipeLibBetweenQuestions: false,
      };
    case "armOnb":
      // C2 (B-3): onboarded dataset, generated df.d.ts surface, NO online
      // crystallisation and NO governance gate — the agent uses the zero-src
      // onboarded interface as-is. Single-phase; tools available; lib NOT wiped
      // (a stable onboarded overlay, just no learning). Distinct from arm2,
      // which learns mid-run.
      return {
        arm,
        armId,
        interfaceMode: "legacy",
        learningEnabled: false,
        governanceGate: null,
        resultsCache: false,
        recipeHint: false,
        phases: 1,
        withholdTools: false,
        wipeLibBetweenQuestions: false,
      };
    case "armT":
      // C8 (B-4): persistence-as-transcript control. Same tool surface as arm2,
      // NO callable learned interface; the runner injects the raw prior
      // trajectories into context at a budget matched to arm2's learned-interface
      // payload (truncateTrajectoriesToBudget). Single-phase, no learning, no gate.
      return {
        arm,
        armId,
        interfaceMode: "hooks-candidate-only",
        learningEnabled: false,
        governanceGate: null,
        resultsCache: false,
        recipeHint: false,
        phases: 1,
        withholdTools: false,
        wipeLibBetweenQuestions: false,
        rawTranscriptInjection: true,
      };
    default: {
      const exhaustive: never = arm;
      throw new Error(`unhandled SAC_ARM: ${String(exhaustive)}`);
    }
  }
}

// Resolve SAC_ARM from the environment. No silent default: a present-but-bad
// value throws (CONTRACT invariant 1). A MISSING value returns null so the
// runner can fall back to the legacy armId derivation (so existing Goal-4
// runs are untouched).
export function resolveSacArm(env: NodeJS.ProcessEnv = process.env): SacArm | null {
  const raw = (env["SAC_ARM"] ?? "").trim();
  if (raw.length === 0) return null;
  if ((SAC_ARMS as readonly string[]).includes(raw)) return raw as SacArm;
  throw new Error(
    `unknown SAC_ARM "${raw}"; expected one of ${SAC_ARMS.join(", ")}`,
  );
}

// CONTRACT invariant 2: a run must not set both SAC_ARM and a conflicting
// DATAFETCH_INTERFACE_MODE / DATAFETCH_DISABLE_LEARNING. The runner derives
// both from SAC_ARM; if the operator ALSO set them manually to a different
// value, fail the run. We tolerate a manual setting that AGREES with the
// derived value (idempotent re-export).
export function assertNoArmToggleConflict(input: {
  config: ArmConfig;
  env?: NodeJS.ProcessEnv;
}): void {
  const env = input.env ?? process.env;
  const manualMode = (env["DATAFETCH_INTERFACE_MODE"] ?? "").trim();
  if (manualMode.length > 0 && manualMode !== input.config.interfaceMode) {
    throw new Error(
      `SAC_ARM=${input.config.arm} pins DATAFETCH_INTERFACE_MODE=${input.config.interfaceMode}, ` +
        `but DATAFETCH_INTERFACE_MODE=${manualMode} was set manually; remove the manual flag.`,
    );
  }
  const manualDisable = (env["DATAFETCH_DISABLE_LEARNING"] ?? "").trim().toLowerCase();
  if (manualDisable.length > 0) {
    const manualDisableBool = manualDisable === "1" || manualDisable === "true" || manualDisable === "yes";
    const derivedDisable = !input.config.learningEnabled;
    if (manualDisableBool !== derivedDisable) {
      throw new Error(
        `SAC_ARM=${input.config.arm} derives DATAFETCH_DISABLE_LEARNING=${derivedDisable ? "1" : "0"}, ` +
          `but DATAFETCH_DISABLE_LEARNING=${manualDisable} was set manually; remove the manual flag.`,
      );
    }
  }
}

// --- prompt-parity-hash machinery (CONTRACT §d) ----------------------------
//
// The shared renderer emits a prompt with EXACTLY ONE binding-line region.
// We mask that region to a fixed sentinel to compute the parity hash that
// arm1 and arm4 must share. The sentinel is a fixed token so the masked
// prompt is byte-stable regardless of binding content.
export const BINDING_SENTINEL = "<<<SAC_BINDING_LINE>>>";

export interface ParityHashes {
  prompt: string;
  promptHash: string;
  promptParityHash: string;
  bindingLineHash: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// Assemble a prompt from its body parts and a single binding line, returning
// the full prompt plus the three pinned hashes. The body is everything around
// the binding slot; the renderer is responsible for placing `bindingLine`
// verbatim (and ONLY there) inside `assemble`.
//
// We compute the parity hash by re-running `assemble` with the sentinel in
// the binding slot, which guarantees the masked prompt differs from the real
// prompt ONLY in the binding region (no fragile string surgery).
export function computeParityHashes(input: {
  assemble: (bindingLine: string) => string;
  bindingLine: string;
}): ParityHashes {
  const prompt = input.assemble(input.bindingLine);
  const masked = input.assemble(BINDING_SENTINEL);
  return {
    prompt,
    promptHash: sha256(prompt),
    promptParityHash: sha256(masked),
    bindingLineHash: sha256(input.bindingLine),
  };
}

// The two pinned binding lines (CONTRACT §d). arm1 writes an inline ephemeral
// helper this episode; arm4 calls the persisted df.lib.<helper> interface.
export function arm1BindingLine(): string {
  return [
    "BINDING (arm1, inline-rewrite, no persistence): For the repeated per-entity/per-tool fan-out in this task,",
    "write a single small helper INLINE in `scripts/answer.ts` and reuse it for every entity within THIS episode.",
    "Do not persist it under `lib/`; it lives only for this one answer and is discarded afterward.",
  ].join(" ");
}

// arm4 phase-2 (warm reuse): call the ACTUAL persisted/hydrated helper by its
// real name (resolved from df.d.ts / availableLibFunctions by the caller). The
// "(read its exact input in df.d.ts)" + "never call a name not in df.d.ts"
// clauses prevent the agent from inventing a non-existent helper name.
export function arm4BindingLine(helperName: string): string {
  return [
    `BINDING (arm4 phase-2, frozen-library reuse): For the repeated per-entity/per-tool fan-out in this task, CALL the`,
    `persisted learned helper \`df.lib.${helperName}(...)\` (it is listed in df.d.ts — read its exact input shape there)`,
    "instead of re-deriving the fan-out inline; unwrap once with `(await df.lib." + helperName + "({...})).value`.",
    "Never call a `df.lib.*` name that is not listed in df.d.ts.",
  ].join(" ");
}

// arm4 phase-1 (library BUILD): there is NO frozen helper yet, so DO NOT
// instruct calling a named learned helper. Route the fan-out through the real
// always-present seed so the substrate crystallises + persists a reusable
// helper for phase-2. (Replaces the old phase-blind binding that told phase-1
// to call a non-existent `df.lib.<placeholder>`, which caused phase-1 to fail.)
export function arm4Phase1BindingLine(): string {
  return [
    "BINDING (arm4 phase-1, library BUILD): For the repeated per-entity/per-tool fan-out in this task, do NOT re-derive",
    "it inline. Route the fan-out through the persisted seed interface",
    "`df.lib.per_entity({ entityIds, toolBundle, toolNames, paramName })` (listed in df.d.ts) so the substrate LEARNS",
    "and persists a reusable helper for the next session. If a learned `df.lib.<name>` fan-out helper is already listed",
    "in df.d.ts, call that instead. Never call a `df.lib.*` name that is not listed in df.d.ts.",
  ].join(" ");
}

// --- arm5a strict results-cache key (CONTRACT §arm5a) ----------------------
//
// key = sha256(toolName + " " + stableStringify(args)) where stableStringify
// sorts object keys recursively. Strict name+args; new-argument phase-2
// siblings therefore miss by construction (R4 zero-decisive-hit invariant).
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function resultsCacheKey(toolName: string, args: unknown): string {
  return sha256(`${toolName} ${stableStringify(args ?? {})}`);
}

// --- arm5b recipe distillation (CONTRACT §arm5b) ---------------------------
//
// A short NL/schema hint distilled from the converged phase-1 intent. Pinned
// shape: @intent-signature + tool bundle + param name + a one-line NL gloss of
// the fan-out shape, capped at RECIPE_MAX_CHARS. No callable code.
export const RECIPE_MAX_CHARS = 600;

export interface RecipeInput {
  family: string;
  intentSignature: string | null;
  toolBundle: string;
  toolNames: string[];
  paramName: string;
}

export function distilRecipe(input: RecipeInput): string {
  const sig = input.intentSignature ?? "FANOUT(tool)";
  const tools = input.toolNames.slice(0, 8).join(", ");
  const recipe = [
    `# recipe for family ${input.family}`,
    `intent-signature: ${sig}`,
    `tool-bundle: ${input.toolBundle}`,
    `param-name: ${input.paramName}`,
    `tool-names: ${tools}`,
    "shape: repeated per-entity tool fan-out — for each entity id, call the listed tools in the bundle",
    `with { [${input.paramName}]: id }, then aggregate the rows. Re-author this helper inline each episode;`,
    "no persisted callable code is provided.",
  ].join("\n");
  return recipe.length > RECIPE_MAX_CHARS ? recipe.slice(0, RECIPE_MAX_CHARS) : recipe;
}

// --- lifecycle ledger arithmetic (CONTRACT §b) -----------------------------
//
// effectiveModelContextTokens = agentInputTokens + agentCachedInputTokens +
// agentOutputTokens (cached input counted at FULL weight, NOT subtracted).
// This is the HEADLINE model-context token field the break-even + attribution
// math reads. The cross-arm scorer ALSO derives two sensitivity units from the
// same components via modelContextCostAtCachedWeight() below:
//   - fresh+output (cachedWeight = 0): the cache-excluded marginal
//   - dollar-equivalent (cachedWeight ~= 0.1): the REQUIRED tie-breaker the
//     headline token claim must survive (cached reads bill ~10x cheaper).
export function effectiveModelContextTokens(input: {
  agentInputTokens: number;
  agentCachedInputTokens?: number | null;
  agentOutputTokens: number;
}): number {
  // Full-weight model-context tokens (CONTRACT §b / plan R5): cached input is
  // counted at FULL weight, NOT subtracted. In the claude-p / Anthropic usage
  // convention, `inputTokens` is the fresh (uncached) input and
  // `cachedInputTokens` is the ADDITIVE cache-read subset (observed 8 fresh vs
  // 139093 cached on a real episode), so the model actually processed
  // input + cached + output. Dropping the cached term re-imports the exact
  // prompt-cache confound this metric exists to control.
  return (
    input.agentInputTokens +
    (input.agentCachedInputTokens ?? 0) +
    input.agentOutputTokens
  );
}

// Model-context cost under an arbitrary cache weight (CONTRACT §c sensitivity
// ladder). `cachedWeight` reweights the cache-read subset only:
//   1.0  -> effectiveModelContextTokens (the HEADLINE unit; cached at full weight)
//   0.0  -> fresh input + output (cache excluded)
//   ~0.1 -> dollar-equivalent (cached reads bill ~0.1x fresh input)
// At cachedWeight = 1 this is IDENTICAL to effectiveModelContextTokens, so the
// scorer's full-weight sensitivity row reproduces the primary M* exactly (a
// no-op consistency check, not a second metric).
export function modelContextCostAtCachedWeight(input: {
  rawInputTokens: number;
  cachedInputTokens?: number | null;
  outputTokensLedger: number;
  cachedWeight: number;
}): number {
  return (
    input.rawInputTokens +
    input.cachedWeight * (input.cachedInputTokens ?? 0) +
    input.outputTokensLedger
  );
}

// inlineCostPerQ (arm1) / warmCallCostPerQ (arm4 phase-2) =
//   effectiveModelContextTokens - parityFloorTokens, clamped at 0.
export function marginalCostPerQ(input: {
  effectiveModelContextTokens: number;
  parityFloorTokens: number;
}): number {
  return Math.max(0, input.effectiveModelContextTokens - input.parityFloorTokens);
}

// A coarse token counter for the parity floor (CONTRACT §b pins the floor as
// the model-context tokens of the parity-masked prompt body, "computed by the
// runner's token counter"). We do not have the model tokenizer offline, so we
// use the widely-used ~4-chars-per-token approximation. The scorer recomputes
// marginals from the emitted parityFloorTokens, so this counter only needs to
// be CONSISTENT across arm1 and arm4 (it is byte-derived from the parity-masked
// body, which is identical across the two arms by the parity invariant).
// TODO(sac-poc): swap to the real model tokenizer if a tiktoken-equivalent is
// vendored; the ~4 c/t approximation is sufficient for arm1-vs-arm4 parity
// because the floor is byte-identical across the pair.
export function approxTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

// --- C8 equal-budget mechanic (B-4) ----------------------------------------
//
// The persistence-as-abstraction-vs-transcript contrast (C8) is only fair if
// armT (raw prior-trajectory injection) is given the SAME context-token budget
// the arm2 learned-interface payload occupies. This packs the most-RECENT prior
// trajectories into a token budget B: it fills whole trajectories newest-first,
// then truncates the single boundary trajectory to the remaining budget. Pure +
// deterministic (recency by input order: oldest-first in, chronological out), so
// the budget match is reproducible and the scorer can recompute it.
export interface BudgetedTranscript {
  // Trajectory ids included (chronological order), in the emitted payload.
  includedIds: string[];
  // The injected raw-transcript payload (chronological), <= budget once counted.
  payload: string;
  // approxTokenCount(payload) — the realised injected budget the scorer matches.
  tokens: number;
  // The single trajectory truncated at the budget boundary, if any.
  truncatedId: string | null;
}

export function truncateTrajectoriesToBudget(
  // Prior trajectories as serialised text payloads, in CHRONOLOGICAL order
  // (oldest first). The newest are preferred when the budget cannot hold all.
  trajectories: ReadonlyArray<{ id: string; text: string }>,
  budgetTokens: number,
): BudgetedTranscript {
  const SEP = "\n\n";
  if (budgetTokens <= 0 || trajectories.length === 0) {
    return { includedIds: [], payload: "", tokens: 0, truncatedId: null };
  }
  const sepCost = approxTokenCount(SEP); // join separator between included trajectories
  const chosen: { id: string; text: string }[] = [];
  let remaining = budgetTokens;
  let truncatedId: string | null = null;
  // Walk newest -> oldest; unshift so the payload stays chronological. Each
  // trajectory after the first also costs the join separator, so the realised
  // payload token count stays within budget.
  for (let i = trajectories.length - 1; i >= 0; i -= 1) {
    const t = trajectories[i]!;
    if (remaining <= 0) break;
    const lead = chosen.length > 0 ? sepCost : 0;
    const tk = approxTokenCount(t.text);
    if (tk + lead <= remaining) {
      chosen.unshift({ id: t.id, text: t.text });
      remaining -= tk + lead;
    } else {
      // Truncate this boundary trajectory to the remaining token budget
      // (after reserving the separator if anything is already chosen).
      const textBudget = Math.max(0, remaining - lead);
      const chars = textBudget * 4;
      const truncated = t.text.slice(0, chars);
      if (truncated.length > 0) {
        chosen.unshift({ id: t.id, text: truncated });
        truncatedId = t.id;
      }
      remaining = 0;
      break;
    }
  }
  const payload = chosen.map((c) => c.text).join(SEP);
  return {
    includedIds: chosen.map((c) => c.id),
    payload,
    tokens: approxTokenCount(payload),
    truncatedId,
  };
}
