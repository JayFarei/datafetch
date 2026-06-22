/* ---
name: cragfinanceGetMarketCapitalization
status: provisional
description: |
  Learned datafetch interface for questions shaped like:
    "const answer = df.answer.bind(df);"
  Internally chains: tool.cragFinance.get_market_capitalization.
  Use when the user's question has the same task shape, even if
  the entity, metric, period, or wording differs. Prefer this before
  recomposing the primitive chain. Pass input as { ticker };
  the runtime returns the last call's output.
trajectory: traj_20260602104801_1hp21g
shape-hash: 4779b9d3
source-hash: ef93744b57b2bf54f9c000fcc0ed471e69f83f6cad9f2718b227791d2073822e
replay-contract: origin-and-heldout-replay-before-validation
change-contract: preserve-public-schema-call-graph-and-evidence-semantics
verifier: validate-examples-and-replay-before-promotion
rollback: quarantine-or-supersede-through-workspace-head
promotion-state: narrow
coverage-density: 1.00
step-count: 53
distinct-tools: 1
regal-gate-active: false
--- */

// Learned by datafetch observer from trajectory traj_20260602104801_1hp21g.
// @shape-hash: 4779b9d3
// @intent-signature: db→tool→db→FANOUT(tool)
// @origin-trajectory: traj_20260602104801_1hp21g
// @origin-question: "const answer = df.answer.bind(df);"
// @steps: tool.cragFinance.get_market_capitalization

import { fn } from "file:///Users/jayfarei/src/tries/2026-05-01-hackathon/.claude/worktrees/code-harness-evals/src/sdk/index.ts";
import * as v from "file:///Users/jayfarei/src/tries/2026-05-01-hackathon/node_modules/.pnpm/valibot@1.3.1_typescript@5.9.3/node_modules/valibot/dist/index.mjs";

// Learned interface composition. The function body uses the snippet runtime's
// global `df` to call the same primitives the originating trajectory
// recorded.
declare const df: {
  db: Record<string, {
    findExact(filter: Record<string, unknown>, limit?: number): Promise<unknown[]>;
    search(query: string, opts?: { limit?: number }): Promise<unknown[]>;
    findSimilar(query: string, limit?: number): Promise<unknown[]>;
    hybrid(query: string, opts?: { limit?: number }): Promise<unknown[]>;
  }>;
  lib: Record<string, (input: unknown) => Promise<{ value: unknown }>>;
};

type Input = { ticker: string };

export const cragfinanceGetMarketCapitalization = fn<Input, unknown>({
  intent: "reusable learned interface for the cragfinance_get_market_capitalization intent shape; internally composes tool.cragFinance.get_market_capitalization",
  examples: [
    {
      input: {},
      output: 107462558.76923075,
    },
  ],
  input: v.object({ ticker: v.string() }),
  output: v.unknown(),
  body: async (input: Input): Promise<unknown> => {
  const out52 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  return out52;
  },
});
