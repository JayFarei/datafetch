import { describe, expect, it } from "vitest";

import { extractPromotedValuesFromSource } from "../src/observer/quarantineValidator.js";

// Phase 2 (#2, gate-replay half): the gate's promoted-literal extractor used to
// be numeric-only; it now also promotes string + boolean literals so a helper
// with non-numeric inputs can be replayed/validated. Numeric arithmetic
// extraction is unchanged.
describe("extractPromotedValuesFromSource (string/boolean literal promotion)", () => {
  const src = (body: string) =>
    `const answer = df.answer.bind(df);\nasync function main() {\n${body}\n  return answer({ status: "answered", value: 0 });\n}\nreturn await main();\n`;

  it("still extracts numeric literals + arithmetic (unchanged behaviour)", () => {
    const out = extractPromotedValuesFromSource(
      src("  const principal = 1000;\n  const rate = -2.5;\n  const computed = 2 * 3;"),
    );
    expect(out.principal).toBe(1000);
    expect(out.rate).toBe(-2.5);
    expect(out.computed).toBe(6);
  });

  it("now also promotes string literals", () => {
    const out = extractPromotedValuesFromSource(
      src(`  const country = "Japan";\n  const tier = 'gold';`),
    );
    expect(out.country).toBe("Japan");
    expect(out.tier).toBe("gold");
  });

  it("now also promotes boolean literals", () => {
    const out = extractPromotedValuesFromSource(
      src("  const includeArchived = true;\n  const draft = false;"),
    );
    expect(out.includeArchived).toBe(true);
    expect(out.draft).toBe(false);
  });

  it("promotes a mixed-type input set in one helper", () => {
    const out = extractPromotedValuesFromSource(
      src(`  const years = 5;\n  const horizon = "long-term";\n  const active = true;`),
    );
    expect(out).toMatchObject({ years: 5, horizon: "long-term", active: true });
  });

  it("ignores non-literal initializers (function calls, identifiers)", () => {
    const out = extractPromotedValuesFromSource(
      src("  const rows = await df.db.records.findExact({}, 9);\n  const principal = 1000;"),
    );
    expect(out.principal).toBe(1000);
    expect(out).not.toHaveProperty("rows");
  });
});
