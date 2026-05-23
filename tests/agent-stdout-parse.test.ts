import { describe, expect, it } from "vitest";

import { parseAgentStdout } from "../src/eval/finchainFullDatafetch.js";

describe("parseAgentStdout", () => {
  it("reads a single --output-format json result object", () => {
    const stdout = JSON.stringify({
      type: "result",
      subtype: "success",
      result: "done",
      num_turns: 4,
      usage: {
        input_tokens: 11,
        output_tokens: 1098,
        cache_read_input_tokens: 90000,
        cache_creation_input_tokens: 2477,
      },
    });
    const parsed = parseAgentStdout(stdout);
    expect(parsed.finalMessage).toBe("done");
    expect(parsed.inputTokens).toBe(11);
    expect(parsed.outputTokens).toBe(1098);
    expect(parsed.cachedInputTokens).toBe(92477);
    expect(parsed.llmCalls).toBe(4);
  });

  it("picks the final result line out of a stream-json NDJSON trace", () => {
    const stream = [
      JSON.stringify({ type: "system", subtype: "init", session_id: "s1" }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Bash", input: { command: "cat df.d.ts" } }] },
      }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Write", input: { content: "return df.lib.fooBar(x)" } }] },
      }),
      JSON.stringify({
        type: "result",
        subtype: "success",
        result: "wrote scripts/answer.ts",
        num_turns: 6,
        usage: { input_tokens: 5, output_tokens: 800, cache_read_input_tokens: 100 },
      }),
    ].join("\n");
    const parsed = parseAgentStdout(stream);
    // The final result line wins for answer + usage; intermediate assistant
    // turns (with no top-level result/usage) must not be mistaken for it.
    expect(parsed.finalMessage).toBe("wrote scripts/answer.ts");
    expect(parsed.outputTokens).toBe(800);
    expect(parsed.cachedInputTokens).toBe(100);
    expect(parsed.llmCalls).toBe(6);
  });

  it("falls back to raw text when there is no JSON result", () => {
    const parsed = parseAgentStdout("not json at all");
    expect(parsed.finalMessage).toBe("not json at all");
    expect(parsed.inputTokens).toBe(0);
    expect(parsed.llmCalls).toBe(0);
  });

  it("returns empty fields for empty stdout", () => {
    const parsed = parseAgentStdout("   ");
    expect(parsed.finalMessage).toBe("");
    expect(parsed.outputTokens).toBe(0);
  });
});
