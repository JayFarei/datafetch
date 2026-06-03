// Function authoring.
//
// Two paths:
//   - Pure composition (preferred for MVP): generate the TS source directly
//     from the template. The function body composes the same primitives in
//     the same order with the same dataflow. Deterministic; no LLM.
//   - Codifier-skill (optional fallback): dispatch a configured seed or
//     tenant skill via Flue. Used when the pure path can't produce a valid
//     `fn({...})` source — for example, if the trajectory shape involves
//     reshaping the template extractor doesn't know how to handle.
//
// The author writes to `<baseDir>/lib/<tenantId>/<name>.ts`. It refuses to
// overwrite unless a later workspace HEAD supersedes the same learned shape.
// Validation: after writing, it asks the supplied
// LibraryResolver to load the file; if loading fails (TS error, missing
// fn export, schema parse), it deletes the file and returns the failure
// so the observer can surface a clean `kind: "skipped"`.

import { promises as fsp } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getBodyDispatcher,
  type LibraryResolver,
  type TrajectoryRecord,
} from "../sdk/index.js";

import { renderFromAgentSource } from "./authorFromSource.js";
import {
  findCodegenSpecialization,
  type CodegenContext,
} from "./specializationRegistry.js";

import type {
  CallTemplate,
  TemplateParameter,
  TemplateStep,
  TypeLabel,
} from "./template.js";

// --- Types -----------------------------------------------------------------

export type AuthorOk = {
  kind: "authored";
  name: string;
  path: string;
  source: string;
};

export type AuthorSkipped = {
  kind: "skipped";
  reason: string;
};

export type AuthorResult = AuthorOk | AuthorSkipped;

export type AuthorFunctionArgs = {
  tenantId: string;
  baseDir: string;
  trajectory: TrajectoryRecord;
  template: CallTemplate;
  libraryResolver: LibraryResolver;
  // Workspace HEAD promotion is allowed to replace an older authored file
  // with the same stable shape/name when a later accepted commit supersedes it.
  allowOverwrite?: boolean;
  // Skill name to dispatch when the pure-composition path can't produce
  // valid source. Null/undefined disables the fallback.
  codifierSkill?: string | null;
  // iter 3.2: structural hint from the gate's acceptedShape. Only the new
  // generic author in src/observer/authorFromSource.ts (iter 3.3) reads
  // this; the five existing render paths above ignore it.
  acceptedShape?: { hasInlineComputation: boolean };
  // Attribute keys that the record-value signature extractor should
  // short-string-rescue (allow values <3 chars through). The substrate's
  // built-in defaults cover id/entity/code/slug; a dataset whose records
  // expose additional identifier columns (e.g. country_code, isbn) extends
  // the list at observer install time. Omitted: use defaults.
  identifierAttributeKeys?: readonly string[];
};

// --- Public API ------------------------------------------------------------

export async function authorFunction(
  args: AuthorFunctionArgs,
): Promise<AuthorResult> {
  const { tenantId, baseDir, trajectory, template, libraryResolver } = args;

  const dir = path.join(baseDir, "lib", tenantId);
  const file = path.join(dir, `${template.name}.ts`);

  // Don't overwrite. The observer's de-dup gate should catch the
  // shape-hash before we get here, but a name collision (e.g. a hand-
  // authored file that happens to share the slug) should not be
  // clobbered.
  const existingSource = await readExistingSource(file);
  if (existingSource !== null && args.allowOverwrite !== true) {
    return { kind: "skipped", reason: `name already exists at ${file}` };
  }

  // Goal-4 iter 5: when the candidate is a PURE tool fan-out (every
  // step is a tool.* call — the dominant cross-family intent from the
  // iter-2 cluster analysis, and what every nested-template extraction
  // produces), author it as a PARAMETERISED per_entity-shaped helper.
  // The capability slots (toolBundle / toolNames / paramName) are ALWAYS
  // function inputs, never frozen into the body from the template's
  // concrete primitives — that freeze is exactly what would kill
  // cross-shape transfer (R9). Falls back to the pure-composition path
  // when the template is not a pure fan-out.
  // iter 3.3 dispatch: when the gate's acceptedShape hint flags an
  // inline-computation trajectory (single db.* + numeric answer + a
  // non-trivial source body), the generic source-to-helper author runs
  // BEFORE the existing cascade. The five existing renderers were tuned
  // for tool-fanout and record-tool shapes; on a single-db.* trajectory
  // they would emit a placeholder helper that misses the inline-math
  // payload (generatePureSource wraps the single primitive). When
  // hasInlineComputation is false (every legacy tool-fanout/record-tool
  // shape trajectory), the order reverts to the existing cascade and
  // renderFromAgentSource is unreached — the new author is DORMANT on
  // those shapes (verified by walk-artifacts in iter 4).
  //
  // Strictly additive: the five existing render-path bodies are
  // unmodified above and below this dispatch.
  //
  // identifierAttributeKeys (substrate-decouple) threads through the
  // cascade renderers so the record-value signature extractor uses the
  // dataset's declared identifier columns; orthogonal to the
  // inline-compute dispatch above.
  const identifierAttributeKeys = args.identifierAttributeKeys;
  const inlineComputeFirst = args.acceptedShape?.hasInlineComputation === true
    ? renderFromAgentSource({ trajectory, template, acceptedShape: args.acceptedShape })
    : null;
  const fanOutSource =
    inlineComputeFirst ??
    renderToolFanoutEnrichmentSource({ template, trajectory, identifierAttributeKeys }) ??
    renderRecordToolEnrichmentSource({ template, trajectory, identifierAttributeKeys }) ??
    renderRecordToolFanOutSource({ template, trajectory, identifierAttributeKeys }) ??
    renderFanOutSource({ template, trajectory, identifierAttributeKeys });
  const pureSource = fanOutSource ?? generatePureSource({
    template,
    trajectory,
    identifierAttributeKeys,
  });
  // End-of-cascade fallback: when none of the above produced source AND
  // the gate flagged inline computation (which the existing renderers
  // cannot handle), reach for renderFromAgentSource one more time. This
  // is a no-op when inlineComputeFirst already fired.
  const generic = pureSource ?? renderFromAgentSource({ trajectory, template, acceptedShape: args.acceptedShape });

  let source: string | null = generic;
  let pathTaken: "pure" | "codifier" | "from-source" =
    inlineComputeFirst !== null || (pureSource === null && generic !== null)
      ? "from-source"
      : "pure";

  if (source === null) {
    // Fallback: dispatch the codifier skill via the registered Flue
    // dispatcher. The dispatcher takes the trajectory + first lib call
    // as input and returns `{functionName, description, source}`.
    const skill = args.codifierSkill ?? null;
    if (skill === null) {
      return {
        kind: "skipped",
        reason:
          "pure-composition path could not emit source and no codifier skill is configured",
      };
    }
    const codified = await dispatchCodifier({ skill, trajectory });
    if (codified === null) {
      return {
        kind: "skipped",
        reason:
          "pure-composition path could not emit source and codifier skill produced no result",
      };
    }
    source = codified;
    pathTaken = "codifier";
  }

  // V1: ReGAL-style cost-effective-promotion gate.
  //
  // ReGAL (arXiv:2401.16467) only adds a refactored helper to its code
  // bank after verifying the refactored program preserves outputs. We
  // approximate that with a structural cost-coverage check: a helper
  // earns promotion only if the slice it replaces is "substantial"
  // enough that calling the helper measurably saves agent output
  // tokens. The metric is `coverageDensity = min(steps, 6) * distinctTools / 6`.
  // - Single-tool fan-outs (1 tool, many entities) get density ~0.5-1
  //   and barely save anything vs an inline loop with one `df.tool` call.
  // - Multi-tool fan-outs (2+ tools, same entity) get density >= 2 and
  //   actually save 2+ inline `df.tool` calls per entity.
  // - Composite signatures (db→FANOUT(tool)→lib→FANOUT(tool)) always
  //   have density well above 2.
  //
  // When REGAL_PROMOTION_GATE=1, helpers with density < 2 are tagged
  // as `narrow` and SKIPPED (not written to lib/) so they don't
  // contaminate the learned-reuse prompt or count toward R6/R7/R8.
  // When the env is unset, the tag is still stamped into the header
  // for diagnostic visibility but no skip happens — backwards-compat.
  const distinctToolPrimitives = new Set<string>();
  for (const step of template.steps) {
    if (step.primitive.startsWith("tool.")) {
      distinctToolPrimitives.add(step.primitive);
    }
  }
  const stepCount = template.steps.length;
  const distinctTools = distinctToolPrimitives.size;
  const coverageDensity = Math.min(stepCount, 6) * distinctTools / 6;
  const promotionState: "verified" | "narrow" =
    coverageDensity >= 2 ? "verified" : "narrow";
  const gateActive = (process.env["REGAL_PROMOTION_GATE"] ?? "") === "1";
  if (gateActive && promotionState === "narrow") {
    return {
      kind: "skipped",
      reason: `REGAL gate: coverage-density=${coverageDensity.toFixed(2)} below 2.0 (steps=${stepCount}, distinctTools=${distinctTools})`,
    };
  }
  // Stamp the gate decision into the helper header for downstream
  // visibility. The frontmatter is between the leading `/* ---` and
  // `--- */` markers; we insert `promotion-state` + `coverage-density`
  // lines just before the closing marker.
  source = stampPromotionMetadata(source, {
    promotionState,
    coverageDensity,
    stepCount,
    distinctTools,
    gateActive,
  });

  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(file, source, "utf8");

  const { getHookRegistry } = await import("../hooks/registry.js");
  const { hooksEnabled, getInterfaceMode } = await import("../hooks/mode.js");
  const registry = getHookRegistry();

  // Validate the written file by attempting to load it through the
  // resolver. If anything fails, behaviour depends on interface mode:
  //   - legacy:  preserve the prior behaviour — delete the file (or
  //              restore the previous version), surface skipped.
  //   - any hooks mode: record a hook manifest, mark it quarantined, do
  //              NOT delete the implementation file. The registry — not
  //              the on-disk .ts file — owns public callability now, so
  //              keeping the bad body around lets us treat the observer
  //              signal as durable provider intent without exposing the
  //              broken body to agents.
  const callable = await libraryResolver.resolve(tenantId, template.name);
  if (!callable) {
    if (!hooksEnabled()) {
      if (existingSource !== null) {
        await fsp.writeFile(file, existingSource, "utf8");
      } else {
        await fsp.rm(file, { force: true });
      }
      return {
        kind: "skipped",
        reason: `authored file failed to load (path=${pathTaken})`,
      };
    }
    if (registry) {
      await registry.validateImplementation({
        tenantId,
        name: template.name,
        filePath: file,
        implementationKind: pathTaken === "codifier" ? "skill" : "typescript",
        intent: `learned interface ${template.name}`,
        trajectoryId: trajectory.id,
        shapeHash: template.shapeHash,
      });
    }
    return {
      kind: "skipped",
      reason: `authored file failed to load (path=${pathTaken}); hook recorded as quarantined under interface mode ${getInterfaceMode()}`,
    };
  }

  if (registry) {
    await registry.validateImplementation({
      tenantId,
      name: template.name,
      filePath: file,
      implementationKind: pathTaken === "codifier" ? "skill" : "typescript",
      intent: `learned interface ${template.name}`,
      trajectoryId: trajectory.id,
      shapeHash: template.shapeHash,
    });
    // Goal-3 iter 12: static-shape smoke replay. Promotes the manifest
    // to validated-typescript when the authored body's primitive call
    // sequence matches what the template prescribes; otherwise stays at
    // candidate-typescript with callable-with-fallback (the structured
    // warning lives in stats.replaysFailed).
    try {
      await registry.smokeReplayAndPromote({
        tenantId,
        name: template.name,
        filePath: file,
        expectedPrimitives: template.steps.map((s) => s.primitive),
      });
    } catch {
      // best-effort; promotion is hygiene, not correctness.
    }
  }

  // Refresh the typed API manifest and workspace memory so the newly learned
  // interface shows up in df.d.ts / AGENTS.md on the next read. This is
  // awaited rather than fire-and-forget so tests and freshly mounted
  // workspaces do not race background writes.
  try {
    const { regenerateManifest } = await import("../server/manifest.js");
    const { regenerateWorkspaceMemory } = await import(
      "../bootstrap/workspaceMemory.js"
    );
    await regenerateManifest({ baseDir, tenantId });
    await regenerateWorkspaceMemory({ baseDir, tenantId });
  } catch {
    // best-effort
  }

  return { kind: "authored", name: template.name, path: file, source };
}

// --- Parameterised fan-out authoring (Goal-4 iter 5) -----------------------
//
// A PURE tool fan-out template — every step is a `tool.<bundle>.<tool>`
// call — is crystallised as a generic per_entity-shaped helper:
//
//   fn({
//     input: { entityValues, toolBundle, toolNames, paramName, paramByTool?, sharedInput? },
//     body: loop entityValues × toolNames, calling
//           df.tool[toolBundle][toolName]({ ...sharedInput, [paramForTool]: entityValue })
//   })
//
// The bundle / tool names / param name are ALWAYS function inputs,
// harvested from the trajectory only for the `examples` entry — never
// frozen into the body. That is what makes the learned helper
// data-shape-agnostic: a different tenant's fan-out over different
// tools calls the same helper with different `toolBundle`/`toolNames`.
// It is structurally the `per_entity` seed, but LEARNED from
// convergence rather than shipped.

function isPureToolFanout(template: CallTemplate): boolean {
  if (template.steps.length < 2) return false;
  return template.steps.every((s) => s.primitive.startsWith("tool."));
}

function isRecordToolFanout(
  template: CallTemplate,
  trajectory: TrajectoryRecord,
  identifierAttributeKeys?: readonly string[],
): boolean {
  if (!/^(?:db|FANOUT\(db\))→FANOUT\(tool\)(?:→lib)?$/.test(template.intentSignature)) {
    return false;
  }
  return selectRecordBackedToolSteps({ template, trajectory, identifierAttributeKeys }) !== null;
}

function selectRecordBackedToolSteps(args: {
  template: CallTemplate;
  trajectory: TrajectoryRecord;
  upperBound?: number;
  identifierAttributeKeys?: readonly string[];
}): TemplateStep[] | null {
  const { template, trajectory } = args;
  const dbIndex = template.steps.findIndex((s) => s.primitive.startsWith("db."));
  const firstLibIndex = template.steps.findIndex((s) => s.primitive.startsWith("lib."));
  if (dbIndex < 0) return null;
  if (/^(?:db|FANOUT\(db\))→FANOUT\(tool\)→lib$/.test(template.intentSignature) && firstLibIndex < 0) {
    return null;
  }
  if (firstLibIndex >= 0 && dbIndex >= firstLibIndex) return null;
  const upperBound =
    args.upperBound ?? (firstLibIndex >= 0 ? firstLibIndex : template.steps.length);
  if (upperBound <= dbIndex + 1) return null;

  const calls = callsForSteps(template.steps, trajectory);
  if (calls.length !== template.steps.length) return null;
  const dbCall = calls[dbIndex];
  if (!dbCall) return null;
  const recordSigs = collectRecordValueSignatures(dbCall.output, {
    identifierAttributeKeys: args.identifierAttributeKeys,
  });
  if (recordSigs.length === 0) return null;
  const candidates: TemplateStep[] = [];
  const erroredPrimitives = new Set<string>();
  for (let i = dbIndex + 1; i < upperBound; i += 1) {
    const step = template.steps[i]!;
    if (!step.primitive.startsWith("tool.")) continue;
    const call = calls[i];
    if (!call) continue;
    const inputJson = jsonString(call.input);
    if (inputJson !== null && recordSigs.some((sig) => inputJson.includes(sig))) {
      if (looksLikeToolErrorOutput(call.output)) {
        erroredPrimitives.add(step.primitive);
      } else {
        candidates.push(step);
      }
    }
  }
  const selected = candidates.filter((step) => !erroredPrimitives.has(step.primitive));
  return selected.length >= 2 ? selected : null;
}

function looksLikeToolErrorOutput(output: unknown): boolean {
  if (!output || typeof output !== "object" || Array.isArray(output)) return false;
  const rec = output as Record<string, unknown>;
  return rec.success === false || typeof rec.error === "string";
}

// Parse `tool.<bundle>.<toolName>` — toolName may contain dots/hyphens
// (e.g. `tool.tvmaze_api.local-tvmaze_get_show_info`).
function parseToolPrimitive(
  primitive: string,
): { bundle: string; toolName: string } | null {
  const rest = primitive.slice("tool.".length);
  const dot = rest.indexOf(".");
  if (dot < 0) return null;
  const bundle = rest.slice(0, dot);
  const toolName = rest.slice(dot + 1);
  if (!bundle || !toolName) return null;
  return { bundle, toolName };
}

// Harvest the fan-out's capability slots from the originating
// trajectory: the shared bundle, the distinct tool names, the varying
// param name, the distinct entity values, and any constant shared
// input fields. Returns null when the steps do not share one bundle or
// no single varying field can be identified — in which case the caller
// falls back to the generic pure-composition path.
function harvestFanOutShape(template: CallTemplate, trajectory: TrajectoryRecord): {
  toolBundle: string;
  toolNames: string[];
  paramName: string;
  entityValues: Array<string | number>;
  sharedInput: Record<string, unknown>;
} | null {
  return harvestToolFanOutShape(template.steps, trajectory);
}

function harvestToolFanOutShape(steps: ReadonlyArray<TemplateStep>, trajectory: TrajectoryRecord): {
  toolBundle: string;
  toolNames: string[];
  paramName: string;
  entityValues: Array<string | number>;
  sharedInput: Record<string, unknown>;
} | null {
  const bundles = new Set<string>();
  const toolNames: string[] = [];
  for (const step of steps) {
    const parsed = parseToolPrimitive(step.primitive);
    if (!parsed) return null;
    bundles.add(parsed.bundle);
    if (!toolNames.includes(parsed.toolName)) toolNames.push(parsed.toolName);
  }
  // All steps must share one bundle for a single-bundle per_entity call.
  if (bundles.size !== 1) return null;
  const toolBundle = [...bundles][0]!;

  // The trajectory's calls for these steps carry the literal inputs.
  // Find: the field whose value VARIES across calls (the entity param),
  // and fields that are CONSTANT (sharedInput).
  const slice = callsForSteps(steps, trajectory);
  if (slice.length !== steps.length) return null;
  const fieldValues = new Map<string, Set<string>>();
  const fieldExample = new Map<string, unknown>();
  for (const call of slice) {
    const input = call.input;
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      continue;
    }
    for (const [k, val] of Object.entries(input as Record<string, unknown>)) {
      const set = fieldValues.get(k) ?? new Set<string>();
      try {
        set.add(JSON.stringify(val));
      } catch {
        set.add(String(val));
      }
      fieldValues.set(k, set);
      if (!fieldExample.has(k)) fieldExample.set(k, val);
    }
  }
  // The varying field: the one with the most distinct values (and > 1).
  let paramName: string | null = null;
  let maxDistinct = 1;
  for (const [k, vals] of fieldValues) {
    if (vals.size > maxDistinct) {
      maxDistinct = vals.size;
      paramName = k;
    }
  }
  if (paramName === null) return null;

  // Distinct entity values for the varying field, in first-seen order.
  const entityValues: Array<string | number> = [];
  const seen = new Set<string>();
  for (const call of slice) {
    const input = call.input;
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      continue;
    }
    const v = (input as Record<string, unknown>)[paramName];
    if (typeof v !== "string" && typeof v !== "number") continue;
    const key = String(v);
    if (seen.has(key)) continue;
    seen.add(key);
    entityValues.push(v);
  }
  // Constant shared input: every other field whose value never varied.
  const sharedInput: Record<string, unknown> = {};
  for (const [k, vals] of fieldValues) {
    if (k === paramName) continue;
    if (vals.size === 1) sharedInput[k] = fieldExample.get(k);
  }
  return { toolBundle, toolNames, paramName, entityValues, sharedInput };
}

function harvestToolParamByTool(
  steps: ReadonlyArray<TemplateStep>,
  trajectory: TrajectoryRecord,
): Record<string, string> | null {
  const slice = callsForSteps(steps, trajectory);
  if (slice.length !== steps.length) return null;
  const fieldsByTool = new Map<string, Map<string, Set<string>>>();
  for (const [index, step] of steps.entries()) {
    const parsed = parseToolPrimitive(step.primitive);
    if (!parsed) return null;
    const call = slice[index];
    if (!call || call.input === null || typeof call.input !== "object" || Array.isArray(call.input)) {
      return null;
    }
    const fieldValues = fieldsByTool.get(parsed.toolName) ?? new Map<string, Set<string>>();
    for (const [field, value] of Object.entries(call.input as Record<string, unknown>)) {
      const values = fieldValues.get(field) ?? new Set<string>();
      try {
        values.add(JSON.stringify(value));
      } catch {
        values.add(String(value));
      }
      fieldValues.set(field, values);
    }
    fieldsByTool.set(parsed.toolName, fieldValues);
  }
  const out: Record<string, string> = {};
  for (const [toolName, fieldValues] of fieldsByTool) {
    const ranked = [...fieldValues.entries()].sort((a, b) => b[1].size - a[1].size);
    const best = ranked[0];
    if (!best) return null;
    out[toolName] = best[0];
  }
  return out;
}

function callsForSteps(
  steps: ReadonlyArray<TemplateStep>,
  trajectory: TrajectoryRecord,
): TrajectoryRecord["calls"] {
  const stepCallIndexes = steps.map((s) => s.trajectoryCallIndex);
  if (stepCallIndexes.every((i): i is number => typeof i === "number")) {
    const byIndex = new Map(trajectory.calls.map((call) => [call.index, call]));
    const indexedCalls = stepCallIndexes.map((index) => byIndex.get(index));
    if (
      indexedCalls.every(
        (call, i) => call !== undefined && call.primitive === steps[i]!.primitive,
      )
    ) {
      return indexedCalls as TrajectoryRecord["calls"];
    }
  }

  const primitives = steps.map((s) => s.primitive);
  if (primitives.length === 0) return [];
  for (let start = 0; start + primitives.length <= trajectory.calls.length; start += 1) {
    let matched = true;
    for (let i = 0; i < primitives.length; i += 1) {
      if (trajectory.calls[start + i]!.primitive !== primitives[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return trajectory.calls.slice(start, start + primitives.length);
  }
  return [];
}

// Default identifier-attribute keys for the record-value signature
// extractor. Generic across datasets: `id`/`entity` are the substrate's
// canonical row identifiers; `code`/`slug` cover common short-string
// identifier columns in REST payloads. A dataset eval whose records use
// dataset-specific identifier columns (e.g. `country_code`,
// `nationality_code`, `isbn`) extends this list at observer install time
// via `ObserverOpts.identifierAttributeKeys`.
export const DEFAULT_RECORD_IDENTIFIER_KEYS = ["id", "entity", "code", "slug"] as const;

function collectRecordValueSignatures(
  output: unknown,
  options?: { identifierAttributeKeys?: readonly string[] },
): string[] {
  const identifierAttributeKeys = options?.identifierAttributeKeys
    ?? DEFAULT_RECORD_IDENTIFIER_KEYS;
  if (!Array.isArray(output) || output.length === 0) return [];
  const signatures: string[] = [];
  const seen = new Set<string>();
  const addRawString = (raw: string): void => {
    const sig = JSON.stringify(raw);
    if (!seen.has(sig)) {
      seen.add(sig);
      signatures.push(sig);
    }
  };
  const add = (value: unknown, options?: { allowShortString?: boolean }): void => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length < 3 && options?.allowShortString !== true) return;
      addRawString(trimmed);
      const lower = trimmed.toLowerCase();
      addRawString(lower);
      const slug = lower.replace(/\s+/g, "-");
      addRawString(slug);
      const title = lower.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
      addRawString(title);
      if (signatures.length >= 64) {
        signatures.length = 64;
      }
      return;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      const bare = String(value);
      const quoted = JSON.stringify(bare);
      for (const sig of [bare, quoted]) {
        if (!seen.has(sig)) {
          seen.add(sig);
          signatures.push(sig);
        }
      }
    }
  };
  const addRecordIdentifiers = (value: unknown): void => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return;
    const row = value as Record<string, unknown>;
    if (!isRecordLikeRow(row, identifierAttributeKeys)) return;
    add(row.id, { allowShortString: true });
    add(row.entity, { allowShortString: true });
    const attributes = row.attributes;
    if (
      attributes !== null &&
      typeof attributes === "object" &&
      !Array.isArray(attributes)
    ) {
      const attrs = attributes as Record<string, unknown>;
      for (const key of identifierAttributeKeys) {
        add(attrs[key], { allowShortString: true });
      }
    }
  };
  const walk = (value: unknown, depth: number): void => {
    if (signatures.length >= 64 || depth > 2) return;
    if (value === null || typeof value !== "object") {
      add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    for (const inner of Object.values(value as Record<string, unknown>)) {
      walk(inner, depth + 1);
    }
  };
  for (const item of output) {
    addRecordIdentifiers(item);
    walk(item, 0);
    if (signatures.length >= 64) break;
  }
  return signatures;
}

function isRecordLikeRow(
  row: Record<string, unknown>,
  identifierAttributeKeys: readonly string[] = DEFAULT_RECORD_IDENTIFIER_KEYS,
): boolean {
  if ("id" in row || "entity" in row) return true;
  const attributes = row.attributes;
  if (
    attributes !== null &&
    typeof attributes === "object" &&
    !Array.isArray(attributes)
  ) {
    const attrs = attributes as Record<string, unknown>;
    return identifierAttributeKeys.some((key) => key in attrs);
  }
  return false;
}

function jsonString(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function renderRecordToolFanOutSource(args: GenerateArgs): string | null {
  const { template, trajectory } = args;
  if (!isRecordToolFanout(template, trajectory, args.identifierAttributeKeys)) return null;
  const toolSteps = selectRecordBackedToolSteps({
    template,
    trajectory,
    identifierAttributeKeys: args.identifierAttributeKeys,
  });
  if (toolSteps === null) return null;
  const shape = harvestToolFanOutShape(toolSteps, trajectory);
  if (shape === null) return null;

  const example = {
    intent: "record-backed repeated fan-out",
    recordFilter: {},
    recordLimit: shape.entityValues.length > 0 ? shape.entityValues.length : 999,
  };
  const exampleOutputJson = safeJsonStringify({
    entityId: shape.entityValues[0] ?? null,
    entityValue: shape.entityValues[0] ?? null,
    label: null,
    record: {},
    attributes: {},
    tools: {},
  });

  const sdkUrl = sdkIndexUrl();
  const valibotUrl = valibotEntryUrl();
  const fm = recordFanOutFrontmatter({
    template,
    trajectory,
  });
  const header = headerComment({ template, trajectory });
  return [
    fm,
    header,
    `import { fn } from "${sdkUrl}";`,
    `import * as v from "${valibotUrl}";`,
    "",
    `// Goal-4 learned record-backed fan-out interface. The public surface is`,
    `// intent-shaped; planner/executor internals provide the data-shaped tool`,
    `// plan through loose, non-public fields.`,
    `declare const df: {`,
    `  db: {`,
    `    records: {`,
    `      findExact(filter: Record<string, unknown>, limit?: number): Promise<unknown[]>;`,
    `    };`,
    `  };`,
    `  tool: Record<string, Record<string, (input: Record<string, unknown>) => Promise<unknown>>>;`,
    `};`,
    "",
    `type Input = {`,
    `  intent?: "record-backed repeated fan-out";`,
    `  recordFilter?: Record<string, unknown>;`,
    `  recordLimit?: number;`,
    `};`,
    "",
    `type InternalRecordFanoutPlan = {`,
    `  entityField?: string;`,
    `  toolBundle?: string;`,
    `  toolNames?: string[];`,
    `  paramName?: string;`,
    `  paramByTool?: Record<string, string>;`,
    `  recordParamMapByTool?: Record<string, Record<string, string>>;`,
    `  sharedInput?: Record<string, unknown>;`,
    `};`,
    "",
    `export const ${template.name} = fn<Input, unknown>({`,
    `  intent: ${JSON.stringify(recordFanOutIntentString())},`,
    `  examples: [`,
    `    {`,
    `      input: ${safeJsonStringify(example)},`,
    `      output: ${exampleOutputJson},`,
    `    },`,
    `  ],`,
    `  input: v.looseObject({`,
    `    intent: v.optional(v.literal("record-backed repeated fan-out")),`,
    `    recordFilter: v.optional(v.record(v.string(), v.unknown())),`,
    `    recordLimit: v.optional(v.number()),`,
  `  }),`,
    `  output: v.unknown(),`,
    `  body: async (input: Input): Promise<unknown> => {`,
    `    const plan = input as Input & InternalRecordFanoutPlan;`,
    `    const pickEntityValue = (record: unknown): string | number | null => {`,
    `      if (!record || typeof record !== "object" || Array.isArray(record)) return null;`,
    `      const rec = record as Record<string, unknown>;`,
    `      const field = plan.entityField;`,
    `      const attrs = rec.attributes;`,
    `      const candidate = field`,
    `        ? rec[field] ?? (attrs && typeof attrs === "object" && !Array.isArray(attrs)`,
    `            ? (attrs as Record<string, unknown>)[field]`,
    `            : undefined)`,
    `        : rec.id ?? rec.entity;`,
    `      return typeof candidate === "string" || typeof candidate === "number"`,
    `        ? candidate`,
    `        : null;`,
    `    };`,
    `    const readRecordField = (record: Record<string, unknown>, field: string): unknown => {`,
    `      if (record[field] !== undefined) return record[field];`,
    `      const attrs = record.attributes;`,
    `      if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {`,
    `        const value = (attrs as Record<string, unknown>)[field];`,
    `        if (value !== undefined) return value;`,
    `      }`,
    `      if (field === "id") return record.id;`,
    `      if (field === "entity") return record.entity;`,
    `      return undefined;`,
    `    };`,
    `    const normalizeId = (value: string | number): string | number =>`,
    `      typeof value === "string" && /^-?\\d+(?:\\.\\d+)?$/.test(value) ? Number(value) : value;`,
    `    const envelopeKeys = ["value", "data", "result", "record", "entity", "item", "payload"];`,
    `    const envelopeMetaKeys = new Set(["success", "ok", "status", "error", "message", "code", "errors", "warnings", "elapsedMs", "elapsed_ms", "took"]);`,
    `    const isPlainObject = (value: unknown): value is Record<string, unknown> => value != null && typeof value === "object" && !Array.isArray(value);`,
    `    const isErrorLike = (value: unknown): boolean => isPlainObject(value) && value.success === false && (typeof value.error === "string" || typeof value.message === "string");`,
    `    const unwrapToolPayload = (value: unknown): unknown => {`,
    `      if (!isPlainObject(value) || isErrorLike(value)) return value;`,
    `      if (typeof value.success === "boolean" || typeof value.ok === "boolean") {`,
    `        const payloadKeys = Object.keys(value).filter((k) => !envelopeMetaKeys.has(k) && value[k] !== undefined && value[k] !== null);`,
    `        if (payloadKeys.length === 1) return value[payloadKeys[0]];`,
    `      }`,
    `      for (const key of envelopeKeys) if (value[key] !== undefined && value[key] !== null) return value[key];`,
    `      // Generic single-key wrapper: if value has exactly one non-metadata key whose value is itself`,
    `      // an object, unwrap it. Handles tool responses like {pokemon: {...}} or {show: {...}} that wrap`,
    `      // their payload under an entity-named key, without re-introducing benchmark identifiers into`,
    `      // the envelope allowlist.`,
    `      const wrapperKeys = Object.keys(value).filter((k) => !envelopeMetaKeys.has(k) && value[k] !== undefined && value[k] !== null);`,
    `      if (wrapperKeys.length === 1 && isPlainObject(value[wrapperKeys[0]])) return value[wrapperKeys[0]];`,
    `      return value;`,
    `    };`,
    `    const records = await df.db.records.findExact(input.recordFilter ?? {}, input.recordLimit ?? 999);`,
    `    const toolBundle = typeof plan.toolBundle === "string" ? plan.toolBundle : "";`,
    `    const toolNames = Array.isArray(plan.toolNames) ? plan.toolNames : [];`,
    `    const defaultParamName = typeof plan.paramName === "string" ? plan.paramName : "";`,
    `    if (!toolBundle || toolNames.length === 0 || !defaultParamName) return { error: "missing_internal_plan" };`,
    `    const bundle = df.tool[toolBundle];`,
    `    if (!bundle) return { error: "unknown_bundle", toolBundle };`,
    `    const results: Array<Record<string, unknown>> = [];`,
    `    for (const record of records) {`,
    `      const entityValue = pickEntityValue(record);`,
    `      if (entityValue === null) continue;`,
    `      const entityId = normalizeId(entityValue);`,
    `      const rec = record && typeof record === "object" && !Array.isArray(record) ? (record as Record<string, unknown>) : {};`,
    `      const label = typeof rec.label === "string" || typeof rec.label === "number" ? rec.label : undefined;`,
    `      const attributes = rec.attributes && typeof rec.attributes === "object" && !Array.isArray(rec.attributes) ? rec.attributes : undefined;`,
    `      const perTool: Record<string, unknown> = {};`,
    `      const rawTools: Record<string, unknown> = {};`,
    `      for (const toolName of toolNames) {`,
    `        const tool = bundle[toolName];`,
    `        if (!tool) { perTool[toolName] = { error: "unknown_tool", tool: toolName }; rawTools[toolName] = perTool[toolName]; continue; }`,
    `        const paramName = plan.paramByTool?.[toolName] ?? defaultParamName;`,
    `        const payload: Record<string, unknown> = { ...(plan.sharedInput ?? {}) };`,
    `        const recordParamMap = plan.recordParamMapByTool?.[toolName];`,
    `        if (recordParamMap) {`,
    `          for (const [toolParam, recordField] of Object.entries(recordParamMap)) {`,
    `            const value = readRecordField(rec, recordField);`,
    `            if (value !== undefined) payload[toolParam] = value;`,
    `          }`,
    `        }`,
    `        if (payload[paramName] === undefined) payload[paramName] = entityValue;`,
    `        try { const raw = await tool(payload); rawTools[toolName] = raw; perTool[toolName] = unwrapToolPayload(raw); }`,
    `        catch (err) { perTool[toolName] = { error: String(err) }; rawTools[toolName] = perTool[toolName]; }`,
    `      }`,
    `      results.push({ id: entityId, entity: entityValue, entityId, entityValue, record: rec, label, attributes, ...perTool, tools: perTool, rawTools });`,
    `    }`,
    `    return results;`,
    `  },`,
    `});`,
    "",
  ].join("\n");
}

function renderRecordToolEnrichmentSource(args: GenerateArgs): string | null {
  const { template, trajectory } = args;
  if (!/^db→FANOUT\(tool\)→lib→FANOUT\(tool\)$/.test(template.intentSignature)) {
    return null;
  }
  const libIndex = template.steps.findIndex((s) => s.primitive.startsWith("lib."));
  if (libIndex < 0) return null;
  const baseToolSteps = selectRecordBackedToolSteps({
    template,
    trajectory,
    upperBound: libIndex,
    identifierAttributeKeys: args.identifierAttributeKeys,
  });
  if (baseToolSteps === null) return null;
  const baseShape = harvestToolFanOutShape(baseToolSteps, trajectory);
  if (baseShape === null) return null;
  const dependentToolSteps = template.steps
    .slice(libIndex + 1)
    .filter((s) => s.primitive.startsWith("tool."));
  if (dependentToolSteps.length < 2) return null;
  const dependentShape = harvestToolFanOutShape(dependentToolSteps, trajectory);
  if (dependentShape === null) return null;

  const example = {
    intent: "record-backed dependent enrichment",
    recordFilter: {},
    recordLimit: baseShape.entityValues.length > 0 ? baseShape.entityValues.length : 999,
  };
  const exampleOutputJson = safeJsonStringify({
    entityId: baseShape.entityValues[0] ?? null,
    entityValue: baseShape.entityValues[0] ?? null,
    tools: {},
    dependentTools: {},
  });

  const sdkUrl = sdkIndexUrl();
  const valibotUrl = valibotEntryUrl();
  const fm = recordEnrichmentFrontmatter({ template, trajectory });
  const header = headerComment({ template, trajectory });
  return [
    fm,
    header,
    `import { fn } from "${sdkUrl}";`,
    `import * as v from "${valibotUrl}";`,
    "",
    `// Goal-4 learned record-backed dependent enrichment interface. The public`,
    `// surface is intent-shaped; planner/executor internals provide the base`,
    `// fan-out and dependent-tool plan through loose, non-public fields.`,
    `declare const df: {`,
    `  db: {`,
    `    records: {`,
    `      findExact(filter: Record<string, unknown>, limit?: number): Promise<unknown[]>;`,
    `    };`,
    `  };`,
    `  lib: {`,
    `    recordToolFanout?: (input: Record<string, unknown>) => Promise<{ value?: unknown } | unknown[]>;`,
    `  };`,
    `  tool: Record<string, Record<string, (input: Record<string, unknown>) => Promise<unknown>>>;`,
    `};`,
    "",
    `type Input = {`,
    `  intent?: "record-backed dependent enrichment";`,
    `  recordFilter?: Record<string, unknown>;`,
    `  recordLimit?: number;`,
    `};`,
    "",
    `type InternalRecordEnrichmentPlan = {`,
    `  entityField?: string;`,
    `  toolBundle?: string;`,
    `  toolNames?: string[];`,
    `  paramName?: string;`,
    `  paramByTool?: Record<string, string>;`,
    `  recordParamMapByTool?: Record<string, Record<string, string>>;`,
    `  sharedInput?: Record<string, unknown>;`,
    `  dependentToolBundle?: string;`,
    `  dependentToolNames?: string[];`,
    `  dependentParamName?: string;`,
    `  dependentParamByTool?: Record<string, string>;`,
    `  dependentValuePaths?: string[];`,
    `  dependentSharedInput?: Record<string, unknown>;`,
    `};`,
    "",
    `export const ${template.name} = fn<Input, unknown>({`,
    `  intent: ${JSON.stringify(recordEnrichmentIntentString())},`,
    `  examples: [`,
    `    {`,
    `      input: ${safeJsonStringify(example)},`,
    `      output: ${exampleOutputJson},`,
    `    },`,
    `  ],`,
    `  input: v.looseObject({`,
    `    intent: v.optional(v.literal("record-backed dependent enrichment")),`,
    `    recordFilter: v.optional(v.record(v.string(), v.unknown())),`,
    `    recordLimit: v.optional(v.number()),`,
    `  }),`,
    `  output: v.unknown(),`,
    `  body: async (input: Input): Promise<unknown> => {`,
    `    const plan = input as Input & InternalRecordEnrichmentPlan;`,
    `    const fanoutInput = {`,
    `      intent: "record-backed repeated fan-out",`,
    `      recordFilter: input.recordFilter,`,
    `      recordLimit: input.recordLimit,`,
    `      entityField: plan.entityField,`,
    `      toolBundle: plan.toolBundle,`,
    `      toolNames: plan.toolNames,`,
    `      paramName: plan.paramName,`,
    `      paramByTool: plan.paramByTool,`,
    `      recordParamMapByTool: plan.recordParamMapByTool,`,
    `      sharedInput: plan.sharedInput,`,
    `    };`,
    `    const pickEntityValue = (record: unknown): string | number | null => {`,
    `      if (!record || typeof record !== "object" || Array.isArray(record)) return null;`,
    `      const rec = record as Record<string, unknown>;`,
    `      const field = plan.entityField;`,
    `      const attrs = rec.attributes;`,
    `      const candidate = field`,
    `        ? rec[field] ?? (attrs && typeof attrs === "object" && !Array.isArray(attrs)`,
    `            ? (attrs as Record<string, unknown>)[field]`,
    `            : undefined)`,
    `        : rec.id ?? rec.entity;`,
    `      return typeof candidate === "string" || typeof candidate === "number" ? candidate : null;`,
    `    };`,
    `    const readRecordField = (record: Record<string, unknown>, field: string): unknown => {`,
    `      if (record[field] !== undefined) return record[field];`,
    `      const attrs = record.attributes;`,
    `      if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {`,
    `        const value = (attrs as Record<string, unknown>)[field];`,
    `        if (value !== undefined) return value;`,
    `      }`,
    `      if (field === "id") return record.id;`,
    `      if (field === "entity") return record.entity;`,
    `      return undefined;`,
    `    };`,
    `    const normalizeId = (value: string | number): string | number =>`,
    `      typeof value === "string" && /^-?\\d+(?:\\.\\d+)?$/.test(value) ? Number(value) : value;`,
    `    const envelopeKeys = ["value", "data", "result", "record", "entity", "item", "payload"];`,
    `    const envelopeMetaKeys = new Set(["success", "ok", "status", "error", "message", "code", "errors", "warnings", "elapsedMs", "elapsed_ms", "took"]);`,
    `    const isPlainObject = (value: unknown): value is Record<string, unknown> => value != null && typeof value === "object" && !Array.isArray(value);`,
    `    const isErrorLike = (value: unknown): boolean => isPlainObject(value) && value.success === false && (typeof value.error === "string" || typeof value.message === "string");`,
    `    const unwrapToolPayload = (value: unknown): unknown => {`,
    `      if (!isPlainObject(value) || isErrorLike(value)) return value;`,
    `      if (typeof value.success === "boolean" || typeof value.ok === "boolean") {`,
    `        const payloadKeys = Object.keys(value).filter((k) => !envelopeMetaKeys.has(k) && value[k] !== undefined && value[k] !== null);`,
    `        if (payloadKeys.length === 1) return value[payloadKeys[0]];`,
    `      }`,
    `      for (const key of envelopeKeys) if (value[key] !== undefined && value[key] !== null) return value[key];`,
    `      // Generic single-key wrapper: if value has exactly one non-metadata key whose value is itself`,
    `      // an object, unwrap it. Handles tool responses like {pokemon: {...}} or {show: {...}} that wrap`,
    `      // their payload under an entity-named key, without re-introducing benchmark identifiers into`,
    `      // the envelope allowlist.`,
    `      const wrapperKeys = Object.keys(value).filter((k) => !envelopeMetaKeys.has(k) && value[k] !== undefined && value[k] !== null);`,
    `      if (wrapperKeys.length === 1 && isPlainObject(value[wrapperKeys[0]])) return value[wrapperKeys[0]];`,
    `      return value;`,
    `    };`,
    `    const runInlineRecordToolFanout = async (): Promise<Array<Record<string, unknown>>> => {`,
    `      const records = await df.db.records.findExact(input.recordFilter ?? {}, input.recordLimit ?? 999);`,
    `      const toolBundle = typeof plan.toolBundle === "string" ? plan.toolBundle : "";`,
    `      const toolNames = Array.isArray(plan.toolNames) ? plan.toolNames : [];`,
    `      const defaultParamName = typeof plan.paramName === "string" ? plan.paramName : "";`,
    `      if (!toolBundle || toolNames.length === 0 || !defaultParamName) return [];`,
    `      const bundle = df.tool[toolBundle];`,
    `      if (!bundle) return [];`,
    `      const results: Array<Record<string, unknown>> = [];`,
    `      for (const record of records) {`,
    `        const entityValue = pickEntityValue(record);`,
    `        if (entityValue === null) continue;`,
    `        const entityId = normalizeId(entityValue);`,
    `        const rec = record && typeof record === "object" && !Array.isArray(record) ? (record as Record<string, unknown>) : {};`,
    `        const label = typeof rec.label === "string" || typeof rec.label === "number" ? rec.label : undefined;`,
    `        const attributes = rec.attributes && typeof rec.attributes === "object" && !Array.isArray(rec.attributes) ? rec.attributes : undefined;`,
    `        const perTool: Record<string, unknown> = {};`,
    `        const rawTools: Record<string, unknown> = {};`,
    `        for (const toolName of toolNames) {`,
    `          const tool = bundle[toolName];`,
    `          if (!tool) { perTool[toolName] = { error: "unknown_tool", tool: toolName }; rawTools[toolName] = perTool[toolName]; continue; }`,
    `          const paramName = plan.paramByTool?.[toolName] ?? defaultParamName;`,
    `          const payload: Record<string, unknown> = { ...(plan.sharedInput ?? {}) };`,
    `          const recordParamMap = plan.recordParamMapByTool?.[toolName];`,
    `          if (recordParamMap) {`,
    `            for (const [toolParam, recordField] of Object.entries(recordParamMap)) {`,
    `              const value = readRecordField(rec, recordField);`,
    `              if (value !== undefined) payload[toolParam] = value;`,
    `            }`,
    `          }`,
    `          if (payload[paramName] === undefined) payload[paramName] = entityValue;`,
    `          try { const raw = await tool(payload); rawTools[toolName] = raw; perTool[toolName] = unwrapToolPayload(raw); }`,
    `          catch (err) { perTool[toolName] = { error: String(err) }; rawTools[toolName] = perTool[toolName]; }`,
    `        }`,
    `        results.push({ id: entityId, entity: entityValue, entityId, entityValue, record: rec, label, attributes, ...perTool, tools: perTool, rawTools });`,
    `      }`,
    `      return results;`,
    `    };`,
    `    let rows: Array<Record<string, unknown>> = [];`,
    `    try {`,
    `      const base = typeof df.lib.recordToolFanout === "function" ? await df.lib.recordToolFanout(fanoutInput) : null;`,
    `      rows = Array.isArray((base as { value?: unknown } | null)?.value)`,
    `        ? (base as { value: Array<Record<string, unknown>> }).value`,
    `        : Array.isArray(base) ? base as Array<Record<string, unknown>> : [];`,
    `    } catch {`,
    `      rows = [];`,
    `    }`,
    `    if (rows.length === 0) rows = await runInlineRecordToolFanout();`,
    `    const getPath = (value: unknown, path: string): unknown => {`,
    `      let cur: unknown = value;`,
    `      for (const part of path.split(".")) {`,
    `        if (!cur || typeof cur !== "object" || Array.isArray(cur)) return undefined;`,
    `        cur = (cur as Record<string, unknown>)[part];`,
    `      }`,
    `      return cur;`,
    `    };`,
    `    const pickDependentValue = (row: Record<string, unknown>): string | number | null => {`,
    `      for (const path of plan.dependentValuePaths ?? []) {`,
    `        const value = getPath(row, path);`,
    `        if (typeof value === "string" || typeof value === "number") return value;`,
    `      }`,
    `      const fallback = row.entityId ?? row.entityValue ?? row.entity ?? row.id;`,
    `      return typeof fallback === "string" || typeof fallback === "number" ? fallback : null;`,
    `    };`,
    `    const dependentNames = plan.dependentToolNames ?? [];`,
    `    if (dependentNames.length === 0) return rows;`,
    `    const bundle = df.tool[plan.dependentToolBundle ?? plan.toolBundle ?? ""];`,
    `    if (!bundle) return rows.map((row) => ({ ...row, dependentTools: { error: "unknown_bundle" } }));`,
    `    const enriched: Array<Record<string, unknown>> = [];`,
    `    for (const row of rows) {`,
    `      const dependentTools: Record<string, unknown> = {};`,
    `      const entityValue = pickDependentValue(row);`,
    `      for (const toolName of dependentNames) {`,
    `        const tool = bundle[toolName];`,
    `        if (!tool) { dependentTools[toolName] = { error: "unknown_tool", tool: toolName }; continue; }`,
    `        const paramName = plan.dependentParamByTool?.[toolName] ?? plan.dependentParamName ?? plan.paramName ?? "entity";`,
    `        const payload: Record<string, unknown> = { ...(plan.dependentSharedInput ?? {}) };`,
    `        if (entityValue !== null) payload[paramName] = entityValue;`,
    `        try { dependentTools[toolName] = await tool(payload); }`,
    `        catch (err) { dependentTools[toolName] = { error: String(err) }; }`,
    `      }`,
    `      enriched.push({ ...row, dependentTools, tools: { ...((row.tools as Record<string, unknown> | undefined) ?? {}), ...dependentTools } });`,
    `    }`,
    `    return enriched;`,
    `  },`,
    `});`,
    "",
  ].join("\n");
}

function renderToolFanoutEnrichmentSource(args: GenerateArgs): string | null {
  const { template, trajectory } = args;
  if (!/^FANOUT\(tool\)→lib→FANOUT\(tool\)$/.test(template.intentSignature)) {
    return null;
  }
  const libIndex = template.steps.findIndex((step) => step.primitive === "lib.toolFanout");
  if (libIndex < 0) return null;
  const baseToolSteps = template.steps.slice(0, libIndex).filter((step) => step.primitive.startsWith("tool."));
  if (baseToolSteps.length < 1) return null;
  const baseShape = harvestToolFanOutShape(baseToolSteps, trajectory);
  if (baseShape === null) return null;
  const dependentToolSteps = template.steps
    .slice(libIndex + 1)
    .filter((step) => step.primitive.startsWith("tool."));
  if (dependentToolSteps.length < 2) return null;
  const dependentBundles = new Set<string>();
  const dependentToolNames: string[] = [];
  for (const step of dependentToolSteps) {
    const parsed = parseToolPrimitive(step.primitive);
    if (!parsed) return null;
    dependentBundles.add(parsed.bundle);
    if (!dependentToolNames.includes(parsed.toolName)) dependentToolNames.push(parsed.toolName);
  }
  if (dependentBundles.size !== 1) return null;
  const dependentParamByTool = harvestToolParamByTool(dependentToolSteps, trajectory);
  if (dependentParamByTool === null) return null;

  const example = {
    intent: "repeated tool fan-out dependent enrichment",
    limit: baseShape.entityValues.length > 0 ? baseShape.entityValues.length : undefined,
  };
  const exampleOutputJson = safeJsonStringify({
    entityId: baseShape.entityValues[0] ?? null,
    entityValue: baseShape.entityValues[0] ?? null,
    tools: {},
    dependentTools: {},
  });

  const sdkUrl = sdkIndexUrl();
  const valibotUrl = valibotEntryUrl();
  const fm = toolEnrichmentFrontmatter({ template, trajectory });
  const header = headerComment({ template, trajectory });
  return [
    fm,
    header,
    `import { fn } from "${sdkUrl}";`,
    `import * as v from "${valibotUrl}";`,
    "",
    `// Goal-4 learned pure fan-out dependent enrichment interface. The public`,
    `// surface is intent-shaped; planner/executor internals provide the base`,
    `// fan-out and dependent-tool plan through loose, non-public fields.`,
    `declare const df: {`,
    `  lib: {`,
    `    toolFanout(input: Record<string, unknown>): Promise<{ value?: unknown }>;`,
    `  };`,
    `  tool: Record<string, Record<string, (input: Record<string, unknown>) => Promise<unknown>>>;`,
    `};`,
    "",
    `type Input = {`,
    `  intent?: "repeated tool fan-out dependent enrichment";`,
    `  limit?: number;`,
    `};`,
    "",
    `type InternalToolEnrichmentPlan = {`,
    `  entityValues?: Array<string | number>;`,
    `  toolBundle?: string;`,
    `  toolNames?: string[];`,
    `  paramName?: string;`,
    `  paramByTool?: Record<string, string>;`,
    `  sharedInput?: Record<string, unknown>;`,
    `  dependentToolBundle?: string;`,
    `  dependentToolNames?: string[];`,
    `  dependentParamName?: string;`,
    `  dependentParamByTool?: Record<string, string>;`,
    `  dependentValuePaths?: string[];`,
    `  dependentValuePathsByTool?: Record<string, string[]>;`,
    `  dependentSharedInput?: Record<string, unknown>;`,
    `};`,
    "",
    `export const ${template.name} = fn<Input, unknown>({`,
    `  intent: ${JSON.stringify(toolEnrichmentIntentString())},`,
    `  examples: [`,
    `    {`,
    `      input: ${safeJsonStringify(example)},`,
    `      output: ${exampleOutputJson},`,
    `    },`,
    `  ],`,
    `  input: v.looseObject({`,
    `    intent: v.optional(v.string()),`,
    `    limit: v.optional(v.number()),`,
    `  }),`,
    `  output: v.unknown(),`,
    `  body: async (input: Input): Promise<unknown> => {`,
    `    const plan = input as Input & InternalToolEnrichmentPlan;`,
    `    const base = await df.lib.toolFanout({`,
    `      intent: "repeated tool fan-out",`,
    `      limit: input.limit,`,
    `      entityValues: plan.entityValues,`,
    `      toolBundle: plan.toolBundle,`,
    `      toolNames: plan.toolNames,`,
    `      paramName: plan.paramName,`,
    `      paramByTool: plan.paramByTool,`,
    `      sharedInput: plan.sharedInput,`,
    `    });`,
    `    const rows = Array.isArray(base?.value) ? base.value as Array<Record<string, unknown>> : [];`,
    `    const envelopeKeys = ["value", "data", "result", "record", "entity", "item", "payload"];`,
    `    const envelopeMetaKeys = new Set(["success", "ok", "status", "error", "message", "code", "errors", "warnings", "elapsedMs", "elapsed_ms", "took"]);`,
    `    const isPlainObject = (value: unknown): value is Record<string, unknown> => value != null && typeof value === "object" && !Array.isArray(value);`,
    `    const isErrorLike = (value: unknown): boolean => isPlainObject(value) && value.success === false && (typeof value.error === "string" || typeof value.message === "string");`,
    `    const unwrapToolPayload = (value: unknown): unknown => {`,
    `      if (!isPlainObject(value) || isErrorLike(value)) return value;`,
    `      if (typeof value.success === "boolean" || typeof value.ok === "boolean") {`,
    `        const payloadKeys = Object.keys(value).filter((k) => !envelopeMetaKeys.has(k) && value[k] !== undefined && value[k] !== null);`,
    `        if (payloadKeys.length === 1) return value[payloadKeys[0]];`,
    `      }`,
    `      for (const key of envelopeKeys) if (value[key] !== undefined && value[key] !== null) return value[key];`,
    `      // Generic single-key wrapper: if value has exactly one non-metadata key whose value is itself`,
    `      // an object, unwrap it. Handles tool responses like {pokemon: {...}} or {show: {...}} that wrap`,
    `      // their payload under an entity-named key, without re-introducing benchmark identifiers into`,
    `      // the envelope allowlist.`,
    `      const wrapperKeys = Object.keys(value).filter((k) => !envelopeMetaKeys.has(k) && value[k] !== undefined && value[k] !== null);`,
    `      if (wrapperKeys.length === 1 && isPlainObject(value[wrapperKeys[0]])) return value[wrapperKeys[0]];`,
    `      return value;`,
    `    };`,
    `    const getPath = (value: unknown, path: string): unknown => {`,
    `      let cur: unknown = value;`,
    `      for (const part of path.split(".")) {`,
    `        if (!cur || typeof cur !== "object" || Array.isArray(cur)) return undefined;`,
    `        cur = (cur as Record<string, unknown>)[part];`,
    `      }`,
    `      return cur;`,
    `    };`,
    `    const norm = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");`,
    `    const singular = (value: string): string => value.endsWith("ies") ? value.slice(0, -3) + "y" : value.endsWith("s") ? value.slice(0, -1) : value;`,
    `    const normalizeParamValue = (value: unknown, paramName: string): unknown => {`,
    `      const normalized = norm(paramName);`,
    `      if (normalized.endsWith("_names") && Array.isArray(value)) {`,
    `        const names = value.map((item) => isPlainObject(item) ? item.name : item).filter((item): item is string | number => typeof item === "string" || typeof item === "number").map(String);`,
    `        return names.length > 0 ? names : undefined;`,
    `      }`,
    `      if (Array.isArray(value) && value.length === 1) return normalizeParamValue(value[0], paramName);`,
    `      return value;`,
    `    };`,
    `    const keyMatchesParam = (key: string, paramName: string): boolean => {`,
    `      const keyNorm = norm(key);`,
    `      const paramNorm = norm(paramName);`,
    `      if (keyNorm === paramNorm || keyNorm.endsWith("_" + paramNorm)) return true;`,
    `      if (paramNorm.endsWith("_names")) {`,
    `        const stem = singular(paramNorm.slice(0, -"names".length).replace(/_$/, ""));`,
    `        const keyStem = singular(keyNorm);`,
    `        return keyStem === stem || keyStem.endsWith("_" + stem);`,
    `      }`,
    `      return false;`,
    `    };`,
    `    const findValueForParam = (value: unknown, paramName: string, depth = 0): unknown => {`,
    `      if (depth > 6 || !isPlainObject(value)) return undefined;`,
    `      for (const [key, candidate] of Object.entries(value)) {`,
    `        if (keyMatchesParam(key, paramName)) {`,
    `          const normalized = normalizeParamValue(candidate, paramName);`,
    `          if (normalized !== undefined && normalized !== null) return normalized;`,
    `        }`,
    `      }`,
    `      for (const candidate of Object.values(value)) {`,
    `        const found = findValueForParam(candidate, paramName, depth + 1);`,
    `        if (found !== undefined && found !== null) return found;`,
    `      }`,
    `      return undefined;`,
    `    };`,
    `    const pickDependentValue = (row: Record<string, unknown>, toolName: string, paramName: string): unknown => {`,
    `      const paths = plan.dependentValuePathsByTool?.[toolName] ?? plan.dependentValuePaths ?? [];`,
    `      for (const path of paths) {`,
    `        const value = normalizeParamValue(getPath(row, path), paramName);`,
    `        if (value !== undefined && value !== null) return value;`,
    `      }`,
    `      const inferred = findValueForParam(row, paramName);`,
    `      if (inferred !== undefined && inferred !== null) return inferred;`,
    `      return row.entityId ?? row.entityValue ?? row.entity ?? row.id;`,
    `    };`,
    `    const dependentNames = plan.dependentToolNames ?? [];`,
    `    if (dependentNames.length === 0) return rows;`,
    `    const bundle = df.tool[plan.dependentToolBundle ?? plan.toolBundle ?? ""];`,
    `    if (!bundle) return rows.map((row) => ({ ...row, dependentTools: { error: "unknown_bundle" } }));`,
    `    const enriched: Array<Record<string, unknown>> = [];`,
    `    for (const row of rows) {`,
    `      const dependentTools: Record<string, unknown> = {};`,
    `      const rawDependentTools: Record<string, unknown> = {};`,
    `      for (const toolName of dependentNames) {`,
    `        const tool = bundle[toolName];`,
    `        if (!tool) { dependentTools[toolName] = { error: "unknown_tool", tool: toolName }; rawDependentTools[toolName] = dependentTools[toolName]; continue; }`,
    `        const paramName = plan.dependentParamByTool?.[toolName] ?? plan.dependentParamName ?? plan.paramName ?? "entity";`,
    `        const value = pickDependentValue(row, toolName, paramName);`,
    `        const payload: Record<string, unknown> = { ...(plan.dependentSharedInput ?? {}) };`,
    `        if (value !== undefined && value !== null) payload[paramName] = value;`,
    `        try { const raw = await tool(payload); rawDependentTools[toolName] = raw; dependentTools[toolName] = unwrapToolPayload(raw); }`,
    `        catch (err) { dependentTools[toolName] = { error: String(err) }; rawDependentTools[toolName] = dependentTools[toolName]; }`,
    `      }`,
    `      enriched.push({ ...row, dependentTools, rawDependentTools, tools: { ...((row.tools as Record<string, unknown> | undefined) ?? {}), ...dependentTools }, rawTools: { ...((row.rawTools as Record<string, unknown> | undefined) ?? {}), ...rawDependentTools } });`,
    `    }`,
    `    return enriched;`,
    `  },`,
    `});`,
    "",
  ].join("\n");
}

function renderFanOutSource(args: GenerateArgs): string | null {
  const { template, trajectory } = args;
  if (!isPureToolFanout(template)) return null;
  const shape = harvestFanOutShape(template, trajectory);
  if (shape === null) return null;

  const example = {
    intent: "repeated tool fan-out",
    limit: shape.entityValues.length,
  };
  // Sample output: the last fan-out call's output, for the example.
  const lastToolCall = [...trajectory.calls]
    .reverse()
    .find((c) => c.primitive.startsWith("tool."));
  const exampleOutputJson = safeJsonStringify(
    lastToolCall
      ? {
          entityId: shape.entityValues[0] ?? null,
          entityValue: shape.entityValues[0] ?? null,
          tools: {},
        }
      : null,
  );

  const sdkUrl = sdkIndexUrl();
  const valibotUrl = valibotEntryUrl();
  const fm = fanOutFrontmatter({
    template,
    trajectory,
  });
  const header = headerComment({ template, trajectory });
  return [
    fm,
    header,
    `import { fn } from "${sdkUrl}";`,
    `import * as v from "${valibotUrl}";`,
    "",
    `// Goal-4 learned tool fan-out interface. The public surface is`,
    `// intent-shaped; planner/executor internals provide entity values and`,
    `// tool slots through loose, non-public fields.`,
    `// Results include entityId/entityValue, top-level per-tool keys, and`,
    `// a nested tools map for compatibility with different answer styles.`,
    `declare const df: {`,
    `  tool: Record<string, Record<string, (input: Record<string, unknown>) => Promise<unknown>>>;`,
    `};`,
    "",
    `type Input = {`,
    `  intent?: "repeated tool fan-out";`,
    `  limit?: number;`,
    `};`,
    "",
    `type InternalToolFanoutPlan = {`,
    `  entityValues?: Array<string | number>;`,
    `  toolBundle?: string;`,
    `  toolNames?: string[];`,
    `  paramName?: string;`,
    `  paramByTool?: Record<string, string>;`,
    `  sharedInput?: Record<string, unknown>;`,
    `};`,
    "",
  `export const ${template.name} = fn<Input, unknown>({`,
    `  intent: ${JSON.stringify(fanOutIntentString())},`,
    `  examples: [`,
    `    {`,
    `      input: ${safeJsonStringify(example)},`,
    `      output: ${exampleOutputJson},`,
    `    },`,
    `  ],`,
    `  input: v.looseObject({`,
    `    intent: v.optional(v.string()),`,
    `    limit: v.optional(v.number()),`,
    `    entityValues: v.optional(v.array(v.union([v.string(), v.number()]))),`,
    `    toolBundle: v.optional(v.string()),`,
    `    toolNames: v.optional(v.array(v.string())),`,
    `    paramName: v.optional(v.string()),`,
    `    paramByTool: v.optional(v.record(v.string(), v.string())),`,
    `    sharedInput: v.optional(v.record(v.string(), v.unknown())),`,
    `  }),`,
    `  output: v.unknown(),`,
    `  body: async (input: Input): Promise<unknown> => {`,
    `    const plan = input as Input & InternalToolFanoutPlan;`,
    `    const entityValues = Array.isArray(plan.entityValues) ? plan.entityValues : [];`,
    `    const toolBundle = typeof plan.toolBundle === "string" ? plan.toolBundle : "";`,
    `    const toolNames = Array.isArray(plan.toolNames) ? plan.toolNames : [];`,
    `    const defaultParamName = typeof plan.paramName === "string" ? plan.paramName : "";`,
    `    if (!toolBundle || toolNames.length === 0 || !defaultParamName) return { error: "missing_internal_plan" };`,
    `    const bundle = df.tool[toolBundle];`,
    `    if (!bundle) return { error: "unknown_bundle", toolBundle };`,
    `    const envelopeKeys = ["value", "data", "result", "record", "entity", "item", "payload"];`,
    `    const envelopeMetaKeys = new Set(["success", "ok", "status", "error", "message", "code", "errors", "warnings", "elapsedMs", "elapsed_ms", "took"]);`,
    `    const isPlainObject = (value: unknown): value is Record<string, unknown> => value != null && typeof value === "object" && !Array.isArray(value);`,
    `    const isErrorLike = (value: unknown): boolean => isPlainObject(value) && value.success === false && (typeof value.error === "string" || typeof value.message === "string");`,
    `    const unwrapToolPayload = (value: unknown): unknown => {`,
    `      if (!isPlainObject(value) || isErrorLike(value)) return value;`,
    `      if (typeof value.success === "boolean" || typeof value.ok === "boolean") {`,
    `        const payloadKeys = Object.keys(value).filter((k) => !envelopeMetaKeys.has(k) && value[k] !== undefined && value[k] !== null);`,
    `        if (payloadKeys.length === 1) return value[payloadKeys[0]];`,
    `      }`,
    `      for (const key of envelopeKeys) if (value[key] !== undefined && value[key] !== null) return value[key];`,
    `      // Generic single-key wrapper: if value has exactly one non-metadata key whose value is itself`,
    `      // an object, unwrap it. Handles tool responses like {pokemon: {...}} or {show: {...}} that wrap`,
    `      // their payload under an entity-named key, without re-introducing benchmark identifiers into`,
    `      // the envelope allowlist.`,
    `      const wrapperKeys = Object.keys(value).filter((k) => !envelopeMetaKeys.has(k) && value[k] !== undefined && value[k] !== null);`,
    `      if (wrapperKeys.length === 1 && isPlainObject(value[wrapperKeys[0]])) return value[wrapperKeys[0]];`,
    `      return value;`,
    `    };`,
    `    const results: Array<Record<string, unknown>> = [];`,
    `    for (const entityValue of entityValues.slice(0, input.limit ?? entityValues.length)) {`,
    `      const perTool: Record<string, unknown> = {};`,
    `      const rawTools: Record<string, unknown> = {};`,
    `      for (const toolName of toolNames) {`,
    `        const tool = bundle[toolName];`,
    `        if (!tool) { perTool[toolName] = { error: "unknown_tool", tool: toolName }; rawTools[toolName] = perTool[toolName]; continue; }`,
    `        const paramName = plan.paramByTool?.[toolName] ?? defaultParamName;`,
    `        const payload: Record<string, unknown> = { ...(plan.sharedInput ?? {}), [paramName]: entityValue };`,
    `        try { const raw = await tool(payload); rawTools[toolName] = raw; perTool[toolName] = unwrapToolPayload(raw); }`,
    `        catch (err) { perTool[toolName] = { error: String(err) }; rawTools[toolName] = perTool[toolName]; }`,
    `      }`,
    `      results.push({ id: entityValue, entity: entityValue, entityId: entityValue, entityValue, ...perTool, tools: perTool, rawTools });`,
    `    }`,
    `    return results;`,
    `  },`,
    `});`,
    "",
  ].join("\n");
}

// --- Pure-composition source generation ------------------------------------

type GenerateArgs = {
  template: CallTemplate;
  trajectory: TrajectoryRecord;
  // Forwarded through to selectRecordBackedToolSteps →
  // collectRecordValueSignatures. See AuthorFunctionArgs for semantics.
  identifierAttributeKeys?: readonly string[];
};

// Exported as a test seam: a registered code-gen specialization's path (Phase-2
// #3) is reached through here. tests/sac-rangetable-codegen characterises its
// output so the move-don't-rewrite relocation of the dataset specialization
// into src/eval is guarded byte-for-byte. No behaviour change from exporting.
export function generatePureSource(args: GenerateArgs): string | null {
  const { trajectory } = args;
  // Phase-2 #3: dataset-specific code-gen specializations are registered out of
  // src/eval (see specializationRegistry.ts); the substrate consults them
  // generically and names no dataset. `spec` is null for the common case.
  const spec = findCodegenSpecialization(args.template);
  const skipPruning = spec?.skipPruning?.(args.template) ?? false;
  const baseTemplate = skipPruning
    ? args.template
    : bindRowsToPriorRetrieval(args.template);
  // Goal-3 iter 10: sub-graph templates (topic suffix `_fanout` or
  // `_lookup_consumer`) represent agent-intent patterns where steps are
  // INDEPENDENT calls the agent ran for side-effect, not a pure functional
  // composition. Pruning unreferenced steps would collapse a 9-call
  // fan-out into a 1-call wrapper, defeating the point. Detect those
  // shapes and skip pruning.
  const isSubGraph =
    baseTemplate.topic.endsWith("_fanout") ||
    baseTemplate.topic.endsWith("_lookup_consumer") ||
    baseTemplate.topic === "record_tool_enrichment";
  const template =
    skipPruning || isSubGraph
      ? baseTemplate
      : pruneUnusedTemplateSteps(baseTemplate);
  if (template.steps.length === 0) return null;

  // External parameters: those not derived from earlier-call outputs.
  let externalParams = template.parameters.filter(
    (p) => p.derivedFromCallIndex === undefined,
  );
  externalParams =
    spec?.specializeExternalParams?.(template, externalParams) ?? externalParams;

  // Build the input/output schema fragments.
  const inputSchema = renderInputSchema(externalParams);
  const inputType = renderInputType(externalParams);

  // The function's first example: harvest values from bindings against
  // the originating trajectory's literal call inputs.
  const example = pickExample({
    template,
    trajectory,
    externalParams,
  });
  if (example === null) return null;

  const codegenCtx: CodegenContext = {
    bindingExpr,
    renderStepExpression,
    jsonProp,
  };
  const body =
    (spec?.renderBody?.(template, externalParams, codegenCtx) ?? null) ??
    renderReplayBody({ template, externalParams });
  if (body === null) return null;

  // Sample output: the last call's output, JSON-stringified.
  const exampleOutputJson = safeJsonStringify(
    trajectory.calls[trajectory.calls.length - 1]!.output,
  );

  // The learned interface file lives at <baseDir>/lib/<tenantId>/<name>.ts,
  // outside the repo tree. We use an absolute file:// URL to the SDK
  // barrel so the import resolves regardless of where baseDir lives —
  // same trick as snippet/install.ts seed shim.
  const sdkUrl = sdkIndexUrl();
  const valibotUrl = valibotEntryUrl();

  const fm = frontmatter({ template, trajectory, example, externalParams });
  const header = headerComment({ template, trajectory });
  return [
    fm,
    header,
    `import { fn } from "${sdkUrl}";`,
    `import * as v from "${valibotUrl}";`,
    "",
    `// Learned interface composition. The function body uses the snippet runtime's`,
    `// global \`df\` to call the same primitives the originating trajectory`,
    `// recorded.`,
    `declare const df: {`,
    `  db: Record<string, {`,
    `    findExact(filter: Record<string, unknown>, limit?: number): Promise<unknown[]>;`,
    `    search(query: string, opts?: { limit?: number }): Promise<unknown[]>;`,
    `    findSimilar(query: string, limit?: number): Promise<unknown[]>;`,
    `    hybrid(query: string, opts?: { limit?: number }): Promise<unknown[]>;`,
    `  }>;`,
    `  lib: Record<string, (input: unknown) => Promise<{ value: unknown }>>;`,
    `};`,
    "",
    `type Input = ${inputType};`,
    "",
    `export const ${template.name} = fn<Input, unknown>({`,
    `  intent: ${JSON.stringify(intentString(template))},`,
    `  examples: [`,
    `    {`,
    `      input: ${safeJsonStringify(example)},`,
    `      output: ${exampleOutputJson},`,
    `    },`,
    `  ],`,
    `  input: ${inputSchema},`,
    `  output: v.unknown(),`,
    `  body: async (input: Input): Promise<unknown> => {`,
    body,
    `  },`,
    `});`,
    "",
  ].join("\n");
}

function bindRowsToPriorRetrieval(template: CallTemplate): CallTemplate {
  const steps = template.steps.map((step) => ({
    ...step,
    inputBindings: { ...step.inputBindings },
  }));

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i]!;
    const rowsBinding = step.inputBindings["rows"];
    if (
      !step.primitive.startsWith("lib.") ||
      rowsBinding?.kind !== "param" ||
      rowsBinding.param !== "rows"
    ) {
      continue;
    }

    const retrieval = nearestPriorDbStep(steps, i);
    if (!retrieval) continue;
    step.inputBindings["rows"] = { kind: "ref", ref: retrieval.outputName };
  }

  return {
    ...template,
    steps,
  };
}

function nearestPriorDbStep(
  steps: TemplateStep[],
  beforeIndex: number,
): TemplateStep | undefined {
  for (let i = beforeIndex - 1; i >= 0; i -= 1) {
    const step = steps[i]!;
    if (step.primitive.startsWith("db.")) return step;
  }
  return undefined;
}

function pruneUnusedTemplateSteps(template: CallTemplate): CallTemplate {
  const byOutput = new Map(template.steps.map((step) => [step.outputName, step]));
  const needed = new Set<string>([template.finalOutputBinding]);
  const queue = [template.finalOutputBinding];

  while (queue.length > 0) {
    const outputName = queue.pop()!;
    const step = byOutput.get(outputName);
    if (!step) continue;
    for (const binding of Object.values(step.inputBindings)) {
      if (binding.kind !== "ref") continue;
      const referencedOutput = binding.ref.split(".")[0];
      if (!referencedOutput || needed.has(referencedOutput)) continue;
      needed.add(referencedOutput);
      queue.push(referencedOutput);
    }
  }

  const steps = template.steps.filter((step) => needed.has(step.outputName));
  const usedParams = new Set<string>();
  for (const step of steps) {
    for (const binding of Object.values(step.inputBindings)) {
      if (binding.kind === "param") usedParams.add(binding.param);
    }
  }

  return {
    ...template,
    steps,
    parameters: template.parameters.filter((param) => usedParams.has(param.name)),
  };
}

// --- Source helpers --------------------------------------------------------

function renderReplayBody(args: {
  template: CallTemplate;
  externalParams: TemplateParameter[];
}): string | null {
  const { template, externalParams } = args;
  const bodyLines: string[] = [];
  for (let i = 0; i < template.steps.length; i += 1) {
    const step = template.steps[i]!;
    const expr = renderStepExpression(step, externalParams);
    if (expr === null) return null;
    bodyLines.push(`  const ${step.outputName} = ${expr};`);
  }
  bodyLines.push(`  return ${template.finalOutputBinding};`);
  return bodyLines.join("\n");
}

// Phase-2 #3: renderSpecializedBody / renderRangeTableMetricBody /
// fallbackQuestionExpr / specializeExternalParams /
// renderRangeTableCandidateRetrieval / caseCollectionIdent were RELOCATED
// VERBATIM to src/eval/finchainSpecialization.ts and are now reached through
// the dataset-neutral CodegenSpecialization registry (see generatePureSource).
// The substrate no longer names any dataset.

function renderInputType(params: TemplateParameter[]): string {
  if (params.length === 0) return "Record<string, unknown>";
  const fields = params
    .map((p) => `${jsonProp(p.name)}${isOptionalInputParam(p) ? "?" : ""}: ${jsTypeToTs(p.jsType)}`)
    .join("; ");
  return `{ ${fields} }`;
}

function renderInputSchema(params: TemplateParameter[]): string {
  if (params.length === 0) return "v.object({})";
  const fields = params
    .map((p) => {
      const schema = jsTypeToValibot(p.jsType);
      return `${jsonProp(p.name)}: ${isOptionalInputParam(p) ? `v.optional(${schema})` : schema}`;
    })
    .join(", ");
  return `v.object({ ${fields} })`;
}

function isOptionalInputParam(param: TemplateParameter): boolean {
  return param.name === "opts";
}

function jsTypeToTs(t: TypeLabel): string {
  switch (t) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      return "unknown[]";
    case "object":
      return "Record<string, unknown>";
    case "null":
      return "null";
    case "unknown":
      return "unknown";
  }
}

function jsTypeToValibot(t: TypeLabel): string {
  switch (t) {
    case "string":
      return "v.string()";
    case "number":
      return "v.number()";
    case "boolean":
      return "v.boolean()";
    case "array":
      return "v.array(v.unknown())";
    case "object":
      return "v.record(v.string(), v.unknown())";
    case "null":
      return "v.null_()";
    case "unknown":
      return "v.unknown()";
  }
}

// JS identifier that's safe to use as an object property without quoting,
// otherwise quote.
function jsonProp(name: string): string {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return name;
  return JSON.stringify(name);
}

// Render a single step's RHS expression. db calls go through
// `df.db.<ident>.<method>`; lib calls unwrap `.value` from the Result
// envelope.
function renderStepExpression(
  step: TemplateStep,
  externalParams: TemplateParameter[],
): string | null {
  const isLib = step.primitive.startsWith("lib.");
  const isDb = step.primitive.startsWith("db.");
  const isTool = step.primitive.startsWith("tool.");
  if (!isLib && !isDb && !isTool) return null;

  if (isTool) {
    // Goal-3 iter 10: sub-graph extractor emits pure tool.* fan-out
    // templates. Render as `await df.tool.<bundle>["<toolName>"](input)`;
    // tool names often contain hyphens (e.g. "local-tvmaze_get_show_info")
    // so bracket notation is required.
    const rest = step.primitive.slice("tool.".length);
    const dot = rest.indexOf(".");
    if (dot < 0) return null;
    const bundle = rest.slice(0, dot);
    const toolName = rest.slice(dot + 1);
    if (bundle.length === 0 || toolName.length === 0) return null;
    const obj = renderBindingObject(step.inputBindings, externalParams);
    if (obj === null) return null;
    const safeBundle = /^[A-Za-z_$][\w$]*$/.test(bundle)
      ? `df.tool.${bundle}`
      : `df.tool[${JSON.stringify(bundle)}]`;
    return `await ${safeBundle}[${JSON.stringify(toolName)}](${obj})`;
  }

  if (isDb) {
    const [, ident, method] = step.primitive.split(".");
    if (!ident || !method) return null;
    const args: string[] = [];
    if (step.callShape === "positional-query-limit") {
      const q = bindingExpr(step.inputBindings["query"], externalParams);
      const l = bindingExpr(step.inputBindings["limit"], externalParams);
      if (q === null) return null;
      if (l !== null) args.push(q, l);
      else args.push(q);
    } else if (step.callShape === "positional-query-opts") {
      const q = bindingExpr(step.inputBindings["query"], externalParams);
      const o = bindingExpr(step.inputBindings["opts"], externalParams);
      if (q === null) return null;
      args.push(q);
      if (o !== null) args.push(o);
    } else if (step.callShape === "positional-filter-limit") {
      const f = bindingExpr(step.inputBindings["filter"], externalParams);
      const l = bindingExpr(step.inputBindings["limit"], externalParams);
      if (f === null) return null;
      if (l !== null) args.push(f, l);
      else args.push(f);
    } else {
      const obj = renderBindingObject(step.inputBindings, externalParams);
      if (obj === null) return null;
      args.push(obj);
    }
    return `await df.db.${ident}.${method}(${args.join(", ")})`;
  }

  // lib.*: single-arg input object; unwrap the Result envelope.
  const obj = renderBindingObject(step.inputBindings, externalParams);
  if (obj === null) return null;
  const libName = step.primitive.slice("lib.".length);
  return `(await df.lib.${libName}(${obj})).value`;
}

// Render the bindings as an object literal `{field: <expr>, ...}`.
function renderBindingObject(
  bindings: TemplateStep["inputBindings"],
  externalParams: TemplateParameter[],
): string | null {
  const props: string[] = [];
  for (const [field, binding] of Object.entries(bindings)) {
    if (field === "__atom") continue;
    const expr = bindingExpr(binding, externalParams);
    if (expr === null) return null;
    props.push(`${jsonProp(field)}: ${expr}`);
  }
  return `{ ${props.join(", ")} }`;
}

// Render a single binding as a TS expression.
function bindingExpr(
  binding: TemplateStep["inputBindings"][string] | undefined,
  externalParams: TemplateParameter[],
): string | null {
  if (!binding) return null;
  if (binding.kind === "ref") return binding.ref;
  const known = externalParams.some((p) => p.name === binding.param);
  if (!known) return null;
  return `input.${jsonProp(binding.param)}`;
}

// --- Example harvesting ----------------------------------------------------

type PickExampleArgs = {
  template: CallTemplate;
  trajectory: TrajectoryRecord;
  externalParams: TemplateParameter[];
};

// Reconstruct the public function's first example by harvesting the
// originating trajectory's literal inputs for each external parameter.
// Walks the steps in order; the FIRST step whose binding references a
// given param is where we pull the literal value.
function pickExample(args: PickExampleArgs): Record<string, unknown> | null {
  const { template, trajectory, externalParams } = args;
  const out: Record<string, unknown> = {};
  for (const param of externalParams) {
    let found = false;
    for (let i = 0; i < template.steps.length; i += 1) {
      const step = template.steps[i]!;
      const call = trajectory.calls[i];
      if (!call) continue;
      const callInput = call.input;
      if (callInput === null || typeof callInput !== "object") {
        // atomic binding
        const atom = step.inputBindings["__atom"];
        if (atom && atom.kind === "param" && atom.param === param.name) {
          out[param.name] = callInput;
          found = true;
          break;
        }
        continue;
      }
      const inputObj = callInput as Record<string, unknown>;
      for (const [field, binding] of Object.entries(step.inputBindings)) {
        if (binding.kind !== "param" || binding.param !== param.name) continue;
        if (field === "__atom") continue;
        out[param.name] = inputObj[field];
        found = true;
        break;
      }
      if (found) break;
    }
    if (!found) return null;
  }
  return out;
}

// --- Misc helpers ----------------------------------------------------------

function intentString(template: CallTemplate): string {
  const seq = callGraphDescription(template);
  return `reusable learned interface for the ${template.topic} intent shape; internally composes ${seq}`;
}

function fanOutIntentString(): string {
  return [
    "reusable learned fan-out interface for repeated per-entity tool calls",
    "caller-facing input is intent-shaped while planner/executor internals provide tool and entity slots",
  ].join("; ");
}

function recordFanOutIntentString(): string {
  return [
    "reusable learned record-backed fan-out interface",
    "fetches records and runs repeated per-entity tool calls without the seed helper",
  ].join("; ");
}

function recordEnrichmentIntentString(): string {
  return [
    "reusable learned record-backed dependent enrichment interface",
    "fetches records, runs verified record fan-out, then runs dependent follow-up tools",
  ].join("; ");
}

function toolEnrichmentIntentString(): string {
  return [
    "reusable learned pure fan-out dependent enrichment interface",
    "runs a repeated tool fan-out, then uses those rows for dependent follow-up tools",
  ].join("; ");
}

function headerComment(args: {
  template: CallTemplate;
  trajectory: TrajectoryRecord;
}): string {
  return [
    `// Learned by datafetch observer from trajectory ${args.trajectory.id}.`,
    `// @shape-hash: ${args.template.shapeHash}`,
    // Goal-4: the data-shape-agnostic intent key. The walk-artifacts
    // instrumentation reads it; the eval's cross-family transfer harness
    // dedups the shared __intent__ pool on it.
    `// @intent-signature: ${args.template.intentSignature}`,
    `// @origin-trajectory: ${args.trajectory.id}`,
    `// @origin-question: ${JSON.stringify(args.trajectory.question)}`,
    `// @steps: ${args.template.steps.map((s) => s.primitive).join(" -> ")}`,
    "",
  ].join("\n");
}

// YAML frontmatter at the very top of the learned interface file. Mirrors the
// format Claude Code skills use at `~/.claude/skills/<name>/SKILL.md`:
// `name` + a `description` block whose text gives the agent enough signal
// to decide whether to call the wrapper directly vs compose from primitives.
//
// Pure-template, no LLM call. Pulls the originating question out of the
// example's longest string value (typically a `query` parameter), the call
// graph from the template's steps, and the input shape from the parameter
// names. The resulting block reads as an affordance the agent can match
// against its task — same shape it's already trained to scan.
function frontmatter(args: {
  template: CallTemplate;
  trajectory: TrajectoryRecord;
  example: Record<string, unknown>;
  externalParams: TemplateParameter[];
}): string {
  const userQuestion =
    longestStringValue(args.example) ?? args.trajectory.question;
  const callGraph = callGraphDescription(args.template);
  const inputKeys = args.externalParams.map((p) => p.name).join(", ");

  // Indent the description's body by two spaces so YAML's `|` block
  // scalar parses cleanly. Newlines inside the block are preserved.
  const descLines = [
    `Learned datafetch interface for questions shaped like:`,
    `  "${userQuestion.replace(/"/g, '\\"')}"`,
    `Internally chains: ${callGraph}.`,
    `Use when the user's question has the same task shape, even if`,
    `the entity, metric, period, or wording differs. Prefer this before`,
    `recomposing the primitive chain. Pass input as { ${inputKeys} };`,
    `the runtime returns the last call's output.`,
  ];
  const description = descLines.map((l) => `  ${l}`).join("\n");

  return [
    "/* ---",
    `name: ${args.template.name}`,
    `status: provisional`,
    `description: |`,
    description,
    `trajectory: ${args.trajectory.id}`,
    `shape-hash: ${args.template.shapeHash}`,
    "--- */",
    "",
  ].join("\n");
}

function fanOutFrontmatter(args: {
  template: CallTemplate;
  trajectory: TrajectoryRecord;
}): string {
  const descLines = [
    `Transferable learned datafetch fan-out helper for repeated per-entity tool calls.`,
    `Use when the task has an entity set and needs the same tool bundle plus`,
    `one or more tool names called for each entity. The caller-facing input is`,
    `intent-shaped: { intent?: "repeated tool fan-out"; limit? }.`,
    `Planner/executor internals infer entity values, tool names, and tool params`,
    `before invoking the runtime implementation.`,
    `the runtime returns one result object per entity with entityId, entityValue,`,
    `top-level per-tool keys, and a nested tools map keyed by tool name.`,
  ];
  const description = descLines.map((l) => `  ${l}`).join("\n");

  return [
    "/* ---",
    `name: ${args.template.name}`,
    `status: provisional`,
    `description: |`,
    description,
    `trajectory: ${args.trajectory.id}`,
    `shape-hash: ${args.template.shapeHash}`,
    "--- */",
    "",
  ].join("\n");
}

function recordFanOutFrontmatter(args: {
  template: CallTemplate;
  trajectory: TrajectoryRecord;
}): string {
  const descLines = [
    `Transferable learned datafetch helper for record-backed per-entity tool fan-out.`,
    `Use when the task starts from mounted records and needs repeated`,
    `per-record enrichment. The caller-facing input is intent-shaped:`,
    `{ intent?: "record-backed repeated fan-out", recordFilter?, recordLimit? }.`,
    `Planner/executor internals infer record fields, tool parameters, and`,
    `tool selection before invoking the runtime implementation.`,
    `the runtime returns one result object per entity with entityId, entityValue,`,
    `record, label, attributes, top-level per-tool keys, and a nested tools map keyed by tool name.`,
  ];
  const description = descLines.map((l) => `  ${l}`).join("\n");

  return [
    "/* ---",
    `name: ${args.template.name}`,
    `status: provisional`,
    `description: |`,
    description,
    `trajectory: ${args.trajectory.id}`,
    `shape-hash: ${args.template.shapeHash}`,
    "--- */",
    "",
  ].join("\n");
}

function recordEnrichmentFrontmatter(args: {
  template: CallTemplate;
  trajectory: TrajectoryRecord;
}): string {
  const descLines = [
    `Transferable learned datafetch helper for record-backed dependent enrichment.`,
    `Use when the task starts from mounted records, first needs a verified`,
    `record-backed fan-out, then needs dependent follow-up tool calls over`,
    `the resulting rows. The caller-facing input is intent-shaped:`,
    `{ intent?: "record-backed dependent enrichment", recordFilter?, recordLimit? }.`,
    `Planner/executor internals infer same-entity and dependent tool mapping`,
    `before invoking the runtime implementation.`,
    `the runtime returns the record fan-out rows enriched with dependentTools`,
    `and a combined tools map.`,
  ];
  const description = descLines.map((l) => `  ${l}`).join("\n");

  return [
    "/* ---",
    `name: ${args.template.name}`,
    `status: provisional`,
    `description: |`,
    description,
    `trajectory: ${args.trajectory.id}`,
    `shape-hash: ${args.template.shapeHash}`,
    "--- */",
    "",
  ].join("\n");
}

function toolEnrichmentFrontmatter(args: {
  template: CallTemplate;
  trajectory: TrajectoryRecord;
}): string {
  const descLines = [
    `Transferable learned datafetch helper for pure tool fan-out dependent enrichment.`,
    `Use when the task first needs repeated same-entity tool calls and then`,
    `needs dependent follow-up tool calls using fields from those rows.`,
    `The caller-facing input is intent-shaped:`,
    `{ intent?: "repeated tool fan-out dependent enrichment", limit? }.`,
    `Planner/executor internals infer entity values, base tools, dependent`,
    `tools, and dependent input extraction before invoking the runtime implementation.`,
    `the runtime returns base fan-out rows enriched with dependentTools`,
    `and a combined tools map.`,
  ];
  const description = descLines.map((line) => `  ${line}`).join("\n");

  return [
    "/* ---",
    `name: ${args.template.name}`,
    `status: provisional`,
    `description: |`,
    description,
    `trajectory: ${args.trajectory.id}`,
    `shape-hash: ${args.template.shapeHash}`,
    "--- */",
    "",
  ].join("\n");
}

function callGraphDescription(template: CallTemplate): string {
  // Phase-2 #3: a registered specialization (out of src/eval) may describe its
  // own call graph; the substrate names no dataset. Default = primitive chain.
  const special = findCodegenSpecialization(template)?.describeCallGraph?.(template);
  if (special != null) return special;
  return template.steps.map((s) => s.primitive).join(" -> ");
}

function longestStringValue(obj: Record<string, unknown>): string | null {
  let best: string | null = null;
  for (const v of Object.values(obj)) {
    if (typeof v === "string" && v.length > 8) {
      if (best === null || v.length > best.length) best = v;
    }
  }
  return best;
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "null";
  }
}

async function readExistingSource(p: string): Promise<string | null> {
  try {
    return await fsp.readFile(p, "utf8");
  } catch {
    return null;
  }
}

// Locate the on-disk SDK barrel as a file:// URL.
function sdkIndexUrl(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // src/observer/author.ts -> src/sdk/index.ts
  const target = path.resolve(here, "..", "sdk", "index.ts");
  return `file://${target.replace(/\\/g, "/")}`;
}

// Locate valibot's ESM entry as a file:// URL. The learned interface
// lives at <baseDir>/lib/<tenantId>/<name>.ts (outside the repo tree),
// so the bare `valibot` specifier wouldn't resolve at import time. We
// embed the absolute URL in the generated source instead. Node 20.6+
// gives us this resolution synchronously via `import.meta.resolve`,
// honouring the package's exports field.
// V1 ReGAL gate: inject `promotion-state`, `coverage-density`, etc. into
// the YAML frontmatter at the head of the authored helper. The frontmatter
// is a `/* --- ... --- */` block; we splice the new keys in just before
// the closing `--- */` marker. Idempotent in the sense that re-stamping
// would create duplicates — but each `authorFunction` invocation builds
// a fresh `source` so the helper file always has exactly one stamp.
function stampPromotionMetadata(
  source: string,
  info: {
    promotionState: "verified" | "narrow";
    coverageDensity: number;
    stepCount: number;
    distinctTools: number;
    gateActive: boolean;
  },
): string {
  const closeIdx = source.indexOf("--- */");
  if (closeIdx < 0) return source;
  const lines = [
    `promotion-state: ${info.promotionState}`,
    `coverage-density: ${info.coverageDensity.toFixed(2)}`,
    `step-count: ${info.stepCount}`,
    `distinct-tools: ${info.distinctTools}`,
    `regal-gate-active: ${info.gateActive}`,
    "",
  ].join("\n");
  return source.slice(0, closeIdx) + lines + source.slice(closeIdx);
}

function valibotEntryUrl(): string {
  // `import.meta.resolve` is sync since Node 20.6; not yet in the
  // default lib types in some configs, so cast through `unknown`.
  const resolve = (
    import.meta as unknown as { resolve: (specifier: string) => string }
  ).resolve;
  return resolve("valibot");
}

// --- Codifier-skill fallback -----------------------------------------------

// Dispatch the codifier skill via the registered BodyDispatcher. We hand
// it the trajectory as input and expect a `{source}` field in the
// response.
async function dispatchCodifier(args: {
  skill: string;
  trajectory: TrajectoryRecord;
}): Promise<string | null> {
  const dispatcher = getBodyDispatcher();
  if (!dispatcher) return null;
  const body = {
    kind: "agent" as const,
    skill: args.skill,
    model:
      process.env.DATAFETCH_CODIFIER_MODEL ??
      process.env.DATAFETCH_LLM_MODEL ??
      process.env.DF_LLM_MODEL ??
      "openai-codex/gpt-5.3-codex-spark",
  };
  // The skill expects {question, filing, context}. We surface the first
  // lib call's output as the "filing" proxy.
  const firstLib = args.trajectory.calls.find((c) =>
    c.primitive.startsWith("lib."),
  );
  const skillInput = {
    question: args.trajectory.question,
    filing: firstLib?.output ?? args.trajectory.calls[0]?.output,
    context: { calls: args.trajectory.calls.map((c) => c.primitive) },
  };
  let raw: unknown;
  try {
    raw = await dispatcher.dispatch(body, skillInput, {
      tenant: args.trajectory.tenantId,
      mount: args.trajectory.provenance?.mount ?? "unknown",
      cost: {
        tier: 3,
        tokens: { hot: 0, cold: 0 },
        ms: { hot: 0, cold: 0 },
        llmCalls: 0,
      },
    });
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const source = rec["source"];
  if (typeof source !== "string") return null;
  if (source.includes("fn({")) return source;
  // Bare function bodies don't fit the fn() factory contract; the
  // observer skips with a clean reason rather than wrap heuristically.
  return null;
}
