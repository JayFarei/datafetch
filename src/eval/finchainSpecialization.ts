// FinChain code-gen specialization (Phase-2 #3 relocation).
//
// These functions were RELOCATED VERBATIM from src/observer/author.ts (the
// `rangeTableMetric` / `finqacases` branches). The only change is that the
// three author-private renderers (bindingExpr, renderStepExpression, jsonProp)
// now arrive via the `CodegenContext` the substrate lends at call time, so the
// substrate no longer names this dataset (grep-clean) while behaviour is
// byte-identical (guarded by tests/sac-rangetable-codegen.test.ts).
//
// Importing this module registers the specialization. The FinChain runner
// (finchainFullDatafetch.ts) imports it so authoring during a FinChain eval
// produces the same rangeTableMetric helper as before.

import {
  registerCodegenSpecialization,
  type CodegenContext,
} from "../observer/specializationRegistry.js";
import type {
  CallTemplate,
  TemplateParameter,
  TemplateStep,
} from "../observer/template.js";

// FinChain's table-math metric shape. (Was: author.ts template.name check.)
function matches(template: CallTemplate): boolean {
  return template.name === "rangeTableMetric";
}

// (Was: the rangeTableMetric branch of generatePureSource's pruning gates.)
function skipPruning(template: CallTemplate): boolean {
  return template.name === "rangeTableMetric";
}

// (Was: specializeExternalParams in author.ts.)
function specializeExternalParams(
  _template: CallTemplate,
  externalParams: TemplateParameter[],
): TemplateParameter[] | null {
  const query =
    externalParams.find((param) => param.name === "query") ??
    externalParams.find((param) => param.name === "question") ??
    externalParams.find((param) => param.jsType === "string");
  if (!query) return null;
  const limit = externalParams.find(
    (param) => param.name === "limit" && param.jsType === "number",
  );
  return limit ? [query, limit] : [query];
}

// (Was: renderRangeTableMetricBody in author.ts; bindingExpr/renderStepExpression via ctx.)
function renderBody(
  template: CallTemplate,
  externalParams: TemplateParameter[],
  ctx: CodegenContext,
): string | null {
  const retrieval = template.steps.find((step) => step.primitive.startsWith("db."));
  const infer = template.steps.find(
    (step) => step.primitive === "lib.inferTableMathPlan",
  );
  const execute = template.steps.find(
    (step) => step.primitive === "lib.executeTableMath",
  );
  if (!retrieval || !infer || !execute) return null;

  const questionExpr =
    ctx.bindingExpr(infer.inputBindings["question"], externalParams) ??
    fallbackQuestionExpr(externalParams, ctx);
  if (questionExpr === null) return null;

  const retrievalExpr =
    renderRangeTableCandidateRetrieval(
      {
        template,
        fallbackRetrieval: retrieval,
        externalParams,
        questionExpr,
      },
      ctx,
    ) ?? ctx.renderStepExpression(retrieval, externalParams);
  if (retrievalExpr === null) return null;

  return [
    `  const isNumericTableMathResult = (value: unknown): boolean => {`,
    `    if (!value || typeof value !== "object") return false;`,
    `    const result = value as { answer?: unknown; roundedAnswer?: unknown };`,
    `    return (`,
    `      (typeof result.answer === "number" && Number.isFinite(result.answer)) ||`,
    `      (typeof result.roundedAnswer === "number" &&`,
    `        Number.isFinite(result.roundedAnswer))`,
    `    );`,
    `  };`,
    `  const ${retrieval.outputName} = ${retrievalExpr};`,
    `  const candidates = Array.isArray(${retrieval.outputName}) ? ${retrieval.outputName} : [];`,
    `  const failures: Array<{ reason: string; message?: string }> = [];`,
    `  for (const candidate of candidates) {`,
    `    try {`,
    `      const plan = (await df.lib.inferTableMathPlan({`,
    `        question: ${questionExpr},`,
    `        filing: candidate,`,
    `      })).value as { years?: unknown[] };`,
    `      if (!Array.isArray(plan.years) || plan.years.length === 0) {`,
    `        failures.push({ reason: "missing_year_coverage" });`,
    `        continue;`,
    `      }`,
    `      const result = (await df.lib.executeTableMath({`,
    `        filing: candidate,`,
    `        plan,`,
    `      })).value;`,
    `      if (isNumericTableMathResult(result)) return result;`,
    `      failures.push({ reason: "non_numeric_result" });`,
    `    } catch (error) {`,
    `      failures.push({`,
    `        reason: "candidate_failed",`,
    `        message: error instanceof Error ? error.message : String(error),`,
    `      });`,
    `    }`,
    `  }`,
    `  return {`,
    `    answer: null,`,
    `    roundedAnswer: null,`,
    `    operation: "range",`,
    `    evidence: [],`,
    `    failures,`,
    `  };`,
  ].join("\n");
}

// (Was: fallbackQuestionExpr in author.ts; jsonProp via ctx.)
function fallbackQuestionExpr(
  params: TemplateParameter[],
  ctx: CodegenContext,
): string | null {
  const direct = params.find(
    (param) => param.name === "query" || param.name === "question",
  );
  if (direct) return `input.${ctx.jsonProp(direct.name)}`;
  const stringParam = params.find((param) => param.jsType === "string");
  return stringParam ? `input.${ctx.jsonProp(stringParam.name)}` : null;
}

// (Was: renderRangeTableCandidateRetrieval in author.ts; bindingExpr/jsonProp via ctx.)
function renderRangeTableCandidateRetrieval(
  args: {
    template: CallTemplate;
    fallbackRetrieval: TemplateStep;
    externalParams: TemplateParameter[];
    questionExpr: string;
  },
  ctx: CodegenContext,
): string | null {
  const caseIdent = caseCollectionIdent(args.template);
  if (!caseIdent) return null;
  const limitExpr =
    ctx.bindingExpr(args.fallbackRetrieval.inputBindings["limit"], args.externalParams) ??
    (args.externalParams.some((param) => param.name === "limit")
      ? `input.${ctx.jsonProp("limit")}`
      : "20");
  return `await df.db.${caseIdent}.findSimilar(${args.questionExpr}, ${limitExpr})`;
}

// (Was: caseCollectionIdent in author.ts — the FinChain `finqacases` collection.)
function caseCollectionIdent(template: CallTemplate): string | null {
  for (const step of template.steps) {
    if (!step.primitive.startsWith("db.")) continue;
    const [, ident] = step.primitive.split(".");
    if (ident && ident.toLowerCase() === "finqacases") return ident;
  }
  return null;
}

// (Was: the rangeTableMetric branch of callGraphDescription in author.ts.)
function describeCallGraph(template: CallTemplate): string | null {
  const retrieval = template.steps.find((step) => step.primitive.startsWith("db."));
  const hasInfer = template.steps.some(
    (step) => step.primitive === "lib.inferTableMathPlan",
  );
  const hasExecute = template.steps.some(
    (step) => step.primitive === "lib.executeTableMath",
  );
  if (retrieval && hasInfer && hasExecute) {
    return `${retrieval.primitive} -> candidate validation loop -> lib.inferTableMathPlan -> lib.executeTableMath`;
  }
  return null;
}

registerCodegenSpecialization({
  id: "finchain:rangeTableMetric",
  matches,
  skipPruning,
  specializeExternalParams,
  renderBody,
  describeCallGraph,
});
