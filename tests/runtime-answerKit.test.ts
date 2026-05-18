// Non-SkillCraft fixture coverage for src/runtime/answerKit.ts.
//
// The SkillCraft planner tests already exercise these rewriters against
// SkillCraft-shaped sources. This file proves the same rewriters work on
// non-SkillCraft surfaces (GitHub REST style, OpenLibrary style, generic
// JS) so a future dataset eval can rely on them without needing the
// SkillCraft harness to be in scope.

import { describe, it, expect } from "vitest";

import {
  ANSWER_KIT_HELPERS,
  applyGenericSyntaxFixes,
  renderAnswerKitSource,
  rewriteDottedIndicatorOptionalAccess,
  rewriteMixedNullishLogicalExpressions,
  rewriteSnakeCaseObjectShorthandAliases,
  rewriteUnsafeStringCoercionCalls,
} from "../src/runtime/answerKit.js";

describe("rewriteMixedNullishLogicalExpressions — non-SkillCraft shapes", () => {
  it("parenthesises ?? inside a String() call (GitHub-style payload guard)", () => {
    const source = `const title = String(repo.full_name ?? repo.name || "unknown");`;
    const out = rewriteMixedNullishLogicalExpressions(source);
    expect(out).toContain(`(repo.full_name ?? repo.name) || "unknown"`);
  });

  it("parenthesises ?? in array.push argument (OpenLibrary-style multi-result merge)", () => {
    const source = `results.push(doc.first_publish_year ?? doc.publish_year || 0);`;
    const out = rewriteMixedNullishLogicalExpressions(source);
    expect(out).toContain(`(doc.first_publish_year ?? doc.publish_year) || 0`);
  });

  it("no-op on already-parenthesised input (idempotency)", () => {
    const source = `const x = (a ?? b) || c;`;
    expect(rewriteMixedNullishLogicalExpressions(source)).toBe(source);
  });

  it("no-op on syntactically valid pure-?? or pure-|| chains", () => {
    const pureNullish = `const x = a ?? b ?? c ?? "fallback";`;
    const pureLogical = `const x = a || b || c || "fallback";`;
    expect(rewriteMixedNullishLogicalExpressions(pureNullish)).toBe(pureNullish);
    expect(rewriteMixedNullishLogicalExpressions(pureLogical)).toBe(pureLogical);
  });
});

describe("rewriteUnsafeStringCoercionCalls — non-SkillCraft shapes", () => {
  it("wraps (?? '').toLowerCase() in String() on GitHub-style payload", () => {
    const source = `const slug = (user.login ?? user.name ?? "").toLowerCase();`;
    const out = rewriteUnsafeStringCoercionCalls(source);
    expect(out).toContain(`String(user.login ?? user.name ?? "").toLowerCase()`);
  });

  it("wraps (?? '').includes() on OpenLibrary-style search", () => {
    const source = `const hit = (doc.title ?? "").includes(query);`;
    const out = rewriteUnsafeStringCoercionCalls(source);
    expect(out).toContain(`String(doc.title ?? "").includes(query)`);
  });

  it("pre-coerces `const x = a ?? b ?? \"\"` initialisations", () => {
    const source = `const name = user.full_name ?? user.login ?? "";\nconst slug = name.toLowerCase();`;
    const out = rewriteUnsafeStringCoercionCalls(source);
    expect(out).toContain(`const name = String(user.full_name ?? user.login ?? "");`);
  });

  it("no-op when receiver is already String(...)", () => {
    const source = `const slug = String(user.login ?? "").toLowerCase();`;
    expect(rewriteUnsafeStringCoercionCalls(source)).toBe(source);
  });

  it("idempotent: running twice equals running once", () => {
    const source = `const slug = (user.login ?? "").toLowerCase();`;
    const once = rewriteUnsafeStringCoercionCalls(source);
    const twice = rewriteUnsafeStringCoercionCalls(once);
    expect(twice).toBe(once);
  });
});

describe("rewriteDottedIndicatorOptionalAccess", () => {
  it("rewrites ?.SHORT.INDICATOR.NAMES to bracket access", () => {
    const source = `const v = entry?.GDP.PER.CAPITA;`;
    const out = rewriteDottedIndicatorOptionalAccess(source);
    expect(out).toContain(`entry?.["GDP.PER.CAPITA"]`);
  });

  it("does not touch ?. followed by lowercase property access", () => {
    const source = `const v = entry?.gdp.per.capita;`;
    expect(rewriteDottedIndicatorOptionalAccess(source)).toBe(source);
  });
});

describe("rewriteSnakeCaseObjectShorthandAliases", () => {
  it("aliases snake_case shorthand to existing camelCase binding", () => {
    const source = [
      "const fullName = user.name;",
      "const payload = { full_name, other: 1 };",
    ].join("\n");
    const out = rewriteSnakeCaseObjectShorthandAliases(source);
    expect(out).toContain(`full_name: fullName`);
  });

  it("no-op when both forms exist as declarations (no aliasing needed)", () => {
    const source = [
      "const fullName = 1;",
      "const full_name = 2;",
      "const payload = { full_name };",
    ].join("\n");
    expect(rewriteSnakeCaseObjectShorthandAliases(source)).toBe(source);
  });
});

describe("applyGenericSyntaxFixes — end-to-end on a realistic agent snippet", () => {
  it("fixes mixed ??/||, unsafe coercion, and dotted indicators in one pass", () => {
    const source = [
      `const title = String(repo.full_name ?? repo.name || "unknown");`,
      `const slug = (user.login ?? "").toLowerCase();`,
      `const ratio = entry?.GDP.PER.CAPITA;`,
    ].join("\n");
    const out = applyGenericSyntaxFixes(source);
    expect(out).toContain(`(repo.full_name ?? repo.name) || "unknown"`);
    expect(out).toContain(`String(user.login ?? "").toLowerCase()`);
    expect(out).toContain(`entry?.["GDP.PER.CAPITA"]`);
  });

  it("is idempotent on a snippet with multiple slip patterns", () => {
    const source = [
      `const title = String(repo.full_name ?? repo.name || "unknown");`,
      `const slug = (user.login ?? "").toLowerCase();`,
    ].join("\n");
    const once = applyGenericSyntaxFixes(source);
    const twice = applyGenericSyntaxFixes(once);
    expect(twice).toBe(once);
  });

  it("no-op on clean input that exercises none of the slip patterns", () => {
    const source = `const title = repo.name; const slug = String(user.login).toLowerCase();`;
    expect(applyGenericSyntaxFixes(source)).toBe(source);
  });
});

describe("renderAnswerKitSource", () => {
  it("emits valid TypeScript containing every helper named in ANSWER_KIT_HELPERS", () => {
    const out = renderAnswerKitSource();
    for (const helper of ANSWER_KIT_HELPERS) {
      expect(out).toContain(`export const ${helper}`);
    }
  });

  it("exports unwrap and rowsOf as part of the kit surface", () => {
    const out = renderAnswerKitSource();
    expect(out).toContain(`export const unwrap`);
    expect(out).toContain(`export const rowsOf`);
  });
});
