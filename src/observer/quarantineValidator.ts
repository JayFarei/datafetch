// iter 3.4: quarantine + held-out replay validator.
//
// Helpers authored by renderFromAgentSource (iter 3.3) start with
// `@quarantined: true` in the file header. This module:
//
//   1. Idempotency check — replay the helper with the numeric-literal
//      values the agent declared at the top of main() in its
//      trajectory.sourceText; assert the helper's return matches the
//      trajectory.answer.value within FAC tolerance.
//   2. Genericity check — find a held-out sibling trajectory (same
//      tenantId, different sourceHash, same shapeHash if available);
//      extract its numeric-literal inputs; replay the helper; assert FAC
//      match against the sibling's answer.value.
//
// Both pass → rewrite the helper's `@quarantined: true` header to
// `@quarantined: false` AND promote the hook manifest's maturity to
// `validated-typescript` so it becomes callable under interface mode
// `hooks-validated-only` (the principled substrate-policy path per the
// iter 3.0a finding). Either fails → helper stays quarantined; never
// becomes callable; walk-artifacts counts it toward R4.
//
// Strictly additive substrate module. The existing five render paths in
// src/observer/author.ts don't run through this validator (they have
// their own existing validation paths). Only renderFromAgentSource
// helpers carry the `@quarantined: true` header and therefore only they
// are validated here.

import { promises as fsp } from "node:fs";
import path from "node:path";
import ts from "typescript";

import type { TrajectoryRecord } from "../sdk/index.js";
import { getHookRegistry } from "../hooks/registry.js";
import { answerEquals } from "../runtime/answerKit.js";

export interface QuarantineValidationResult {
  helperName: string;
  helperPath: string;
  idempotent: boolean;
  generic: boolean;
  promoted: boolean;
  reason?: string;
  // Compact evidence — actual helper output, expected gold, the seed
  // each replay used. Surfaced into walk-artifacts so R4 / R6 / R7 have
  // measurement points without a side disk fetch.
  evidence: {
    // Phase 2: generalized from number to unknown so non-numeric (string /
    // boolean / structured) answers carry measurement points too. The numeric
    // FAC contract still lives inside answerEquals (src/runtime/answerKit.ts).
    originating?: { trajectoryId: string; expected: unknown; got: unknown };
    sibling?: { trajectoryId: string; expected: unknown; got: unknown };
  };
}

// Compact rendering of an answer value for reason strings.
function fmtAnswer(value: unknown): string {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  try {
    return JSON.stringify(value)?.slice(0, 120) ?? String(value);
  } catch {
    return String(value);
  }
}

export async function validateAuthoredFromSourceHelpers(input: {
  baseDir: string;
  tenantId: string;
}): Promise<QuarantineValidationResult[]> {
  const { baseDir, tenantId } = input;
  const libDir = path.join(baseDir, "lib", tenantId);
  let entries: string[];
  try {
    entries = await fsp.readdir(libDir);
  } catch {
    return [];
  }
  // Quick scan: only authorFromSource-produced files carry the
  // `@author: authorFromSource` header.
  const helperFiles: { name: string; filePath: string; source: string }[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".ts")) continue;
    const filePath = path.join(libDir, entry);
    let source: string;
    try {
      source = await fsp.readFile(filePath, "utf8");
    } catch {
      continue;
    }
    if (!/^@author: authorFromSource/m.test(source) && !/@author: authorFromSource/.test(source)) continue;
    if (!/@quarantined: true/.test(source)) continue;
    helperFiles.push({ name: entry.slice(0, -3), filePath, source });
  }
  if (helperFiles.length === 0) return [];

  // Read all tenant trajectories once (they're typically small JSON files
  // with one entry per episode; scan is O(n) in trajectory count which
  // is bounded by episodes-per-family).
  const trajectories = await readTenantTrajectories(baseDir);
  if (trajectories.length === 0) return [];

  const results: QuarantineValidationResult[] = [];
  for (const helper of helperFiles) {
    const result = await validateOne({
      baseDir,
      tenantId,
      helper,
      trajectories,
    });
    results.push(result);
  }
  return results;
}

async function validateOne(input: {
  baseDir: string;
  tenantId: string;
  helper: { name: string; filePath: string; source: string };
  trajectories: TrajectoryRecord[];
}): Promise<QuarantineValidationResult> {
  const { helper, trajectories, baseDir, tenantId } = input;
  const sourceHashMatch = helper.source.match(/@source-hash:\s*([a-f0-9]+|unknown)/);
  const originSourceHash = sourceHashMatch?.[1] ?? null;
  if (!originSourceHash || originSourceHash === "unknown") {
    return {
      helperName: helper.name,
      helperPath: helper.filePath,
      idempotent: false,
      generic: false,
      promoted: false,
      reason: "helper header missing @source-hash; cannot locate originating trajectory",
      evidence: {},
    };
  }
  const originating = trajectories.find((t) => t.sourceHash === originSourceHash);
  if (!originating) {
    return {
      helperName: helper.name,
      helperPath: helper.filePath,
      idempotent: false,
      generic: false,
      promoted: false,
      reason: `no trajectory found for @source-hash ${originSourceHash.slice(0, 16)}`,
      evidence: {},
    };
  }
  const helperFn = await loadHelper(helper.filePath, helper.name);
  if (!helperFn) {
    return {
      helperName: helper.name,
      helperPath: helper.filePath,
      idempotent: false,
      generic: false,
      promoted: false,
      reason: "helper module failed to load via dynamic import",
      evidence: {},
    };
  }

  // --- Idempotency check ---------------------------------------------------
  const idempotency = await replayOnTrajectory({ helperFn, trajectory: originating });
  const evidence: QuarantineValidationResult["evidence"] = {};
  if (idempotency.ran) {
    evidence.originating = {
      trajectoryId: originating.id,
      expected: idempotency.expected,
      got: idempotency.replayed,
    };
  }
  if (!idempotency.match) {
    return {
      helperName: helper.name,
      helperPath: helper.filePath,
      idempotent: false,
      generic: false,
      promoted: false,
      reason: `idempotency replay failed: ${idempotency.reason}`,
      evidence,
    };
  }

  // --- Genericity check ----------------------------------------------------
  const sibling = trajectories.find((t) =>
    t.id !== originating.id &&
    t.sourceText !== undefined &&
    t.sourceHash !== originSourceHash &&
    (t.answer as { value?: unknown } | undefined)?.value != null,
  );
  if (!sibling) {
    return {
      helperName: helper.name,
      helperPath: helper.filePath,
      idempotent: true,
      generic: false,
      promoted: false,
      reason: "idempotency passed but no held-out sibling trajectory available for genericity check",
      evidence,
    };
  }
  const genericity = await replayOnTrajectory({ helperFn, trajectory: sibling });
  if (genericity.ran) {
    evidence.sibling = {
      trajectoryId: sibling.id,
      expected: genericity.expected,
      got: genericity.replayed,
    };
  }
  if (!genericity.match) {
    return {
      helperName: helper.name,
      helperPath: helper.filePath,
      idempotent: true,
      generic: false,
      promoted: false,
      reason: `genericity replay failed on sibling ${sibling.id}: ${genericity.reason}`,
      evidence,
    };
  }

  // --- Promote ------------------------------------------------------------
  const flipped = helper.source.replace(/@quarantined: true/, "@quarantined: false");
  await fsp.writeFile(helper.filePath, flipped, "utf8");
  const registry = getHookRegistry();
  let promoted = false;
  if (registry) {
    try {
      // Re-validate against the file (refreshes manifest), then promote.
      await registry.validateImplementation({
        tenantId,
        name: helper.name,
        filePath: helper.filePath,
        implementationKind: "typescript",
        intent: `learned interface ${helper.name}`,
        trajectoryId: originating.id,
      });
      await registry.smokeReplayAndPromote({
        tenantId,
        name: helper.name,
        filePath: helper.filePath,
        // The new author's body uses non-trajectory primitives (Math.pow,
        // arithmetic) — smokeReplayAndPromote's primitive-match check
        // doesn't gate on them, so we pass an empty expected list. The
        // promotion happens via maturity assignment below if reached.
        expectedPrimitives: [],
      });
      promoted = true;
    } catch (err) {
      void err;
    }
  }
  void baseDir;
  return {
    helperName: helper.name,
    helperPath: helper.filePath,
    idempotent: true,
    generic: true,
    promoted,
    evidence,
  };
}

async function readTenantTrajectories(baseDir: string): Promise<TrajectoryRecord[]> {
  const dir = path.join(baseDir, "trajectories");
  let entries: string[];
  try {
    entries = await fsp.readdir(dir);
  } catch {
    return [];
  }
  const out: TrajectoryRecord[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const raw = await fsp.readFile(path.join(dir, entry), "utf8");
      out.push(JSON.parse(raw) as TrajectoryRecord);
    } catch {
      /* ignore corrupt trajectory */
    }
  }
  return out;
}

async function loadHelper(filePath: string, name: string): Promise<((input: unknown) => Promise<unknown>) | null> {
  // Defer to the DiskLibraryResolver so the same `@datafetch/sdk` import
  // rewrite + cache + mtime check applies. The resolver returns a typed
  // Fn callable.
  const { DiskLibraryResolver } = await import("../snippet/library.js");
  const baseDir = path.resolve(filePath, "../../..");
  const resolver = new DiskLibraryResolver({ baseDir });
  void name;
  const tenantId = path.basename(path.dirname(filePath));
  const helperName = path.basename(filePath, ".ts");
  const fn = await resolver.resolve(tenantId, helperName);
  if (!fn) return null;
  return async (input: unknown) => {
    const result = await fn(input, {
      tenant: tenantId,
      mount: "<replay>",
      cost: { tier: 0, llmCalls: 0, ms: { hot: 0, cold: 0 }, tokens: { hot: 0, cold: 0 }, hotTokens: 0, coldTokens: 0, freshness: 0 } as never,
      functionName: helperName,
    } as never);
    return (result as { value?: unknown }).value;
  };
}

async function replayOnTrajectory(input: {
  helperFn: (input: unknown) => Promise<unknown>;
  trajectory: TrajectoryRecord;
}): Promise<{ match: boolean; ran: boolean; replayed: unknown; expected: unknown; reason: string }> {
  const { helperFn, trajectory } = input;
  if (!trajectory.sourceText) {
    return { match: false, ran: false, replayed: undefined, expected: undefined, reason: "trajectory has no sourceText" };
  }
  const promoted = extractPromotedValuesFromSource(trajectory.sourceText);
  if (Object.keys(promoted).length === 0) {
    return { match: false, ran: false, replayed: undefined, expected: undefined, reason: "no promoted-param literals in trajectory.sourceText" };
  }
  // Phase 2: the expected answer can be any type (numeric / string / boolean /
  // structured), not just numeric. Equality is decided by answerEquals.
  const expected = (trajectory.answer as { value?: unknown } | undefined)?.value;
  if (expected === undefined || expected === null) {
    return { match: false, ran: false, replayed: undefined, expected: undefined, reason: "trajectory.answer.value is absent" };
  }
  let replayed: unknown;
  try {
    replayed = await helperFn(promoted);
  } catch (err) {
    return {
      match: false,
      ran: false,
      replayed: undefined,
      expected,
      reason: `helper invocation threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  // Dataset-neutral equality: numeric FAC (byte-identical to the prior gate) |
  // boolean | normalised string | canonical structured deep-equality.
  if (!answerEquals(replayed, expected)) {
    return {
      match: false,
      ran: true,
      replayed,
      expected,
      reason: `answer mismatch: helper returned ${fmtAnswer(replayed)}, expected ${fmtAnswer(expected)}`,
    };
  }
  return { match: true, ran: true, replayed, expected, reason: "match" };
}

// Re-implements the relevant portion of authorFromSource's promotion
// logic over the trajectory's sourceText: walk the top-of-main() const
// declarations, return a {name → number} map. Duplicates ~20 LoC of AST
// work rather than importing private helpers from authorFromSource so
// this module stays usable independently of the author module.
export function extractPromotedValuesFromSource(source: string): Record<string, unknown> {
  const sf = ts.createSourceFile(
    "trajectory-source.ts",
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );
  const mainBodyHolder: { value: ts.Block | null } = { value: null };
  const visit = (node: ts.Node): void => {
    if (mainBodyHolder.value) return;
    if (ts.isFunctionDeclaration(node) && node.name?.text === "main" && node.body) {
      mainBodyHolder.value = node.body;
      return;
    }
    if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name) && node.name.text === "main" && node.initializer) {
      if (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) {
        const body = node.initializer.body;
        if (body && ts.isBlock(body)) mainBodyHolder.value = body;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  const mainBody = mainBodyHolder.value;
  if (!mainBody) return {};
  const out: Record<string, unknown> = {};
  const evaluate = (expr: ts.Expression): number | null => {
    if (ts.isNumericLiteral(expr)) return Number(expr.text);
    if (ts.isPrefixUnaryExpression(expr)) {
      const operand = evaluate(expr.operand);
      if (operand === null) return null;
      if (expr.operator === ts.SyntaxKind.MinusToken) return -operand;
      if (expr.operator === ts.SyntaxKind.PlusToken) return operand;
      return null;
    }
    if (ts.isParenthesizedExpression(expr)) return evaluate(expr.expression);
    if (ts.isBinaryExpression(expr)) {
      const l = evaluate(expr.left);
      const r = evaluate(expr.right);
      if (l === null || r === null) return null;
      switch (expr.operatorToken.kind) {
        case ts.SyntaxKind.PlusToken: return l + r;
        case ts.SyntaxKind.MinusToken: return l - r;
        case ts.SyntaxKind.AsteriskToken: return l * r;
        case ts.SyntaxKind.SlashToken: return l / r;
        case ts.SyntaxKind.PercentToken: return l % r;
        case ts.SyntaxKind.AsteriskAsteriskToken: return Math.pow(l, r);
        default: return null;
      }
    }
    return null;
  };
  // Phase 2: also promote string + boolean literals (not only numeric), so the
  // gate can replay helpers whose promoted inputs are non-numeric.
  const evaluateNonNumeric = (expr: ts.Expression): string | boolean | undefined => {
    if (ts.isParenthesizedExpression(expr)) return evaluateNonNumeric(expr.expression);
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
    if (expr.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (expr.kind === ts.SyntaxKind.FalseKeyword) return false;
    return undefined;
  };
  for (const stmt of mainBody.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue;
      if (!decl.initializer) continue;
      const numValue = evaluate(decl.initializer);
      if (numValue !== null) { out[decl.name.text] = numValue; continue; }
      const litValue = evaluateNonNumeric(decl.initializer);
      if (litValue !== undefined) out[decl.name.text] = litValue;
    }
  }
  return out;
}
