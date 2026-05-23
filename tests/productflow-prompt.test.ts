import { describe, expect, it } from "vitest";

import {
  assertNoHelperNameLeak,
  renderEpisodePrompt,
  type ProductFlowEpisodeSpec,
} from "../src/eval/productFlow/prompt.js";

const episode: ProductFlowEpisodeSpec = {
  id: "e4",
  question:
    'Fetch every user from the jsonplaceholder tool bundle, and for each user count how many posts they have authored. Write `scripts/answer.ts` so that running it prints a JSON array of `{"name": "...", "postCount": <integer>}` objects sorted by postCount descending, with ties broken by name ascending.',
  gold: [],
};

describe("productFlow prompt rendering", () => {
  it("keeps workspace-lib prompts on the typed answer boundary", () => {
    const prompt = renderEpisodePrompt({
      arm: "substrate-on",
      episode,
      manifestInline: false,
      workspaceLib: true,
    });

    expect(prompt).toContain('df.answer({ status: "answered", value })');
    expect(prompt).toContain("return df.answer({");
    expect(prompt).toContain("Before writing `scripts/answer.ts`, inspect `df.d.ts` and `lib/`");
    expect(prompt).toContain("repeated entity/tool fan-out");
    expect(prompt).toContain("full input shape shown in `df.d.ts`");
    expect(prompt).not.toContain("console.log");
    expect(prompt).not.toContain("prints");
    expect(prompt).not.toContain("Available tool bundles");
    expect(prompt).not.toContain("Available substrate primitives");
    expect(prompt).not.toContain("per_entity");
    expect(prompt).not.toMatch(/\bdf\.lib\.[A-Za-z_][A-Za-z0-9_]*\b/);
    expect(() =>
      assertNoHelperNameLeak(prompt, episode.id, "substrate-on", false),
    ).not.toThrow();
  });

  it("leaves legacy non-workspace prompts on stdout JSON", () => {
    const prompt = renderEpisodePrompt({
      arm: "substrate-off",
      episode,
      manifestInline: false,
      workspaceLib: false,
    });

    expect(prompt).toContain("prints a JSON array");
    expect(prompt).toContain("console.log");
    expect(prompt).toContain("Available tool bundles");
    expect(prompt).toContain("Available substrate primitives");
  });

  it("allows helper names inside an inlined manifest but not outside it", () => {
    const prompt = renderEpisodePrompt({
      arm: "substrate-on",
      episode,
      manifestInline: true,
      workspaceLib: false,
      inlinedManifest: "declare const df: { lib: { per_entity(): unknown } };",
    });

    expect(() =>
      assertNoHelperNameLeak(prompt, episode.id, "substrate-on", true),
    ).not.toThrow();
    expect(() =>
      assertNoHelperNameLeak(`${prompt}\nCall df.lib.per_entity now.`, episode.id, "substrate-on", true),
    ).toThrow(/helper-name-leak/);
  });
});
