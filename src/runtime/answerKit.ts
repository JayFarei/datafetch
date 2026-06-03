// Cross-cutting substrate utilities shared by every dataset eval.
//
// Two responsibilities:
//
// 1. ANSWER-KIT EMITTER (`renderAnswerKitSource`) — produces the standard
//    `scripts/datafetch_answer_kit.ts` content that any harness writes
//    into the episode workspace. Provides g/arr/rowsOf/unwrap/text/num
//    helpers + the universal payload-envelope unwrap policy
//    (`{success, <entity>}` -> `<entity>`, generic single-key wrappers,
//    list extraction across value/data/results/items/records/rows/...).
//
// 2. GENERIC SYNTAX-SLIP REWRITERS — transformations that fix common
//    LLM-authored code patterns before they hit the snippet runtime:
//    mixed `??`/`||` without parens, unsafe `.toLowerCase()` on
//    `??`-chains, dotted indicator access, snake-case shorthand. All
//    are idempotent and no-ops on syntactically valid code.
//
// Harnesses should call `applyGenericSyntaxFixes(source)` on raw
// agent-authored snippet source before passing it to the snippet runtime.
// Dataset-specific rewriters (workspace-aware, schema-aware, manifest
// driven) live in the dataset's own eval file, layered on top.

import ts from "typescript";

// --- Answer-kit surface ----------------------------------------------------

export const ANSWER_KIT_IMPORT = "./datafetch_answer_kit.ts";

export const ANSWER_KIT_HELPERS = [
  "g",
  "arr",
  "asArr",
  "num",
  "pickNum",
  "avg",
  "r1",
  "firstVal",
  "text",
  "rowsOf",
  "writeJson",
] as const;

// --- answer-kit equality predicate (Phase 2: dataset-neutral governance) ----
//
// Generalises governance replay-matching beyond numbers. The quarantine gate
// (src/observer/quarantineValidator.ts) historically validated only NUMERIC
// answers (FAC 1% tolerance), so a helper whose verified answer is a string /
// boolean / structured value could never reach validated-typescript maturity —
// the gate logged "not numeric" and declined. `answerEquals` dispatches by type:
//   - numeric (incl. numeric-coercible strings like "$1,000"): relative FAC
//     tolerance (default 1e-2, matching the FinChain FAC contract / isFacMatch)
//   - boolean: strict equality
//   - string: normalised equality (trim, case-fold, collapse internal whitespace)
//   - array/object: canonical (recursively key-sorted) deep equality
// The numeric branch is behaviourally identical to the prior gate, so wiring
// this into replayOnTrajectory is ADDITIVE for numeric corpora (FinChain) and
// net-new capability for the rest. Pure + deterministic for unit-testing.
export const ANSWER_FAC_REL_TOLERANCE = 1e-2;

function answerKitCoerceNumeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/[$£€,\s%]/g, "");
    if (cleaned.length === 0) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function answerKitNormString(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function answerKitCanonical(value: unknown): string {
  const seen = new WeakSet<object>();
  const norm = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v as object)) return null; // cycle guard
    seen.add(v as object);
    if (Array.isArray(v)) return (v as unknown[]).map(norm);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = norm((v as Record<string, unknown>)[k]);
    }
    return out;
  };
  return JSON.stringify(norm(value)) ?? "undefined";
}

// Dataset-neutral answer equality. `got` = replayed helper output, `expected` =
// the trajectory's verified answer value. Returns true iff they match under the
// type-appropriate rule.
export function answerEquals(
  got: unknown,
  expected: unknown,
  opts?: { relTol?: number },
): boolean {
  const tol = opts?.relTol ?? ANSWER_FAC_REL_TOLERANCE;
  const eg = answerKitCoerceNumeric(expected);
  const gg = answerKitCoerceNumeric(got);
  if (eg !== null && gg !== null) {
    // denom matches the gate's prior isFacMatch exactly (max(|got|,|expected|,1))
    // so wiring this into the numeric path is behaviourally identical.
    const denom = Math.max(Math.abs(gg), Math.abs(eg), 1);
    return Math.abs(gg - eg) / denom <= tol;
  }
  if (typeof expected === "boolean" || typeof got === "boolean") return got === expected;
  if (typeof expected === "string" && typeof got === "string") {
    return answerKitNormString(got) === answerKitNormString(expected);
  }
  return answerKitCanonical(got) === answerKitCanonical(expected);
}

export function renderAnswerKitSource(): string {
  return [
    "import { writeFile } from \"node:fs/promises\";",
    "const envelopeKeys = [\"value\", \"data\", \"result\", \"record\", \"entity\", \"item\", \"payload\"];",
    "const envelopeMetaKeys = new Set([\"success\", \"ok\", \"status\", \"error\", \"message\", \"code\", \"errors\", \"warnings\", \"elapsedMs\", \"elapsed_ms\", \"took\"]);",
    "const isErrorLike = (x: any) => x != null && typeof x === \"object\" && !Array.isArray(x) && x.success === false && (typeof x.error === \"string\" || typeof x.message === \"string\");",
    "export const unwrap = (x: any) => {",
    "  if (x == null || typeof x !== \"object\" || Array.isArray(x)) return x;",
    "  if (isErrorLike(x)) return undefined;",
    "  if (typeof x.success === \"boolean\" || typeof x.ok === \"boolean\") {",
    "    const payloadKeys = Object.keys(x).filter((k) => !envelopeMetaKeys.has(k) && x[k] != null);",
    "    if (payloadKeys.length === 1) return x[payloadKeys[0]];",
    "  }",
    "  for (const key of envelopeKeys) { if (x?.[key] != null) return x[key]; }",
    "  // Generic single-key wrapper: tool responses like {pokemon: {...}} or {show: {...}} that wrap their",
    "  // payload under an entity-named key (no success/ok flag, no envelope key) get unwrapped here. Avoids",
    "  // smuggling benchmark identifiers into the envelope allowlist while still matching the prompt's",
    "  // documented promise that unwrap() strips single-key wrappers.",
    "  const wrapperKeys = Object.keys(x).filter((k) => !envelopeMetaKeys.has(k) && x[k] != null);",
    "  if (wrapperKeys.length === 1 && typeof x[wrapperKeys[0]] === \"object\" && !Array.isArray(x[wrapperKeys[0]])) return x[wrapperKeys[0]];",
    "  return x;",
    "};",
    "const listEnvelopeKeys = [\"value\", \"data\", \"results\", \"items\", \"records\", \"rows\", \"entries\", \"list\"];",
    "export const rowsOf = (x: any): any[] => {",
    "  if (Array.isArray(x)) return x;",
    "  if (x == null || typeof x !== \"object\") return [];",
    "  for (const key of listEnvelopeKeys) { if (Array.isArray(x[key])) return x[key]; }",
    "  const u = unwrap(x);",
    "  if (Array.isArray(u)) return u;",
    "  if (u != null && typeof u === \"object\" && u !== x) {",
    "    for (const key of listEnvelopeKeys) { if (Array.isArray((u as any)[key])) return (u as any)[key]; }",
    "  }",
    "  return [];",
    "};",
    "const parts = (name: string) => String(name).replace(/\\[[\"']?([^\"'\\]]+)[\"']?\\]/g, \".$1\").split(\".\").filter(Boolean);",
    "const identityKeys = new Set([\"id\", \"entity\", \"entityId\", \"entityValue\", \"value\"]);",
    "const readKeyDirect = (value: any, key: string) => {",
    "  if ((value == null || typeof value !== \"object\") && identityKeys.has(key)) return value;",
    "  if (isErrorLike(value)) return undefined;",
    "  return value?.tools?.[key] ?? value?.[key] ?? value?.attributes?.[key] ?? value?.record?.[key] ?? value?.record?.attributes?.[key];",
    "};",
    "const readKey = (value: any, key: string) => {",
    "  const direct = readKeyDirect(value, key);",
    "  if (direct != null && !isErrorLike(direct)) return direct;",
    "  const v = unwrap(value);",
    "  return v === value ? undefined : readKeyDirect(v, key);",
    "};",
    "const readPath = (value: any, path: string) => {",
    "  if (String(path).trim() === \"\") return undefined;",
    "  const direct = readKey(value, path);",
    "  if (direct != null) return direct;",
    "  let cur = value;",
    "  for (const part of parts(path)) {",
    "    cur = readKey(cur, part);",
    "    if (cur == null) return undefined;",
    "  }",
    "  return cur;",
    "};",
    "export const g = (row: any, ...choices: any[]) => {",
    "  const last = choices[choices.length - 1];",
    "  const simpleStringDefault = choices.length >= 3 && typeof last === \"string\" && !/[.\\[\\]]/.test(last) ? last : undefined;",
    "  if (choices.length > 1 && choices.every((choice) => typeof choice === \"string\")) {",
    "    let cur = row;",
    "    for (const choice of choices) { cur = readPath(cur, choice); if (cur == null) break; }",
    "    if (cur != null && !isErrorLike(cur)) return cur;",
    "  }",
    "  for (const choice of choices) {",
    "    if (typeof choice !== \"string\") { if (choice != null && !isErrorLike(choice)) return choice; continue; }",
    "    if (choice === \"\") return \"\";",
    "    const value = readPath(row, choice);",
    "    if (value != null && !isErrorLike(value)) return value;",
    "  }",
    "  return simpleStringDefault;",
    "};",
    "export const arr = (x: any, keys: string[] = []) => {",
    "  const v = unwrap(x);",
    "  if (Array.isArray(v)) return v;",
    "  for (const key of [...keys, \"items\", \"results\", \"records\", \"rows\", \"values\", \"data\", \"entries\", \"list\"]) {",
    "    if (Array.isArray(v?.[key])) return v[key];",
    "  }",
    "  return [];",
    "};",
    "export const asArr = (x: any, keys: string[] = []) => arr(x, keys);",
    "export const num = (x: any, d = 0) => {",
    "  const v = typeof x === \"number\" ? x : Number(x?.average ?? x);",
    "  return Number.isFinite(v) ? v : d;",
    "};",
    "export const pickNum = (...xs: any[]) => {",
    "  for (const x of xs) {",
    "    const v = num(x, NaN);",
    "    if (Number.isFinite(v)) return v;",
    "  }",
    "  return 0;",
    "};",
    "export const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;",
    "export const r1 = (x: any, d = 0) => Number(num(x, d).toFixed(1));",
    "export const firstVal = (obj: any, paths: string[] = [], d?: any) => {",
    "  for (const path of paths) {",
    "    const v = g(obj, path);",
    "    if (v != null) return v;",
    "  }",
    "  return d;",
    "};",
    "export const text = (x: any, d = \"\") => {",
    "  const v = typeof x === \"string\" ? x : g(x, \"name\", \"title\", \"label\", \"person.name\", \"character.name\");",
    "  return v == null ? d : String(v);",
    "};",
    "export const writeJson = (file: any, value?: unknown) => value === undefined ? file : writeFile(String(file), JSON.stringify(value), \"utf8\");",
    "",
  ].join("\n");
}

// --- Generic syntax-slip rewriters -----------------------------------------

// AST-based replacement (May 2026). Replaces a prior regex/depth-walk
// implementation that missed mixed `??`/`||` expressions buried inside
// `String(...)` arguments, `.push(...)` arguments, object literal
// properties, ternary branches, array elements, callback bodies, etc.
//
// Strategy: parse the source, walk for every BinaryExpression whose
// operator is `??`/`||`/`&&` and whose left or right child is also a
// BinaryExpression in the OTHER operator family, then wrap that child's
// source range with parentheses. Insertions are applied back-to-front so
// earlier edits don't shift later positions. We do NOT use the TypeScript
// printer — that would reflow the whole file and break downstream regex
// rewriters applied after this pass.
export function rewriteMixedNullishLogicalExpressions(source: string): string {
  const sourceFile = ts.createSourceFile(
    "answer.ts",
    source,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.TS,
  );

  const NULLISH = ts.SyntaxKind.QuestionQuestionToken;
  const LOGICAL_KINDS = new Set<ts.SyntaxKind>([
    ts.SyntaxKind.BarBarToken,
    ts.SyntaxKind.AmpersandAmpersandToken,
  ]);

  type Family = "nullish" | "logical";
  function operatorFamily(node: ts.BinaryExpression): Family | null {
    if (node.operatorToken.kind === NULLISH) return "nullish";
    if (LOGICAL_KINDS.has(node.operatorToken.kind)) return "logical";
    return null;
  }

  const seenRanges = new Set<string>();
  const insertions: Array<{ pos: number; text: string; priority: number }> = [];

  function maybeWrap(child: ts.Node, parentFamily: Family): void {
    if (!ts.isBinaryExpression(child)) return;
    const childFamily = operatorFamily(child);
    if (!childFamily || childFamily === parentFamily) return;
    const key = `${child.getStart(sourceFile)}:${child.getEnd()}`;
    if (seenRanges.has(key)) return;
    seenRanges.add(key);
    insertions.push({ pos: child.getStart(sourceFile), text: "(", priority: 0 });
    insertions.push({ pos: child.getEnd(), text: ")", priority: 1 });
  }

  function walk(node: ts.Node): void {
    if (ts.isBinaryExpression(node)) {
      const family = operatorFamily(node);
      if (family) {
        maybeWrap(node.left, family);
        maybeWrap(node.right, family);
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(sourceFile);

  if (insertions.length === 0) return source;
  insertions.sort((a, b) => (b.pos - a.pos) || (a.priority - b.priority));
  let out = source;
  for (const ins of insertions) {
    out = out.slice(0, ins.pos) + ins.text + out.slice(ins.pos);
  }
  return out;
}

// AST-based rewriter (May 2026, replaces a regex implementation).
// Wraps calls like `(x ?? "").toLowerCase()` in `String(...)` coercion
// and pre-coerces nullish-fallback variable initialisations whose RHS
// ends with `""`. Catches the common agent patterns:
//   (value ?? other ?? "").toLowerCase()
//   const entity = r.intentEntity ?? r.label ?? "";  // then entity.toLowerCase()
// where `value`/`other`/`r.intentEntity` can turn out to be a number
// or boolean — `??` short-circuits before the empty-string fallback,
// and `.toLowerCase()` then throws `TypeError: <x>.toLowerCase is not
// a function`.
export function rewriteUnsafeStringCoercionCalls(source: string): string {
  const sourceFile = ts.createSourceFile(
    "answer.ts",
    source,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.TS,
  );

  // Generic JS string-surface methods commonly called on values that a
  // `??`-chain can leave as a non-string.
  const UNSAFE_METHODS = new Set([
    "toLowerCase", "toUpperCase", "includes", "startsWith", "endsWith",
    "trim", "trimStart", "trimEnd", "slice", "indexOf", "lastIndexOf",
    "split", "replace", "replaceAll", "match", "search",
    "padStart", "padEnd", "repeat", "charAt", "codePointAt", "normalize",
  ]);

  const NULLISH = ts.SyntaxKind.QuestionQuestionToken;

  function containsNullish(node: ts.Node): boolean {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === NULLISH) return true;
    let found = false;
    node.forEachChild((c) => { if (!found) found = containsNullish(c); });
    return found;
  }

  function isStringCall(node: ts.Node): boolean {
    return (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "String"
    );
  }

  function isEmptyStringLiteral(node: ts.Node): boolean {
    return ts.isStringLiteral(node) && node.text === "";
  }

  interface Edit { start: number; end: number; replacement: string }
  const edits: Edit[] = [];
  const seenRanges = new Set<string>();

  function pushEdit(start: number, end: number, replacement: string): void {
    const key = `${start}:${end}`;
    if (seenRanges.has(key)) return;
    seenRanges.add(key);
    edits.push({ start, end, replacement });
  }

  function walk(node: ts.Node): void {
    // Rule 1 — parenthesised receiver:  (X ?? Y).METHOD(...)  →
    // String(X ?? Y).METHOD(...).
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const propAccess = node.expression;
      const method = propAccess.name.text;
      const receiver = propAccess.expression;
      if (
        UNSAFE_METHODS.has(method) &&
        ts.isParenthesizedExpression(receiver) &&
        containsNullish(receiver.expression) &&
        !isStringCall(receiver.expression)
      ) {
        const innerText = receiver.expression.getText(sourceFile);
        pushEdit(
          receiver.getStart(sourceFile),
          receiver.getEnd(),
          `String(${innerText})`,
        );
      }
    }

    // Rule 2 — variable-init coercion:  `const x = a ?? b ?? "";`  →
    // `const x = String(a ?? b ?? "");`.
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        const init = decl.initializer;
        if (!init) continue;
        if (isStringCall(init)) continue;
        if (!ts.isBinaryExpression(init)) continue;
        if (init.operatorToken.kind !== NULLISH) continue;
        if (!isEmptyStringLiteral(init.right)) continue;
        const initText = init.getText(sourceFile);
        pushEdit(
          init.getStart(sourceFile),
          init.getEnd(),
          `String(${initText})`,
        );
      }
    }

    ts.forEachChild(node, walk);
  }
  walk(sourceFile);

  if (edits.length === 0) return source;
  edits.sort((a, b) => b.start - a.start);
  let out = source;
  for (const edit of edits) {
    out = out.slice(0, edit.start) + edit.replacement + out.slice(edit.end);
  }
  return out;
}

// `?.SOME.INDICATOR.SHAPE` (uppercase dotted runs of length >= 3 chained
// off optional-chain access) becomes `?.["SOME.INDICATOR.SHAPE"]`. Catches
// LLM-authored code that uses dotted identifier syntax on bracket-only
// property names.
export function rewriteDottedIndicatorOptionalAccess(source: string): string {
  return source.replace(
    /\?\.([A-Z]{2,}(?:\.[A-Z0-9]{2,}){2,})/g,
    (_match, indicator: string) => `?.[${JSON.stringify(indicator)}]`,
  );
}

// LLMs often write object-shorthand `snake_case_key` when the binding in
// scope is `snakeCaseKey`. This pass discovers camelCase declarations and
// rewrites any object-property shorthand using the snake-case form into
// explicit `snake_case_key: snakeCaseKey` aliases.
export function rewriteSnakeCaseObjectShorthandAliases(source: string): string {
  const declarations = new Set<string>();
  const declarationPattern = /\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of source.matchAll(declarationPattern)) {
    if (match[1]) declarations.add(match[1]);
  }
  const aliases = new Map<string, string>();
  for (const declaration of declarations) {
    const snake = declaration.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    if (snake !== declaration && !declarations.has(snake)) {
      aliases.set(snake, declaration);
    }
  }
  if (aliases.size === 0) return source;
  return source
    .split("\n")
    .map((line) => {
      const lineMatch = /^(\s*)([A-Za-z_$][\w$]*)(\s*,\s*)$/.exec(line);
      if (lineMatch && aliases.has(lineMatch[2]!)) {
        return `${lineMatch[1]}${lineMatch[2]}: ${aliases.get(lineMatch[2]!)},`;
      }
      return line.replace(
        /([,{]\s*)([A-Za-z_$][\w$]*)(\s*[,}])/g,
        (match, prefix: string, identifier: string, suffix: string) =>
          aliases.has(identifier)
            ? `${prefix}${identifier}: ${aliases.get(identifier)}${suffix}`
            : match,
      );
    })
    .join("\n");
}

// The universal, harness-agnostic syntax-fix pipeline. Order matters:
// the two leading regex normalisations strip simple typos that confuse
// the AST parser; the AST passes then operate on a cleaner source tree.
//
// Idempotent: running this twice yields the same output as running it
// once (the AST passes detect already-coerced/already-parenthesised
// nodes and skip them).
export function applyGenericSyntaxFixes(source: string): string {
  let out = source
    .replace(/\)\s*\.\s*\[/g, ")[")
    .replace(/\bconst\s+\(\s*([A-Za-z_$][\w$]*)\s*:\s*([^)]+?)\s*\)\s*=/g, "const $1: $2 =");
  out = rewriteDottedIndicatorOptionalAccess(out);
  out = rewriteMixedNullishLogicalExpressions(out);
  out = rewriteSnakeCaseObjectShorthandAliases(out);
  out = rewriteUnsafeStringCoercionCalls(out);
  return out;
}
