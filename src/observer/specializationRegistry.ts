// Dataset-neutral code-gen specialization registry (Phase-2 #3).
//
// The substrate's pure-composition author (author.ts) used to hardcode a
// dataset-specific specialization (a table-math metric shape): a
// candidate-validation loop body, a param reduction to {query, limit}, a
// bespoke retrieval expression, and a call-graph description. That leaked a
// dataset name into the substrate and made "onboard a dataset with zero src/
// changes" impossible.
//
// This registry inverts the dependency: a dataset's eval module (eval/harness/*)
// REGISTERS its specialization here, and the substrate consults the registry
// generically, naming no dataset. Mirrors the existing setHookRegistry /
// setMountRuntimeRegistry convention.
//
// The renderers a specialization needs (bindingExpr, renderStepExpression,
// jsonProp) are author.ts-private; rather than widen author.ts's public
// surface, the substrate lends them at call time via `CodegenContext`, so a
// specialization can live entirely outside src/observer without importing the
// author's internals.

import type { CallTemplate, TemplateParameter, TemplateStep } from "./template.js";

// Renderers the substrate lends to a specialization at code-gen time.
export interface CodegenContext {
  // Render an input binding as a TS expression (`input.<param>` or a ref name),
  // or null when the binding can't be expressed against the external params.
  bindingExpr(
    binding: TemplateStep["inputBindings"][string] | undefined,
    externalParams: TemplateParameter[],
  ): string | null;
  // Render a whole step's call expression, or null when it can't be rendered.
  renderStepExpression(
    step: TemplateStep,
    externalParams: TemplateParameter[],
  ): string | null;
  // Safe object-property rendering (identifier or quoted string).
  jsonProp(name: string): string;
}

// A dataset-specific code-gen specialization. Every hook is optional except
// `matches`; an absent hook means "use the substrate default".
export interface CodegenSpecialization {
  // Stable id for diagnostics, e.g. "<dataset>:<shape>".
  id: string;
  // Does this specialization apply to the given template?
  matches(template: CallTemplate): boolean;
  // Skip step-pruning (bindRowsToPriorRetrieval + pruneUnusedTemplateSteps) for
  // this template shape? Defaults to false.
  skipPruning?(template: CallTemplate): boolean;
  // Reduce the public input params (e.g. to {query, limit}). Null => defaults.
  specializeExternalParams?(
    template: CallTemplate,
    externalParams: TemplateParameter[],
  ): TemplateParameter[] | null;
  // Render the function body. Null => fall back to the generic replay body.
  renderBody?(
    template: CallTemplate,
    externalParams: TemplateParameter[],
    ctx: CodegenContext,
  ): string | null;
  // Describe the internal call graph for the intent/frontmatter. Null =>
  // substrate default (the primitive sequence joined by " -> ").
  describeCallGraph?(template: CallTemplate): string | null;
}

const registry: CodegenSpecialization[] = [];

// Idempotent on `id`: re-registering replaces the prior entry, so repeated
// harness boots / test re-imports don't accumulate duplicates.
export function registerCodegenSpecialization(spec: CodegenSpecialization): void {
  const i = registry.findIndex((s) => s.id === spec.id);
  if (i >= 0) registry[i] = spec;
  else registry.push(spec);
}

// First specialization whose `matches` returns true, or null.
export function findCodegenSpecialization(
  template: CallTemplate,
): CodegenSpecialization | null {
  return registry.find((s) => s.matches(template)) ?? null;
}

// Test seam: drop all registrations.
export function clearCodegenSpecializations(): void {
  registry.length = 0;
}
