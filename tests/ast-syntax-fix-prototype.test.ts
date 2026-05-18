// Regression suite for `rewriteMixedNullishLogicalExpressions` in
// `src/eval/skillcraftFullDatafetch.ts`. Validates the AST-based
// rewriter against the two observed P1 failures plus a battery of
// nested placements (call args, object literals, ternaries, callback
// returns, array elements). Each case is verified by piping the
// rewritten source through esbuild.transformSync and asserting it
// compiles without a TransformError.
//
// History: this file started as a research prototype comparing a
// proposed AST rewriter against the prior regex implementation. After
// the AST swap landed, the regex was removed and the test was
// retained as the regression surface for the production rewriter.
// The 11 positive cases here cover patterns the prior regex missed in
// production (random-user-database/m2, recipe-cookbook-builder/e3)
// plus the next-most-likely miss classes that Codex flagged.

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

import { rewriteMixedNullishLogicalExpressions } from "../src/eval/skillcraftFullDatafetch.js";

// esbuild is a transitive dep of vitest. Resolve it relative to this
// test file so the regression surface stays portable across worktrees.
const here = path.dirname(fileURLToPath(import.meta.url));
const requireRel = createRequire(import.meta.url);
const esbuildModulePath = path.resolve(
  here,
  "../node_modules/.pnpm/esbuild@0.27.7/node_modules/esbuild",
);
const { transformSync } = requireRel(esbuildModulePath) as {
  transformSync: (src: string, opts: Record<string, unknown>) => unknown;
};

function compilesCleanly(source: string): { ok: true } | { ok: false; error: string } {
  try {
    transformSync(source, { loader: "ts", format: "esm", target: "es2022" });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e).split("\n")[0] };
  }
}

interface TestCase {
  name: string;
  source: string;
  // Whether the raw source is expected to FAIL esbuild (bug-present).
  // If false, this is a negative-case regression guard — must compile
  // raw AND stay compile-clean after the rewriter (idempotent).
  expectRawFail: boolean;
}

const CASES: TestCase[] = [
  // The two observed P1 failures (extracted from the failing prepared-answer.ts files).
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

  // Nested placements Codex flagged as next-likely misses for the prior regex.
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
  {
    name: "top-level-1: mixed at top of `const` assignment",
    source: `
const a = null;
const b = "";
const c = "fallback";
const out = a || b ?? c;
`,
    expectRawFail: true,
  },
  {
    name: "top-level-2: mixed at top of `return`",
    source: `
function pick(a: unknown, b: unknown, c: string): string {
  return a as any ?? b as any || c;
}
`,
    expectRawFail: true,
  },

  // Negative cases — already valid TypeScript, must pass through cleanly.
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

describe("rewriteMixedNullishLogicalExpressions (AST) — regression suite", () => {
  for (const tc of CASES) {
    it(`[case] ${tc.name}`, () => {
      const raw = compilesCleanly(tc.source);
      if (tc.expectRawFail) {
        expect(raw.ok, `raw source unexpectedly compiled: ${tc.name}`).toBe(false);
      } else {
        expect(raw.ok, `negative case should compile raw: ${JSON.stringify(raw)}`).toBe(true);
      }

      const rewritten = rewriteMixedNullishLogicalExpressions(tc.source);
      const after = compilesCleanly(rewritten);
      expect(after.ok, `rewriter failed to fix: ${JSON.stringify(after)}`).toBe(true);

      if (!tc.expectRawFail) {
        // Negative cases must be idempotent — no spurious paren noise.
        expect(rewritten, "negative case must pass through unchanged").toBe(tc.source);
      }
    });
  }
});
