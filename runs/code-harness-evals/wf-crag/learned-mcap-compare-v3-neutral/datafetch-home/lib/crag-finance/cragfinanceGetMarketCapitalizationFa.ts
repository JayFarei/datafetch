/* ---
name: cragfinanceGetMarketCapitalizationFa
status: provisional
description: |
  Learned datafetch interface for questions shaped like:
    "energy oil gas petroleum"
  Internally chains: tool.cragFinance.get_market_capitalization -> db.records.search -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization.
  Use when the user's question has the same task shape, even if
  the entity, metric, period, or wording differs. Prefer this before
  recomposing the primitive chain. Pass input as { ticker, query, opts };
  the runtime returns the last call's output.
trajectory: traj_20260602104801_1hp21g
shape-hash: 28d71a94
source-hash: ef93744b57b2bf54f9c000fcc0ed471e69f83f6cad9f2718b227791d2073822e
replay-contract: origin-and-heldout-replay-before-validation
change-contract: preserve-public-schema-call-graph-and-evidence-semantics
verifier: validate-examples-and-replay-before-promotion
rollback: quarantine-or-supersede-through-workspace-head
promotion-state: narrow
coverage-density: 1.00
step-count: 52
distinct-tools: 1
regal-gate-active: false
--- */

// Learned by datafetch observer from trajectory traj_20260602104801_1hp21g.
// @shape-hash: 28d71a94
// @intent-signature: tool→db→FANOUT(tool)
// @origin-trajectory: traj_20260602104801_1hp21g
// @origin-question: "const answer = df.answer.bind(df);"
// @steps: tool.cragFinance.get_market_capitalization -> db.records.search -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization

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

type Input = { ticker: string; query: string; opts?: Record<string, unknown> };

export const cragfinanceGetMarketCapitalizationFa = fn<Input, unknown>({
  intent: "reusable learned interface for the cragfinance_get_market_capitalization_fanout intent shape; internally composes tool.cragFinance.get_market_capitalization -> db.records.search -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization -> tool.cragFinance.get_market_capitalization",
  examples: [
    {
      input: {
  "ticker": "SHEL",
  "query": "energy oil gas petroleum",
  "opts": {
    "limit": 50
  }
},
      output: 107462558.76923075,
    },
  ],
  input: v.object({ ticker: v.string(), query: v.string(), opts: v.optional(v.record(v.string(), v.unknown())) }),
  output: v.unknown(),
  body: async (input: Input): Promise<unknown> => {
  const out0 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out1 = await df.db.records.search(input.query, input.opts);
  const out2 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out3 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out4 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out5 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out6 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out7 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out8 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out9 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out10 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out11 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out12 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out13 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out14 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out15 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out16 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out17 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out18 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out19 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out20 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out21 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out22 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out23 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out24 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out25 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out26 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out27 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out28 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out29 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out30 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out31 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out32 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out33 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out34 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out35 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out36 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out37 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out38 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out39 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out40 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out41 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out42 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out43 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out44 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out45 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out46 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out47 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out48 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out49 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out50 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  const out51 = await df.tool.cragFinance["get_market_capitalization"]({ ticker: input.ticker });
  return out51;
  },
});
