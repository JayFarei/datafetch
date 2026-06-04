import { describe, expect, it } from "vitest";

import { groupCragSiblings } from "../src/eval/cragSiblings.js";
import { loadCragRows, resolveCragJsonlPath } from "../src/eval/cragCorpus.js";
import type { CragRow } from "../src/eval/cragCorpus.js";

// C4 live-prep #3: group real CRAG questions into (domain, question_type)
// sibling families so a crystallised helper can be reused on a held-out sibling
// (the research's 0/16-reuse blocker). Logic is tested on synthetic rows
// (always runs); a skipIf-guarded check confirms real CRAG produces usable
// families.

function row(domain: string, questionType: string, i: number): CragRow {
  return {
    interactionId: `${domain}-${questionType}-${i}`,
    query: `${domain} ${questionType} question ${i}`,
    gold: `gold-${i}`,
    questionType,
    staticOrDynamic: "static",
    domain,
    queryTime: "",
    answerType: questionType === "false_premise" ? "invalid" : "valid",
  };
}

describe("groupCragSiblings", () => {
  const synth: CragRow[] = [
    ...Array.from({ length: 5 }, (_, i) => row("finance", "simple", i)),
    ...Array.from({ length: 3 }, (_, i) => row("sports", "comparison", i)),
    ...Array.from({ length: 1 }, (_, i) => row("movie", "simple", i)), // too small
    ...Array.from({ length: 2 }, (_, i) => row("music", "false_premise", i)),
  ];

  it("forms (domain,question_type) families with a build/held-out split", () => {
    const fams = groupCragSiblings(synth, { buildSize: 2, heldOutSize: 1 });
    const fin = fams.find((f) => f.key === "finance:simple")!;
    expect(fin.domain).toBe("finance");
    expect(fin.questionType).toBe("simple");
    expect(fin.build).toHaveLength(2);
    expect(fin.heldOut).toHaveLength(1);
    // held-out is a distinct sibling from the build set
    const buildIds = new Set(fin.build.map((r) => r.interactionId));
    expect(buildIds.has(fin.heldOut[0]!.interactionId)).toBe(false);
    // every member shares the family key
    for (const r of [...fin.build, ...fin.heldOut]) {
      expect(`${r.domain}:${r.questionType}`).toBe("finance:simple");
    }
  });

  it("drops families below minFamily and orders by reuse density", () => {
    const fams = groupCragSiblings(synth, { buildSize: 2, heldOutSize: 1 });
    expect(fams.find((f) => f.key === "movie:simple")).toBeUndefined(); // only 1 member
    expect(fams[0]!.key).toBe("finance:simple"); // most populous first
  });

  it("can exclude false-premise families", () => {
    const withFp = groupCragSiblings(synth, { buildSize: 1, heldOutSize: 1, minFamily: 2 });
    expect(withFp.some((f) => f.questionType === "false_premise")).toBe(true);
    const without = groupCragSiblings(synth, { buildSize: 1, heldOutSize: 1, minFamily: 2, excludeFalsePremise: true });
    expect(without.some((f) => f.questionType === "false_premise")).toBe(false);
  });

  const CRAG_PATH = resolveCragJsonlPath();
  it.skipIf(!CRAG_PATH)("real CRAG yields reusable families on common (domain,type) cells", async () => {
    const rows = await loadCragRows({ limit: 800 });
    const fams = groupCragSiblings(rows, { buildSize: 2, heldOutSize: 1, excludeFalsePremise: true, maxFamilies: 10 });
    expect(fams.length).toBeGreaterThan(0);
    for (const f of fams) {
      expect(f.build.length).toBe(2);
      expect(f.heldOut.length).toBe(1);
      expect(f.questionType).not.toBe("false_premise");
    }
  });
});
