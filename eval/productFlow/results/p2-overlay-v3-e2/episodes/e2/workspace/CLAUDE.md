<!-- datafetch:workspace-memory v3-patterns overlay -->
# Datafetch Workspace Memory (v3 — patterns + directive)

This workspace contains prior-learned helpers under `lib/`. Calling one is strictly cheaper than re-deriving its logic inline (the trajectory records ONE substrate step regardless of how many internal tool calls the helper makes), and the helper's body has already been validated on a real trajectory.

## Mandatory pre-flight check

**Before you write `scripts/answer.ts`, you MUST do this in order:**

1. `ls lib/__seed__/ lib/*/ 2>/dev/null` — see what helpers exist on disk.
2. `cat df.d.ts` — read the typed manifest. Every callable under `df.lib.*` is listed there with a JSDoc intent block.
3. Recognise which of the patterns below describes your task. If a matching `df.lib.<name>` exists for that pattern, you MUST call it.

## Patterns to recognise

The most common shapes auto-crystallise into reusable helpers. Recognise these from your task description **before** writing code:

| pattern | task shape | what to look for in `df.d.ts` |
| --- | --- | --- |
| **fan-out** | "do X for each of these entities" — repeated same tool over a list of ids | any `df.lib.<name>` whose JSDoc mentions "fan-out", "per-entity", "repeated tool", or "over an entity set" |
| **aggregation** | "count / sum / group X by Y" | any `df.lib.<name>` whose JSDoc mentions "summarise", "aggregate", "bucket", or "count" |
| **multi-hop composition** | "get A, then get B(A.id), then return…" | any `df.lib.<name>` whose JSDoc mentions "pipeline", "compose", or chains tool names |

If your task matches one of the above patterns AND `df.d.ts` shows a `df.lib.<name>` whose intent fits — use it. Single line: `await df.lib.<name>(input)`.

If no entry matches, use the tool primitives directly.

## Worked example

Task: "Fetch users 2, 3, 4 and return their names + emails."

Pattern: **fan-out** (same tool `getUser` over entity set `[2,3,4]`).

After `cat df.d.ts`, you might see a helper whose intent says "repeated tool fan-out". That's a match. Call it:

```ts
const result = await df.lib.<that-helper-name>({ entityValues: [2,3,4], toolBundle: "<bundle>", toolNames: ["<toolName>"], paramName: "<paramName>" });
// then read result.value and project to your output shape
```

Do NOT write `Promise.all([df.tool.X.getUser(...), df.tool.X.getUser(...), ...])` unless `df.d.ts` shows no fan-out helper.

## Output contract

When run, `scripts/answer.ts` must print exactly one JSON line on stdout (the gold answer) and nothing else.

## What NOT to do

- Do not invent `df.lib.<name>` names. Only call names you see declared in `df.d.ts`.
- Do not `cat` `df.d.ts` more than once per episode.
- Do not write a `Promise.all` loop without first checking `df.d.ts` for a matching helper for the pattern your task fits.
