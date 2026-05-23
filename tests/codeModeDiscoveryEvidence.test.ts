import { describe, expect, it } from "vitest";

import { analyzeCodeModeDiscoveryEvidence } from "../src/eval/codeModeDiscoveryEvidence.js";

describe("code-mode discovery evidence", () => {
  it("proves filesystem discovery only when inspection precedes helper selection", () => {
    const evidence = analyzeCodeModeDiscoveryEvidence([
      { source: "events.jsonl:1", text: JSON.stringify({ tool: "Bash", command: "ls && cat df.d.ts" }) },
      { source: "events.jsonl:2", text: JSON.stringify({ tool: "Bash", command: "rg toolFanout lib/" }) },
      { source: "events.jsonl:3", text: JSON.stringify({ tool: "Edit", source: "return await df.lib.toolFanout({})" }) },
    ]);

    expect(evidence.status).toBe("proven");
    expect(evidence.inspectedBeforeHelper).toBe(true);
    expect(evidence.inspectedSurfaces).toContain("df.d.ts");
    expect(evidence.inspectedSurfaces).toContain("lib/");
  });

  it("stays blocked when a helper call appears without prior inspection", () => {
    const evidence = analyzeCodeModeDiscoveryEvidence([
      { source: "agent-run.json", text: JSON.stringify({ result: "I called df.lib.toolFanout" }) },
    ]);

    expect(evidence.status).toBe("blocked");
    expect(evidence.helperCallSeen).toBe(true);
    expect(evidence.inspectedBeforeHelper).toBe(false);
  });

  it("does not treat prompt text as evidence unless the caller supplies it as an event", () => {
    const evidence = analyzeCodeModeDiscoveryEvidence([]);

    expect(evidence.status).toBe("blocked");
    expect(evidence.note).toContain("No non-prompt agent event artifacts");
  });
});
