<!-- datafetch:workspace-memory v2-directive overlay -->
# Datafetch Workspace Memory (v2 — strong reuse directive)

This workspace contains prior-learned helpers under `lib/`. The substrate has already validated them on real trajectories; calling one is strictly cheaper than re-deriving its logic inline, and the trajectory records ONE substrate step regardless of how many internal tool calls the helper makes.

## Mandatory pre-flight check

**Before you write `scripts/answer.ts`, you MUST do this in order:**

1. `ls lib/__seed__/ lib/*/ 2>/dev/null` — see what helpers exist on disk.
2. `cat df.d.ts` — read the typed manifest. Every callable under `df.lib.*` is listed there with a JSDoc intent block.
3. Scan the `df.lib.*` entries against your task. If any entry's intent matches what you would otherwise write as a loop or composition, you MUST call it.

## When to prefer a helper

A `df.lib.<name>` helper is the right path whenever:

- You would otherwise write `Promise.all(...)` or a loop over an entity set calling the same tool — that pattern is a fan-out, and any matching fan-out helper should be used.
- You would otherwise chain multiple `df.tool.*` calls into a composed pipeline (fetch A, then B(A.id), then aggregate) — that pattern is a composition, and any matching composition helper should be used.
- The helper's typed input shape covers your task's parameters even if the helper does *more* than you need; the extra work is free at the substrate level.

If `df.d.ts` shows no entry whose intent matches, then use the tool primitives directly. Otherwise, prefer the helper.

## Output contract

When run, `scripts/answer.ts` must print exactly one JSON line on stdout (the gold answer) and nothing else. The harness JSON-parses the last `{...}` or `[...]` line.

## What NOT to do

- Do not invent `df.lib.<name>` names. Only call names you see declared in `df.d.ts`.
- Do not `cat` `df.d.ts` more than once per episode.
- Do not write a `Promise.all` loop without first checking `df.d.ts` for a matching fan-out helper.
