import { describe, expect, it } from "vitest";

import {
  buildClaudeAgentArgs,
  parseClaudeAgentStdout,
} from "../src/eval/productFlow/agentInvocation.js";

describe("productFlow agent invocation helpers", () => {
  it("builds claude-p arguments with positional prompt and timeout", () => {
    expect(
      buildClaudeAgentArgs({
        claudeBin: "/usr/local/bin/claude-p",
        model: "claude-sonnet-4-6",
        prompt: "do the task",
        timeoutMs: 8 * 60 * 1000,
      }),
    ).toEqual([
      "--output-format", "json",
      "--model", "claude-sonnet-4-6",
      "--dangerously-skip-permissions",
      "--timeout", "480",
      "do the task",
    ]);
  });

  it("builds standard claude arguments with print mode and no session persistence", () => {
    expect(
      buildClaudeAgentArgs({
        claudeBin: "claude",
        model: "claude-sonnet-4-6",
        prompt: "do the task",
        timeoutMs: 1_000,
      }),
    ).toEqual([
      "--print",
      "--output-format", "json",
      "--model", "claude-sonnet-4-6",
      "--dangerously-skip-permissions",
      "--no-session-persistence",
      "do the task",
    ]);
  });

  it("parses final message, token usage, and cost from claude JSON output", () => {
    expect(
      parseClaudeAgentStdout(
        JSON.stringify({
          result: { ok: true },
          total_cost_usd: 0.123,
          usage: {
            input_tokens: 100,
            cache_read_input_tokens: 30,
            cache_creation_input_tokens: 5,
            output_tokens: 20,
          },
        }),
      ),
    ).toEqual({
      finalMessage: "{\"ok\":true}",
      totalCostUsd: 0.123,
      usage: {
        inputTokens: 100,
        cachedInputTokens: 35,
        outputTokens: 20,
      },
    });
  });

  it("falls back to trimmed stdout when the agent output is not JSON", () => {
    expect(parseClaudeAgentStdout("  plain answer\n")).toEqual({
      finalMessage: "plain answer",
      totalCostUsd: 0,
      usage: {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
      },
    });
  });
});
