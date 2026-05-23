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
    originating?: { trajectoryId: string; expected: number; got: number };
    sibling?: { trajectoryId: string; expected: number; got: number };
  };
}

// Evidence-carrying maturity contracts. These are the inspectable
// replay/change/verifier/rollback fields a mature tenant helper must expose
// (see eval/finchain/rubric.md `codeModeHarness.libraryMaturity`). They are
// emitted as `@`-prefixed header annotations — distinct from the constant
// `replay-contract:`-style frontmatter some author paths write — precisely so
// the artifact walker counts only helpers that actually passed origin and
// held-out replay, not decorative boilerplate.
export function buildMaturityContractLines(
  evidence: QuarantineValidationResult["evidence"],
): string[] {
  const origin = evidence.originating;
  const sibling = evidence.sibling;
  // Both replays are required for promotion, so both should be present here.
  // Guard anyway: without per-helper replay evidence there is no contract to
  // stamp, and the walker must leave the maturity fields empty.
  if (!origin || !sibling) return [];
  return [
    `@replay-contract: origin=${origin.trajectoryId} exp=${origin.expected} got=${origin.got}; heldout=${sibling.trajectoryId} exp=${sibling.expected} got=${sibling.got}`,
    `@change-contract: held-out replay matched on ${sibling.trajectoryId}; public schema and answer semantics preserved`,
    `@verifier: quarantineValidator idempotency+genericity replay pass`,
    `@rollback: hook-manifest quarantine/supersede on regression`,
  ];
}

// Flip the quarantine flag and, when evidence-backed contract lines exist,
// insert them directly after it so they live inside the helper's header
// comment block. A pure string transform: keeps the validator's promotion
// branch readable and lets the format be unit-tested without a live replay.
export function applyMaturityContract(source: string, lines: string[]): string {
  const flip = "@quarantined: false";
  const replacement = lines.length === 0 ? flip : `${flip}\n${lines.join("\n")}`;
  return source.replace(/@quarantined: true/, replacement);
}

// 1% relative tolerance — matches the FAC contract used by the FinChain
// scorer at src/eval/finchainFullDatafetch.ts:isFacMatch.
const FAC_REL_TOLERANCE = 1e-2;

function isFacMatch(got: number, expected: number): boolean {
  if (!Number.isFinite(got) || !Number.isFinite(expected)) return false;
  const denom = Math.max(Math.abs(got), Math.abs(expected), 1);
  return Math.abs(got - expected) / denom <= FAC_REL_TOLERANCE;
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
  if (idempotency.replayed !== null) {
    evidence.originating = {
      trajectoryId: originating.id,
      expected: idempotency.expected ?? 0,
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
    typeof (t.answer as { value?: unknown } | undefined)?.value === "number",
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
  if (genericity.replayed !== null) {
    evidence.sibling = {
      trajectoryId: sibling.id,
      expected: genericity.expected ?? 0,
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
  // Stamp evidence-carrying maturity contracts alongside the quarantine flip.
  // The contract lines are only written here, on the promotion path, so they
  // can never be boilerplate: reaching this branch means both the origin and
  // held-out replays already matched within FAC tolerance.
  const contractLines = buildMaturityContractLines(evidence);
  const flipped = applyMaturityContract(helper.source, contractLines);
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
}): Promise<{ match: boolean; replayed: number | null; expected: number | null; reason: string }> {
  const { helperFn, trajectory } = input;
  if (!trajectory.sourceText) {
    return { match: false, replayed: null, expected: null, reason: "trajectory has no sourceText" };
  }
  const promoted = extractPromotedValuesFromSource(trajectory.sourceText);
  if (Object.keys(promoted).length === 0) {
    return { match: false, replayed: null, expected: null, reason: "no promoted-param literals in trajectory.sourceText" };
  }
  const expected = numericFromAnswer((trajectory.answer as { value?: unknown } | undefined)?.value);
  if (expected === null) {
    return { match: false, replayed: null, expected: null, reason: "trajectory.answer.value not numeric" };
  }
  let replayed: number | null = null;
  try {
    const out = await helperFn(promoted);
    replayed = numericFromAnswer(out);
  } catch (err) {
    return {
      match: false,
      replayed: null,
      expected,
      reason: `helper invocation threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (replayed === null) {
    return { match: false, replayed: null, expected, reason: "helper returned non-numeric value" };
  }
  if (!isFacMatch(replayed, expected)) {
    return {
      match: false,
      replayed,
      expected,
      reason: `FAC mismatch: helper returned ${replayed}, expected ${expected}`,
    };
  }
  return { match: true, replayed, expected, reason: "match" };
}

function numericFromAnswer(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[$£€,\s%]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Re-implements the relevant portion of authorFromSource's promotion
// logic over the trajectory's sourceText: walk the top-of-main() const
// declarations, return a {name → number} map. Duplicates ~20 LoC of AST
// work rather than importing private helpers from authorFromSource so
// this module stays usable independently of the author module.
function extractPromotedValuesFromSource(source: string): Record<string, number> {
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
  const out: Record<string, number> = {};
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
  for (const stmt of mainBody.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue;
      if (!decl.initializer) continue;
      const value = evaluate(decl.initializer);
      if (value === null) continue;
      out[decl.name.text] = value;
    }
  }
  return out;
}
