// Prototype validation of an AST-locate-then-range-patch approach to
// fixing agent-generated TypeScript mixed `??` / `||` / `&&` patterns
// that esbuild rejects. Compares the current regex rewriter against an
// AST-based prototype across the two observed P1 failures and a set of
// nested-placement cases (call args, object literals, ternaries,
// callback returns, array elements). Each case is validated by piping
// the rewritten source through esbuild.transformSync; "fixed" means
// esbuild compiles without a TransformError.
//
// This is a research test — it's NOT wired into the substrate. The
// goal is to answer: does the AST approach actually catch the patterns
// the regex misses, without introducing regressions on patterns the
// regex handles?

import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";
import * as ts from "typescript";

import { rewriteMixedNullishLogicalExpressions } from "../src/eval/skillcraftFullDatafetch.js";

// esbuild is a transitive dep of vitest, not a direct one. Pull it via
// createRequire so the test stays self-contained without changing
// package.json.
const requireRel = createRequire(import.meta.url);
const { transformSync } = requireRel(
  "/Users/jayfarei/src/tries/2026-05-01-hackathon-p1/node_modules/.pnpm/esbuild@0.27.7/node_modules/esbuild",
) as { transformSync: (src: string, opts: Record<string, unknown>) => unknown };

// ----------------------------------------------------------------------
// AST-locate prototype
// ----------------------------------------------------------------------

interface Insertion {
  pos: number;
  text: string;
  priority: number; // lower = applied first when at same position
}

/**
 * Walk the TS AST. For every BinaryExpression whose operator is `??`,
 * `||`, or `&&`, if its left or right child is a BinaryExpression with
 * the OTHER operator family, record a range to wrap that child with
 * parentheses. We trust the parser's recovered grouping as the
 * deterministic policy (per Codex's note).
 *
 * Returns the rewritten source with parens inserted back-to-front so
 * earlier edits don't shift later positions.
 */
function astRewriteMixedNullishLogical(source: string): string {
  const sourceFile = ts.createSourceFile(
    "answer.ts",
    source,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    ts.ScriptKind.TS,
  );

  const NULLISH = ts.SyntaxKind.QuestionQuestionToken;
  const LOGICAL = new Set([
    ts.SyntaxKind.BarBarToken,
    ts.SyntaxKind.AmpersandAmpersandToken,
  ]);

  const wrapRanges = new Set<string>(); // "start:end" dedup
  const insertions: Insertion[] = [];

  function isNullishOrLogical(node: ts.BinaryExpression): boolean {
    return (
      node.operatorToken.kind === NULLISH || LOGICAL.has(node.operatorToken.kind)
    );
  }

  function operatorClass(node: ts.BinaryExpression): "nullish" | "logical" | null {
    if (node.operatorToken.kind === NULLISH) return "nullish";
    if (LOGICAL.has(node.operatorToken.kind)) return "logical";
    return null;
  }

  function maybeRecord(child: ts.Node, parentClass: "nullish" | "logical"): void {
    if (!ts.isBinaryExpression(child)) return;
    const childClass = operatorClass(child);
    if (!childClass) return;
    if (childClass === parentClass) return;
    // If the child is already parenthesised, we'd be wrapping an already-
    // wrapped expression — that's a no-op semantically but inserts noise.
    // The parser unwraps ParenthesizedExpression so we'd actually never
    // see one here as a direct child; the ParenthesizedExpression node
    // sits between parent and child. Only act on direct BinaryExpression
    // children.
    const key = `${child.getStart(sourceFile)}:${child.getEnd()}`;
    if (wrapRanges.has(key)) return;
    wrapRanges.add(key);
    insertions.push({ pos: child.getStart(sourceFile), text: "(", priority: 0 });
    insertions.push({ pos: child.getEnd(), text: ")", priority: 1 });
  }

  function walk(node: ts.Node): void {
    if (ts.isBinaryExpression(node)) {
      const parentClass = operatorClass(node);
      if (parentClass) {
        maybeRecord(node.left, parentClass);
        maybeRecord(node.right, parentClass);
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

// ----------------------------------------------------------------------
// esbuild compilation oracle
// ----------------------------------------------------------------------

function compilesCleanly(source: string): { ok: true } | { ok: false; error: string } {
  try {
    transformSync(source, { loader: "ts", format: "esm", target: "es2022" });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e).split("\n")[0] };
  }
}

// ----------------------------------------------------------------------
// Test cases
// ----------------------------------------------------------------------

interface TestCase {
  name: string;
  source: string;
  // Whether the raw source is expected to FAIL esbuild (bug-present).
  // If false, this is a regression-guard case (must stay valid through
  // both rewriters).
  expectRawFail: boolean;
}

const CASES: TestCase[] = [
  // The two observed P1 failures (from the failing prepared-answer.ts files).
  {
    name: "observed-1: random-user-database/m2 (mixed inside String() call)",
    source: `
const u = {} as any;
const meta = { name: "" };
const name = u?.name ?? {};
const full_name = String([name.first ?? u?.first_name, name.last ?? u?.last_name].filter(Boolean).join(" ") || u?.full_name ?? "");
const gender = String(u?.gender ?? "");
`,
    expectRawFail: true,
  },
  {
    name: "observed-2: recipe-cookbook-builder/e3 (mixed inside .push() arg)",
    source: `
const cuisinesList: string[] = [];
const cuisine = "" as string;
const dishNames: Record<string, string> = {};
const row = { entityValue: "x" } as { entityValue: string };
cuisinesList.push(cuisine || dishNames[row.entityValue as string]?.split(" ").pop() ?? "");
`,
    expectRawFail: true,
  },

  // Nested placement variants that Codex flagged as next-likely misses.
  {
    name: "nested-1: mixed inside object literal property value",
    source: `
const a = null;
const b = "";
const c = "fallback";
const obj = { key: a || b ?? c };
`,
    expectRawFail: true,
  },
  {
    name: "nested-2: mixed inside ternary branch",
    source: `
const cond = true;
const a = null;
const b: string | null = null;
const c = "fallback";
const out = cond ? (a ?? b ?? c) : a || b ?? c;
`,
    expectRawFail: true,
  },
  {
    name: "nested-3: mixed inside array element",
    source: `
const a = null;
const b = "";
const c = "fallback";
const arr = [1, a || b ?? c, 3];
`,
    expectRawFail: true,
  },
  {
    name: "nested-4: mixed inside callback return (arrow expression body)",
    source: `
const items = [{ x: null }, { x: "y" }];
const out = items.map((it) => it.x ?? "" || "fallback");
`,
    expectRawFail: true,
  },
  {
    name: "nested-5: mixed inside function call arg, multiple args",
    source: `
declare function f(a: unknown, b: unknown): string;
const x: string | null = null;
const y = "fallback";
const r = f(x ?? "" || y, "second");
`,
    expectRawFail: true,
  },
  {
    name: "nested-6: mixed deeply nested (inside object inside call)",
    source: `
declare function fn(p: { name: string }): void;
const a: string | null = null;
const b = "";
fn({ name: a || b ?? "default" });
`,
    expectRawFail: true,
  },
  {
    name: "nested-7: chained .map() with mixed inside lambda body",
    source: `
const xs = [{ a: null as string | null, b: "" }];
const out = xs.map((x) => String(x.a ?? "" || x.b));
`,
    expectRawFail: true,
  },

  // Cases the current regex rewriter ALREADY handles — must stay clean
  // through the AST approach (no regressions).
  {
    name: "guard-1: mixed at top-level of `const` assignment (regex covers)",
    source: `
const a = null;
const b = "";
const c = "fallback";
const out = a || b ?? c;
`,
    expectRawFail: true,
  },
  {
    name: "guard-2: mixed at top-level of `return` (regex covers)",
    source: `
function pick(a: unknown, b: unknown, c: string): string {
  return a as any ?? b as any || c;
}
`,
    expectRawFail: true,
  },

  // Negative cases — already valid TypeScript, must pass through unchanged-in-spirit.
  {
    name: "negative-1: already parenthesised, no rewrite needed",
    source: `
const a = null, b = "", c = "fallback";
const out = (a ?? b) || c;
`,
    expectRawFail: false,
  },
  {
    name: "negative-2: pure ?? chain, no mix",
    source: `
const a = null, b: string | null = null, c = "fallback";
const out = a ?? b ?? c;
`,
    expectRawFail: false,
  },
  {
    name: "negative-3: pure || chain, no mix",
    source: `
const a = "", b = "", c = "fallback";
const out = a || b || c;
`,
    expectRawFail: false,
  },
];

// ----------------------------------------------------------------------
// Vitest specs
// ----------------------------------------------------------------------

describe("AST-vs-regex syntax-fix prototype", () => {
  for (const tc of CASES) {
    it(`[case] ${tc.name}`, () => {
      const raw = compilesCleanly(tc.source);
      if (tc.expectRawFail) {
        expect(raw.ok, `raw source unexpectedly compiled: ${tc.name}`).toBe(false);
      } else {
        expect(raw.ok, `negative case should compile raw: ${JSON.stringify(raw)}`).toBe(true);
      }

      const regexFixed = compilesCleanly(rewriteMixedNullishLogicalExpressions(tc.source));
      const astFixed = compilesCleanly(astRewriteMixedNullishLogical(tc.source));

      // For positive cases we report the per-rewriter outcome; the AST
      // approach MUST compile. The regex approach is informational —
      // we want to characterise which cases it currently misses.
      if (tc.expectRawFail) {
        expect(astFixed.ok, `AST rewriter failed: ${JSON.stringify(astFixed)}`).toBe(true);
      } else {
        // Negative cases: both rewriters must preserve compilability.
        expect(regexFixed.ok, `regex rewriter broke a valid case: ${JSON.stringify(regexFixed)}`).toBe(true);
        expect(astFixed.ok, `AST rewriter broke a valid case: ${JSON.stringify(astFixed)}`).toBe(true);
      }
    });
  }

  it("[summary] regex vs AST coverage across all positive cases", () => {
    const rows: Array<{ name: string; raw: string; regex: string; ast: string }> = [];
    for (const tc of CASES) {
      if (!tc.expectRawFail) continue;
      const raw = compilesCleanly(tc.source);
      const regex = compilesCleanly(rewriteMixedNullishLogicalExpressions(tc.source));
      const ast = compilesCleanly(astRewriteMixedNullishLogical(tc.source));
      rows.push({
        name: tc.name,
        raw: raw.ok ? "PASS" : "fail",
        regex: regex.ok ? "FIXED" : "miss",
        ast: ast.ok ? "FIXED" : "miss",
      });
    }
    const lines = rows.map((r) => `  ${r.regex.padEnd(7)} ${r.ast.padEnd(7)} ${r.name}`);
    const banner = "  REGEX   AST     case";
    console.log("\n[ast-syntax-fix-prototype] coverage summary:\n" + banner + "\n" + lines.join("\n"));
    // Sanity: across the positive cases, AST must FIX more or equal cases than regex.
    const regexFixed = rows.filter((r) => r.regex === "FIXED").length;
    const astFixed = rows.filter((r) => r.ast === "FIXED").length;
    expect(astFixed, `AST fixed ${astFixed}; regex fixed ${regexFixed}`).toBeGreaterThanOrEqual(regexFixed);
  });
});
