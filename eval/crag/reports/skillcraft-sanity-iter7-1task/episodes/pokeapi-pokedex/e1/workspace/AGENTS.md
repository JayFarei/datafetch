# Datafetch x SkillCraft Workspace

Write `scripts/answer.ts`. You may also write reusable learned interfaces under `lib/*.ts` for future episodes.
Use the official task prompt in `task.md` and the exact callable surface in `df.d.ts`. `df.d.ts` includes compact response-shape notes for tools; `tool_manifest.json` is only a last-resort fallback.
Call official SkillCraft tools through `df.tool.<bundle>["local-tool_name"]({ ... })`.
Available tool bundle(s): pokemon_tools.
Available exact tool names: local-pokemon_get_details, local-pokemon_get_species, local-pokemon_get_evolution, local-pokemon_get_moves, local-pokemon_get_abilities.
Use only the exact available tool names above. Do not infer, invent, or abbreviate endpoint names from `task_config.json` metadata.
Before making raw `df.tool` calls, inspect `lib/` and prefer `df.lib.<name>(...)` when a helper fits the task.
Only call helpers that are already listed in `df.d.ts`. A helper you create during this episode is saved for later learning, but it is not callable from the current `scripts/answer.ts` unless `df.d.ts` already listed it.
For repeated per-entity tool fan-out, use an existing learned helper first; if none is listed, use the seed `df.lib.per_entity(...)` instead of writing a raw `df.tool` loop in the final answer.
For reusable helpers, prefer accepting tool names and an argument object as input rather than hard-coding one level's exact endpoints.
Keep helper schemas permissive enough for the exact caller shape you use in `scripts/answer.ts`; for nested entity objects, prefer `v.unknown()` or a loose object over a brittle field set.
If `scripts/answer.ts` calls `df.lib.someHelper({ city: { name } })`, the helper input schema must accept `city.name`; do not require a different field like `city_name` unless the caller passes it.
Keep `scripts/answer.ts` as an executable script. Do not export from it; the harness calls the script and records its `df.answer(...)` return value.
Write the required output JSON file directly in this workspace using Node `fs/promises`.
Do not call `claim_done`; the harness runs the official evaluator after your script exits.
Finish with `return df.answer({ status: "answered", value, evidence, derivation })`.
Do not run live tool probes from Codex. In the sandbox, probe-time tool/network failures can be misleading. Use `df.d.ts` response-shape notes and write guarded code; the harness runs the final script once after the agent exits.
Cost matters: inspect targeted file sections only. Do not print full `tool_manifest.json`, full tool responses, or the full generated `scripts/answer.ts` unless a failure requires it.
Tool input hygiene:
- Treat human display labels as output text, not necessarily tool identifiers. For follow-up tool calls prefer machine fields returned by prior tools: `id`, `code`, `index`, `cca2`, `cca3`, `entity`, or explicit record attributes.
- If a tool description says an input can be an ISO/code/index, pass that code instead of a display name with spaces. If examples use lowercase hyphenated slugs, canonicalize generated labels with `String(value).trim().toLowerCase().replace(/\s+/g, "-")` before calling the tool.
- Do not call sequence/string-analysis tools with an empty string. If `task.md` lists literals like `ID: VALUE...`, use the visible `VALUE` prefix as the input literal when no mounted records or workspace files provide a fuller value.
- Avoid evidence-only dependent calls. If a tool category or class does not apply to an entity, skip that call and fill the required output from available response fields instead of forcing a failing probe.
Expected output file(s): pokedex_entries.json.
