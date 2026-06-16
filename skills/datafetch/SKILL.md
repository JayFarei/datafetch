---
name: datafetch
description: Use the datafetch CLI to explore mounted dataset workspaces, write visible TypeScript intent programs, commit evidence-backed answers, and reuse tenant-local learned interfaces.
---

# datafetch

Datafetch is a dataset harness for coding agents. A dataset is mounted as a
small bash-shaped TypeScript workspace. Inspect freely, but the system only
learns from data-molding logic written into the workspace and run through
`datafetch`.

The normal loop: mount an intent workspace, inspect `AGENTS.md` / `df.d.ts` /
`db/` / `lib/`, run bounded probes through `scripts/scratch.ts`, put the
repeatable answer logic in `scripts/answer.ts`, `datafetch commit`, then answer
the user from `result/answer.json` and `result/answer.md`.

## Workspace Shape

Read these files first from the mounted workspace root:

- `AGENTS.md` (and its `CLAUDE.md` alias) - workspace guidance for this mount.
- `df.d.ts` - exact executable `df.db.*`, `df.lib.*`, and `df.tool.*` surface.
- `db/` - immutable dataset descriptors, samples, stats, and collection handles.
- `lib/` - tenant-local learned interfaces and helpers.
- `scripts/scratch.ts` - exploratory code for `datafetch run`.
- `scripts/answer.ts` - final visible intent program for `datafetch commit`.
- `result/` - committed answer, validation, lineage, replay test (`tmp/runs/N/`
  holds the same artifacts for uncommitted `run` probes).

Treat `db/` as read-only substrate context; `lib/` and `scripts/` are the
user-space seam where visible logic is written and later learned from.

## The df.* Surface

Inside a committed script you compose four namespaces (exact identifiers from
`df.d.ts`):

- `df.db.<ident>.findExact|search|findSimilar|hybrid(...)` - substrate
  retrieval over a mounted collection (the only source of real rows).
- `df.lib.<name>(input)` - a learned or seed interface; returns
  `Result<...>`, so read `.value` after awaiting.
- `df.tool.<bundle>.<tool>(input)` - dataset-provided tools resolved by the
  runtime bridge (fan-out, external fetch, classifiers, calculators). Compose
  them alongside `df.db.*`; pure `df.tool.*` fan-out with no substrate entry
  point is rejected.
- `df.answer(envelope)` - the committed answer.

## Composition Patterns

Prefer assembling the pipeline in one visible body over many tool round-trips.

### Pattern: substrate -> learned interface -> answer

```ts
const cands  = await df.db.cases.findSimilar(`${company} ${year} revenue`, 5);
const filing = (await df.lib.pickFiling({ question: `${company} ${year}`, candidates: cands })).value;
const figure = (await df.lib.locateFigure({ question: "total revenue", filing })).value;

return df.answer({
  status: "answered",
  value: figure.value,
  unit: figure.unit,
  evidence: [filing, figure],
  derivation: "findSimilar -> pickFiling -> locateFigure -> figure.value",
});
```

### Pattern: fan-out over a tool, then narrow deterministically

```ts
const hits   = await df.db.records.search(query, { limit: 50 });
const scored = await Promise.all(
  hits.map((h) => df.tool.ranker.score({ query, doc: h })),
);
const top    = hits
  .map((h, i) => ({ h, s: (scored[i] as { score: number }).score }))
  .sort((a, b) => b.s - a.s)[0]?.h;
return df.answer({ status: "answered", value: top, evidence: [top], derivation: "search -> df.tool.ranker.score -> argmax" });
```

### Pattern: crystallise the repeated trajectory as one callable `df.lib.*`

When the same fan-out recurs, externalise it through `fn({...})` so it can be
learned and called as `df.lib.<name>(input)` next time. An LLM-bearing step is
just a `body: agent({...})`:

```ts
export const classifyFiling = fn({
  intent: "classify a filing row into a reporting segment",
  examples: [{ input: { row: { /* ... */ } }, output: { segment: "operations" } }],
  input:  v.object({ row: v.unknown() }),
  output: v.object({ segment: v.string() }),
  body: agent({
    model: "anthropic/claude-haiku-4-5",
    prompt: `Given a filing row, return {segment} as one of: operations | financing | investing.`,
  }),
});
```

A later `scripts/answer.ts` then calls it like any interface:
`const { segment } = (await df.lib.classifyFiling({ row })).value;`. Use a plain
function body for deterministic work; use `agent({...})` only for judgment.

## CLI

Use the local data plane unless instructed otherwise. To get a workspace:
`datafetch list|inspect|add <dataset-url>` then
`datafetch mount <source-id> --tenant <tenant> --intent '<intent>'` (all accept
`--json`). Inside a mounted workspace:

```bash
datafetch apropos '<intent words>'   # find an existing df.lib.* interface
datafetch man df.lib.<name>          # inspect its contract
datafetch run scripts/scratch.ts     # bounded probe (artifacts, not the answer)
datafetch commit scripts/answer.ts   # final answer path; must return df.answer
```

## Discovery Order

Before composing from primitives: read `AGENTS.md` and `df.d.ts`, inspect
`db/` descriptors/stats/samples, run `datafetch apropos '<intent>'`, and if a
matching `df.lib.*` interface exists inspect it with `datafetch man` and try it
in `scripts/answer.ts` (let it answer, return partial, or abstain). Only if no
interface fits, write the missing trajectory visibly in TypeScript.

Do not assume collection names. Use exactly the identifiers printed in
`df.d.ts` (e.g. `df.db.train`, `df.db.events`, or whatever the mount exposes).

## Run Versus Commit

`datafetch run` is exploration: it writes numbered artifacts under `tmp/runs/`
but is not the accepted answer. `datafetch commit` is the final answer path; the
committed script must return `df.answer(...)`, and datafetch writes the answer,
validation, lineage, and replay test under `result/`. Only committed visible
code that passes validation is eligible for learning.

## Final Answer Contract

`scripts/answer.ts` must return `df.answer(...)` in one of three shapes:

```ts
return df.answer({ status: "answered", value, unit, evidence, coverage, derivation });
return df.answer({ status: "partial",  value, evidence, missing, coverage, derivation });
return df.answer({ status: "unsupported", evidence, missing, reason });
```

`evidence` points back to dataset rows, documents, or handles returned by
`df.db.*`. `derivation` describes the visible transformation, aggregation,
classification, or selection that produced the answer.

## Visible Logic Rule

Raw inspection and private reasoning are allowed, but private reasoning is not
learnable: if you dump rows, solve in your head, and answer in chat, the user
gets an answer but datafetch cannot improve. When the answer matters,
externalise retrieval, selection, normalization, validation, and derivation in
`scripts/answer.ts`. A good trajectory composes the surface above (`df.db.*`,
`df.lib.*`, `df.tool.*`, optional `scripts/helpers.ts`) and returns
`df.answer(...)` with evidence and derivation, or abstains with `unsupported`.

Avoid:

- fabricating records or evidence;
- answering from stdout instead of `result/`;
- broad unbounded reads without a sampling or pagination reason;
- changing the workspace intent silently.

## Intent Drift

The mounted intent is the worktree purpose. If exploration produces a narrower
useful sub-intent, declare it on the committed answer via an `intent` field
(`{ name, parent, relation, description }`) where `relation` is one of `same`
(satisfies the mount directly), `derived`/`sibling` (useful sub-trajectory in a
broader mount), or `drifted`/`unrelated` (worktree purpose changed).

## Agentic Steps

Probabilistic judgment belongs in a visible `agent({ prompt })` / `agent({ skill })`
body (see Composition Patterns), never in a private out-of-band LLM call whose
final number you then commit. Wrap judgment in committed code so lineage shows
where the agentic step entered the trajectory.

## What To Tell The User

After a successful commit, answer from the committed `result/` artifacts:
status, the value (or the reason it is unsupported), the evidence basis, any
coverage limitation, and where the artifacts live. If validation failed, say
what blocked the commit and keep iterating in the workspace until the final
answer path is accepted or safely unsupported.
