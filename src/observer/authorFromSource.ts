// iter 3.3: generic source-to-helper authoring.
//
// One general operation, no benchmark identifiers: given the agent's
// trajectory.sourceText (post-prepareAnswerSourceForRuntime, captured by
// iter 3.1 in the snippet runtime), extract the agent's parameterised TS
// body, validate the body parses + only uses an allowlist of constructs,
// promote top-of-main numeric-literal `const` declarations to typed input
// fields, replace the `df.answer({value: <expr>, ...})` envelope with a
// direct `return <expr>`, and emit a callable fn() module.
//
// Fires only when all five existing render paths in src/observer/author.ts
// return null AND the gate's acceptedShape.hasInlineComputation is true.
// Existing renderers are unchanged — this is a NEW file at the end of the
// cascade, not a sixth special case.
//
// Codex-mandated mitigations from the plan §A-F:
//   A. immutable source snapshot via TrajectoryRecord.sourceText (iter 3.1)
//   B. quarantine-then-promote (this author writes @quarantined: true; the
//      replay validator in iter 3.4 flips on both checks passing)
//   C. AST-based mandatory parameter extraction (no regex on the body)
//   D. formula-fingerprint intent signature (so distinct formulas with the
//      same call sequence are not collapsed by the worker's dedup)
//   E. helper body returns the answer value directly (no {value: ...} double-wrap)
//   F. allowlist transform — reject process.*, imports, fs/net side
//      effects, multiple df.answer calls, unresolved free identifiers
//      other than `df` and `Math`.

import { createHash } from "node:crypto";
import ts from "typescript";

import type { TrajectoryRecord } from "../sdk/index.js";

import type { CallTemplate } from "./template.js";

export type RenderFromAgentSourceArgs = {
  trajectory: TrajectoryRecord;
  template: CallTemplate;
  // iter 3.2 hint from the gate. The new author only fires when the hint
  // is true. When false/undefined, returns null so the cascade falls
  // through to the codifier-skill fallback or the worker's skipped path.
  acceptedShape?: { hasInlineComputation: boolean };
  // The substrate commit sha stamped into the helper header for iter 3.6
  // sweep/rollback. Optional; when undefined, the helper header records
  // "@substrate-version: unknown".
  substrateVersion?: string;
};

// Identifiers the allowlist transform accepts as free references in the
// agent's body. `df` is the host-injected global. `Math` is the standard
// numeric builtin every numeric-shape benchmark uses. `console` is
// allowed for printf-debug lines the agent emits — they execute
// harmlessly in the helper body and don't affect the return value.
const ALLOWLIST_FREE_IDENTIFIERS = new Set([
  "df",
  "Math",
  "console",
  "Number",
  "JSON",
  "Object",
  "Array",
  "String",
  "Boolean",
]);

// Names of well-known answer-commit shapes the agent uses to commit the
// final value. The author rewrites `df.answer({value: <expr>, ...})` (or
// `answer({...})`) to `return <expr>`.
const ANSWER_CALL_NAMES = new Set(["answer"]);

export function renderFromAgentSource(args: RenderFromAgentSourceArgs): string | null {
  if (!args.acceptedShape?.hasInlineComputation) return null;
  const source = args.trajectory.sourceText;
  if (!source || source.trim().length === 0) return null;

  // 1. Parse.
  const sf = ts.createSourceFile(
    "agent-source.ts",
    source,
    ts.ScriptTarget.ES2022,
    /*setParentNodes*/ true,
    ts.ScriptKind.TS,
  );
  // Empirically the runtime injects an IIFE wrapper but the agent's main()
  // is preserved verbatim inside it. Look for `function main` /
  // `async function main` at the top OR inside the wrapper.
  const mainFn = findMainFunction(sf);
  if (!mainFn || !mainFn.body) return null;
  const body: ts.Block | null = ts.isBlock(mainFn.body) ? mainFn.body : null;
  if (!body) return null;

  // Collect identifiers declared at the source-file's top level so the
  // allowlist transform doesn't reject the agent body for referencing
  // outer-scope helpers the snippet runtime injects (e.g.
  // safeRecordsFindExact, the bare `answer` alias). These references are
  // safe to leave in the agent body — the rewrite below will not strip
  // them, but they will only resolve if the helper-body call site
  // provides them. For the numeric table-math shape, the typical outer-scope helper
  // is the safe-wrapper around df.db.records.findExact; calling it from
  // the helper is harmless since the helper's body re-imports nothing
  // and only references `df.db.records.findExact` via the safe wrapper —
  // we'll inline it in the rewrite step (see rewriteBody).
  const outerDeclared = collectTopLevelDeclaredNames(sf);

  // 2. Allowlist transform.
  const allowlistResult = checkAllowlist(body, sf, outerDeclared);
  if (!allowlistResult.ok) return null;

  // 3. Mandatory parameter extraction.
  const promoted = extractPromotedParameters(body);
  if (promoted.length === 0) return null;

  // 4. Find the df.answer call's `value:` property expression.
  const answerValueExpr = findAnswerValueExpression(body);
  if (!answerValueExpr) return null;

  // 5. Build the helper body. Rewrite the agent's main() body so that:
  //    a) The `const <p> = <literal>;` declarations of promoted params are
  //       replaced with a single destructure from `input`.
  //    b) Statements that depend on outer-declared (non-allowlisted)
  //       runtime helpers — e.g. the `siblings = await safeRecordsFindExact(...)`
  //       line that the snippet runtime injects — are stripped from the
  //       helper body. The agent reads siblings for sibling-formula
  //       inference; the helper has no need for them because the math
  //       runs over the promoted-param literals.
  //    c) The trailing `df.answer({value: <expr>, ...})` (or `answer(...)`)
  //       is replaced with `return <expr>` — the fn() wrapper at
  //       src/sdk/fn.ts:236 produces Result.value = <return> directly, no
  //       double-wrap.
  const promotedNames = promoted.map((p) => p.name);
  const rewritten = rewriteBody({
    body,
    sourceFile: sf,
    promotedNames: new Set(promotedNames),
    answerCallSpan: findAnswerCallSpan(body),
    answerValueExprText: answerValueExpr.text,
    outerDeclared,
  });

  // 6. Formula fingerprint as intent signature.
  const fingerprint = formulaFingerprint(answerValueExpr.text, promotedNames);

  // 7. Emit the helper module.
  return renderHelperSource({
    templateName: args.template.name,
    shapeHash: args.template.shapeHash,
    intent: deriveIntent(args.trajectory, promotedNames),
    intentSignature: `source(${fingerprint})`,
    sourceHash: args.trajectory.sourceHash ?? "unknown",
    // iter 3.6: stamp the substrate commit sha into the helper header so
    // the sweep script can identify helpers authored under older
    // substrate versions and remove them on a `git revert + sweep`
    // rollback. Caller can pass an explicit version via args.substrateVersion;
    // otherwise the env var DATAFETCH_SUBSTRATE_VERSION is read; otherwise
    // "unknown" (back-compat with pre-iter-3.6 callers that don't set it).
    substrateVersion:
      args.substrateVersion ??
      process.env["DATAFETCH_SUBSTRATE_VERSION"] ??
      "unknown",
    promotedNames,
    rewrittenBody: rewritten,
  });
}

// --- helpers --------------------------------------------------------------

function findMainFunction(sf: ts.SourceFile): ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | null {
  let found: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | null = null;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === "main"
    ) {
      found = node;
      return;
    }
    if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name) && node.name.text === "main" && node.initializer) {
      if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
        found = node.initializer;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

type AllowlistResult = { ok: true } | { ok: false; reason: string };

function collectTopLevelDeclaredNames(sf: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) out.add(decl.name.text);
        // Destructuring not handled — top-level numeric-shape agent code uses
        // bare consts in practice; the iter 4 demonstration verifies.
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name) {
      out.add(node.name.text);
    }
  };
  // Walk only top-level statements (immediate children of the source
  // file body); the snippet runtime's IIFE wrapper hoists everything
  // declared inside the user's source up to the top level of the
  // generated module before main() runs.
  sf.statements.forEach(visit);
  // Many DiskSnippetRuntime-generated modules expose the user's body
  // inside an `export const __df_done = (async () => { ... })();` IIFE.
  // Walk one level into that IIFE body too so outer helpers declared
  // there (e.g. `safeRecordsFindExact`) are visible.
  const visitDeep = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (
        ts.isParenthesizedExpression(expr) &&
        (ts.isArrowFunction(expr.expression) || ts.isFunctionExpression(expr.expression)) &&
        expr.expression.body &&
        ts.isBlock(expr.expression.body)
      ) {
        for (const stmt of expr.expression.body.statements) visit(stmt);
      }
    }
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (decl.initializer) {
          if (
            ts.isArrowFunction(decl.initializer) ||
            ts.isFunctionExpression(decl.initializer) ||
            ts.isCallExpression(decl.initializer)
          ) {
            // Descend into IIFE bodies attached to variable initialisers
            visitDeep(decl.initializer);
          }
        }
      }
    }
  };
  sf.statements.forEach(visitDeep);
  return out;
}

function checkAllowlist(body: ts.Block, sf: ts.SourceFile, outerDeclared: Set<string>): AllowlistResult {
  void sf;
  let answerCalls = 0;
  let importStmts = 0;
  let processRefs = 0;
  let freeIdentRefs: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)) {
      importStmts += 1;
    }
    if (ts.isCallExpression(node)) {
      // df.answer(...) or answer(...)
      if (ts.isIdentifier(node.expression) && ANSWER_CALL_NAMES.has(node.expression.text)) {
        answerCalls += 1;
      } else if (
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "df" &&
        node.expression.name.text === "answer"
      ) {
        answerCalls += 1;
      }
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "process") {
      processRefs += 1;
    }
    if (ts.isIdentifier(node) && node.parent) {
      // skip identifiers used as the LHS of a property access (e.g. obj.foo,
      // where "foo" is not a free identifier reference) and skip declared
      // names (function names, variable names being declared, parameter
      // names, property names in object literals, type references)
      const parent = node.parent;
      const isPropertyAccessName = ts.isPropertyAccessExpression(parent) && parent.name === node;
      const isQualifiedNameRight = ts.isQualifiedName(parent) && parent.right === node;
      const isDeclName =
        (ts.isVariableDeclaration(parent) && parent.name === node) ||
        (ts.isFunctionDeclaration(parent) && parent.name === node) ||
        (ts.isParameter(parent) && parent.name === node) ||
        (ts.isBindingElement(parent) && parent.name === node);
      const isPropertyName = ts.isPropertyAssignment(parent) && parent.name === node;
      const isShorthand = ts.isShorthandPropertyAssignment(parent) && parent.name === node;
      if (
        !isPropertyAccessName &&
        !isQualifiedNameRight &&
        !isDeclName &&
        !isPropertyName &&
        !isShorthand &&
        !ALLOWLIST_FREE_IDENTIFIERS.has(node.text) &&
        !ANSWER_CALL_NAMES.has(node.text) &&
        !isBindingDeclaredInBody(body, node.text) &&
        !outerDeclared.has(node.text)
      ) {
        freeIdentRefs.push(node.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);

  if (importStmts > 0) return { ok: false, reason: "import statement in agent body" };
  if (processRefs > 0) return { ok: false, reason: "process.* reference in agent body" };
  if (answerCalls < 1) return { ok: false, reason: "no df.answer / answer call found" };
  if (answerCalls > 1) return { ok: false, reason: `${answerCalls} df.answer calls — exactly 1 required` };
  if (freeIdentRefs.length > 0) {
    return {
      ok: false,
      reason: `unallowlisted free identifier(s): ${[...new Set(freeIdentRefs)].slice(0, 5).join(", ")}`,
    };
  }
  return { ok: true };
}

function isBindingDeclaredInBody(body: ts.Block, name: string): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      found = true;
      return;
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
}

type PromotedParam = { name: string; literalText: string };

function extractPromotedParameters(body: ts.Block): PromotedParam[] {
  const out: PromotedParam[] = [];
  for (const stmt of body.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue;
      if (!decl.initializer) continue;
      if (!isPureLiteralArithmetic(decl.initializer)) continue;
      out.push({ name: decl.name.text, literalText: decl.initializer.getText() });
    }
  }
  return out;
}

function isPureLiteralArithmetic(node: ts.Expression): boolean {
  if (ts.isNumericLiteral(node)) return true;
  if (ts.isPrefixUnaryExpression(node) && (node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.PlusToken)) {
    return isPureLiteralArithmetic(node.operand);
  }
  if (ts.isParenthesizedExpression(node)) {
    return isPureLiteralArithmetic(node.expression);
  }
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (
      op !== ts.SyntaxKind.PlusToken &&
      op !== ts.SyntaxKind.MinusToken &&
      op !== ts.SyntaxKind.AsteriskToken &&
      op !== ts.SyntaxKind.SlashToken &&
      op !== ts.SyntaxKind.PercentToken &&
      op !== ts.SyntaxKind.AsteriskAsteriskToken
    ) {
      return false;
    }
    return isPureLiteralArithmetic(node.left) && isPureLiteralArithmetic(node.right);
  }
  return false;
}

type AnswerValueLocation = {
  text: string;
  start: number;
  end: number;
};

function findAnswerValueExpression(body: ts.Block): AnswerValueLocation | null {
  let result: AnswerValueLocation | null = null;
  const visit = (node: ts.Node): void => {
    if (result) return;
    if (ts.isCallExpression(node)) {
      const isAnswer =
        (ts.isIdentifier(node.expression) && ANSWER_CALL_NAMES.has(node.expression.text)) ||
        (ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === "df" &&
          node.expression.name.text === "answer");
      if (isAnswer && node.arguments.length > 0) {
        const arg = node.arguments[0]!;
        if (ts.isObjectLiteralExpression(arg)) {
          for (const prop of arg.properties) {
            if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === "value") {
              result = {
                text: prop.initializer.getText(),
                start: prop.initializer.getStart(),
                end: prop.initializer.getEnd(),
              };
              return;
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return result;
}

type Span = { start: number; end: number };

function findAnswerCallSpan(body: ts.Block): Span | null {
  let span: Span | null = null;
  const visit = (node: ts.Node): void => {
    if (span) return;
    if (ts.isCallExpression(node)) {
      const isAnswer =
        (ts.isIdentifier(node.expression) && ANSWER_CALL_NAMES.has(node.expression.text)) ||
        (ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === "df" &&
          node.expression.name.text === "answer");
      if (isAnswer) {
        // Walk up to the enclosing statement so we replace the whole
        // `return df.answer({...})` / `await df.answer(...)` / bare call
        // line, not just the call expression.
        let stmt: ts.Node = node;
        while (stmt.parent && !ts.isBlock(stmt.parent)) {
          stmt = stmt.parent;
        }
        span = { start: stmt.getStart(), end: stmt.getEnd() };
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return span;
}

function rewriteBody(input: {
  body: ts.Block;
  sourceFile: ts.SourceFile;
  promotedNames: Set<string>;
  answerCallSpan: Span | null;
  answerValueExprText: string;
  outerDeclared: Set<string>;
}): string {
  void input.sourceFile;
  const lines: string[] = [];
  const destructure = `const { ${[...input.promotedNames].join(", ")} } = input;`;
  lines.push(`  ${destructure}`);
  for (const stmt of input.body.statements) {
    if (ts.isVariableStatement(stmt)) {
      const filteredDecls = stmt.declarationList.declarations.filter((d) => {
        if (!ts.isIdentifier(d.name)) return true;
        // Drop the promoted-param declarations (they're destructured above)
        if (input.promotedNames.has(d.name.text)) return false;
        // Drop declarations whose initializer references an outer-declared
        // helper (e.g. `const siblings = await safeRecordsFindExact(...)`).
        // These statements are agent scratchpad — they don't contribute to
        // the math, and their dependencies don't exist outside the snippet
        // runtime that injected them. Stripping them keeps the helper
        // self-contained.
        if (d.initializer && initializerReferencesOuter(d.initializer, input.outerDeclared, input.promotedNames)) {
          return false;
        }
        return true;
      });
      if (filteredDecls.length === 0) continue;
      const kw = stmt.declarationList.flags & ts.NodeFlags.Const
        ? "const"
        : stmt.declarationList.flags & ts.NodeFlags.Let
          ? "let"
          : "var";
      const declTexts = filteredDecls.map((d) => d.getText());
      lines.push(`  ${kw} ${declTexts.join(", ")};`);
      continue;
    }
    // Replace the answer-call statement with `return <value-expr>;` exactly
    // once. Other statements keep their original text.
    if (input.answerCallSpan && stmt.getStart() === input.answerCallSpan.start) {
      lines.push(`  return ${input.answerValueExprText};`);
      continue;
    }
    // Strip expression-statements that call an outer-declared helper but
    // don't bind a result (rare but possible). Keep everything else.
    if (
      ts.isExpressionStatement(stmt) &&
      ts.isCallExpression(stmt.expression) &&
      ts.isIdentifier(stmt.expression.expression) &&
      input.outerDeclared.has(stmt.expression.expression.text)
    ) {
      continue;
    }
    lines.push(`  ${stmt.getText()}`);
  }
  return lines.join("\n");
}

function initializerReferencesOuter(
  expr: ts.Expression,
  outer: Set<string>,
  promoted: Set<string>,
): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isIdentifier(node) && outer.has(node.text) && !promoted.has(node.text)) {
      // Skip property access right-side identifiers (e.g. obj.foo where
      // `foo` is in outer just by name — but actually if outer has it,
      // then the identifier IS the binding).
      const parent = node.parent;
      const isPropertyAccessName = ts.isPropertyAccessExpression(parent) && parent.name === node;
      if (!isPropertyAccessName) {
        found = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(expr);
  return found;
}

function formulaFingerprint(valueExprText: string, promotedNames: string[]): string {
  // Replace each promoted-param identifier with a canonical placeholder so
  // the same formula expressed with different local-variable names hashes
  // to the same fingerprint. Placeholders are positional in the
  // alphabetically-sorted promoted-name list so the worker's intent dedup
  // collapses semantically-identical helpers but separates distinct
  // formulas.
  const sorted = [...promotedNames].sort();
  let normalised = valueExprText;
  // Word-boundary substitution; do longest first to avoid partial overlaps
  const byLength = [...sorted].sort((a, b) => b.length - a.length);
  for (let i = 0; i < byLength.length; i += 1) {
    const name = byLength[i]!;
    const idx = sorted.indexOf(name);
    const placeholder = `__p${idx}__`;
    normalised = normalised.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "g"), placeholder);
  }
  // Collapse whitespace so cosmetic formatting differences don't perturb
  // the fingerprint.
  normalised = normalised.replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalised).digest("hex").slice(0, 16);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function deriveIntent(trajectory: TrajectoryRecord, promotedNames: string[]): string {
  // trajectory.question is set by firstNonEmptyLine(source), which after
  // prepareAnswerSourceForRuntime's preprocessing is "const answer =
  // df.answer.bind(df);" — useless. Search the source text for a
  // benchmark-conventional `// Question (verbatim):` block, parse the
  // following commented lines as the actual task description. If that
  // signal isn't present, fall back to a generic parameter-shape
  // description that at least lists what the helper takes.
  const params = promotedNames.join(", ");
  const source = trajectory.sourceText ?? "";
  const m = source.match(/\/\/\s*Question\s*\(verbatim\):\s*([\s\S]*?)\n\s*(?:\/\/\s*\n|\n\s*\nasync\s+function|\nasync\s+function|\nfunction\s)/i);
  if (m) {
    const block = m[1]!
      .split("\n")
      .map((line) => line.replace(/^\s*\/\/\s?/, "").trim())
      .filter((line) => line.length > 0)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (block.length > 0) {
      const head = block.length > 200 ? `${block.slice(0, 197)}...` : block;
      return `${head} (helper derived from agent source; parameters: ${params}).`;
    }
  }
  return `Numeric formula derived from agent source over parameters: ${params}.`;
}

function renderHelperSource(input: {
  templateName: string;
  shapeHash: string;
  intent: string;
  intentSignature: string;
  sourceHash: string;
  substrateVersion: string;
  promotedNames: string[];
  rewrittenBody: string;
}): string {
  const fields = input.promotedNames.map((n) => `    ${n}: v.number(),`).join("\n");
  const inputType = `{ ${input.promotedNames.map((n) => `${n}: number`).join("; ")} }`;
  const intentEscaped = input.intent.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const intentSigEscaped = input.intentSignature.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `/* ---
@author: authorFromSource (iter 3.3)
@status: candidate
@quarantined: true
@intent: ${input.intent}
@intent-signature: ${input.intentSignature}
@shape-hash: ${input.shapeHash}
@source-hash: ${input.sourceHash}
@substrate-version: ${input.substrateVersion}
--- */
import { fn } from "@datafetch/sdk";
import * as v from "valibot";

export const ${input.templateName} = fn({
  intent: "${intentEscaped}",
  examples: [],
  input: v.object({
${fields}
  }),
  output: v.unknown(),
  intentSignature: "${intentSigEscaped}",
  async body(input) {
    const _input = input as ${inputType};
${input.rewrittenBody.replace(/\binput\b/g, "_input")}
  },
});
`;
}
