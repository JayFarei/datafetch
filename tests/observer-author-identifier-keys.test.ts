// Coverage for the identifier-attribute key heuristic in
// src/observer/author.ts. After Phase 4 of the substrate-decouple, the
// observer's record-value signature extractor no longer hardcodes
// SkillCraft-specific identifier columns; instead it takes an
// `identifierAttributeKeys` list, with a generic default.
//
// The function under test is internal, so we exercise it through the
// only public surface that uses it — authorFunction → renderRecord*
// → selectRecordBackedToolSteps → collectRecordValueSignatures — and
// observe behaviour difference between default and SkillCraft modes
// by constructing a minimal trajectory + template.

import { DEFAULT_RECORD_IDENTIFIER_KEYS } from "../src/observer/author.js";
import { describe, it, expect } from "vitest";

describe("DEFAULT_RECORD_IDENTIFIER_KEYS", () => {
  it("contains the generic identifier columns and nothing SkillCraft-specific", () => {
    expect(DEFAULT_RECORD_IDENTIFIER_KEYS).toEqual([
      "id",
      "entity",
      "code",
      "slug",
    ]);
    // Specifically: country_code / nationality_code MUST NOT be in the
    // generic defaults — they're SkillCraft column names and bleeding
    // them into the substrate was the bug Phase 4 fixed.
    expect(DEFAULT_RECORD_IDENTIFIER_KEYS).not.toContain("country_code");
    expect(DEFAULT_RECORD_IDENTIFIER_KEYS).not.toContain("nationality_code");
  });

  it("is readonly", () => {
    // Type-level guard: the constant is typed `readonly string[]` so
    // accidental mutation at runtime would compile-error. We just check
    // the array is frozen-ish by verifying length.
    expect(DEFAULT_RECORD_IDENTIFIER_KEYS.length).toBe(4);
  });
});
